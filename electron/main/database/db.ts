import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { SCHEMA } from './schema'
import { seedAiLibrary } from './aiSeeds'

let db: Database | null = null
let dbPath: string

/**
 * Lightweight migration runner keyed on `PRAGMA user_version`.
 * `SCHEMA` (CREATE TABLE IF NOT EXISTS) handles fresh databases; migrations
 * below carry schema changes to tables that already exist in older databases.
 * Each `run` must be idempotent (guarded) so re-runs are safe.
 */
interface Migration {
  version: number
  label: string
  run: (db: Database) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    label: 'tasks.secondaryTagId',
    run: (db) => {
      try {
        db.run('ALTER TABLE tasks ADD COLUMN secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 2,
    label: 'projects.claudeCommand',
    run: (db) => {
      try {
        db.run('ALTER TABLE projects ADD COLUMN claudeCommand TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 3,
    label: 'github_issues.local + body',
    run: (db) => {
      try {
        db.run('ALTER TABLE github_issues ADD COLUMN local INTEGER NOT NULL DEFAULT 0;')
      } catch {
        // column already exists
      }
      try {
        db.run('ALTER TABLE github_issues ADD COLUMN body TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 4,
    label: 'investment_history + backfill current month',
    run: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS investment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        investmentId INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0
      );`)
      // Seed one snapshot for the current month from each investment's existing amount,
      // so the evolution chart has a starting point on already-populated databases.
      try {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        db.run(
          `INSERT INTO investment_history (investmentId, month, amount)
           SELECT id, ?, amount FROM investments
           WHERE id NOT IN (SELECT investmentId FROM investment_history WHERE month = ?);`,
          [month, month]
        )
      } catch {
        // best-effort backfill
      }
    }
  },
  {
    version: 5,
    label: 'links.tags',
    run: (db) => {
      try {
        db.run("ALTER TABLE links ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';")
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 6,
    label: 'todos.aiGenerated',
    run: (db) => {
      try {
        db.run('ALTER TABLE todos ADD COLUMN aiGenerated INTEGER NOT NULL DEFAULT 0;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 7,
    label: 'tasks.studyNodeId',
    run: (db) => {
      try {
        db.run('ALTER TABLE tasks ADD COLUMN studyNodeId INTEGER;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 8,
    label: 'habit_entries.completedAt',
    run: (db) => {
      try {
        db.run('ALTER TABLE habit_entries ADD COLUMN completedAt TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 9,
    label: 'todos.recurrence',
    run: (db) => {
      try {
        db.run('ALTER TABLE todos ADD COLUMN recurrence TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 10,
    label: 'links.lastOpenedAt',
    run: (db) => {
      try {
        db.run('ALTER TABLE links ADD COLUMN lastOpenedAt TEXT;')
      } catch {
        // column already exists
      }
    }
  }
]

function getUserVersion(database: Database): number {
  const res = database.exec('PRAGMA user_version')
  const v = res[0]?.values?.[0]?.[0]
  return typeof v === 'number' ? v : 0
}

function runMigrations(database: Database): void {
  const current = getUserVersion(database)
  const target = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0)
  if (current >= target) return
  for (const m of MIGRATIONS) {
    if (m.version > current) m.run(database)
  }
  // target is derived from our own literal array → safe to inline (PRAGMA can't bind params)
  database.run(`PRAGMA user_version = ${target}`)
}

export async function getDb(): Promise<Database> {
  if (db) return db

  dbPath = path.join(app.getPath('userData'), 'timetracker.db')

  // Locate wasm relative to sql.js module itself (works in dev + production)
  const sqlJsModulePath = require.resolve('sql.js')
  const wasmPath = path.join(path.dirname(sqlJsModulePath), 'sql-wasm.wasm')

  const SQL = await initSqlJs({
    locateFile: () => wasmPath
  })

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON;')
  db.run(SCHEMA)
  runMigrations(db)
  seedAiLibrary(db)

  saveDb()

  return db
}

export function saveDb(): void {
  if (!db || !dbPath) return
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export function closeDb(): void {
  if (db) {
    saveDb()
    db.close()
    db = null
  }
}

// ── Daily local snapshots (versioning) ────────────────────────────────────────
const SNAP_KEEP = 3

function snapshotsDir(): string {
  const dir = path.join(app.getPath('userData'), 'snapshots')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export interface SnapshotInfo {
  name: string
  path: string
  date: string // ISO (mtime)
  size: number
}

export function listSnapshots(): SnapshotInfo[] {
  const dir = snapshotsDir()
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const p = path.join(dir, f)
      const s = fs.statSync(p)
      return { name: f, path: p, date: s.mtime.toISOString(), size: s.size }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** Copy the current DB to snapshots/ once per day (YYYY-MM-DD), pruning to SNAP_KEEP. */
export function snapshotDailyIfNeeded(): void {
  if (!dbPath || !fs.existsSync(dbPath)) return
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dir = snapshotsDir()
  const target = path.join(dir, `timetracker_${day}.sqlite`)
  try {
    if (!fs.existsSync(target)) {
      saveDb()
      fs.copyFileSync(dbPath, target)
    }
    // prune oldest beyond SNAP_KEEP
    const all = listSnapshots()
    for (const old of all.slice(SNAP_KEEP)) {
      try {
        fs.unlinkSync(old.path)
      } catch {
        // ignore
      }
    }
  } catch {
    // best-effort; never block boot
  }
}

/** Restore a snapshot: overwrite the live DB file and reset the in-memory handle. */
export function restoreSnapshot(snapPath: string): boolean {
  if (!dbPath || !fs.existsSync(snapPath)) return false
  closeDb()
  fs.copyFileSync(snapPath, dbPath)
  return true
}
