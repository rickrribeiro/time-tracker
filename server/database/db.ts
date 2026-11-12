import initSqlJs, { Database } from 'sql.js'
import { dataDir } from '../config'
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
  },
  {
    version: 11,
    label: 'projects.localPath',
    run: (db) => {
      try {
        db.run('ALTER TABLE projects ADD COLUMN localPath TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 12,
    label: 'projects business pipeline fields',
    run: (db) => {
      // existing projects (work repos) default to the "trabalho" stage
      try { db.run("ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT 'trabalho';") } catch { /* exists */ }
      try { db.run('ALTER TABLE projects ADD COLUMN businessModel TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE projects ADD COLUMN pricing TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE projects ADD COLUMN audience TEXT;') } catch { /* exists */ }
    }
  },
  {
    version: 13,
    label: 'todos.type',
    run: (db) => {
      // existing tasks default to the "projeto" kind
      try { db.run("ALTER TABLE todos ADD COLUMN type TEXT NOT NULL DEFAULT 'projeto';") } catch { /* exists */ }
    }
  },
  {
    version: 14,
    label: 'study_review_log backfill from lastReviewedAt',
    run: (db) => {
      // Seed the append-only review log with one row per already-reviewed card,
      // so the heatmap isn't empty for existing databases. New reviews append going forward.
      try {
        db.run(
          `INSERT INTO study_review_log (flashcardId, topicId, rating, reviewedAt)
           SELECT id, topicId, NULL, lastReviewedAt
           FROM study_flashcards
           WHERE lastReviewedAt IS NOT NULL AND lastReviewedAt <> ''`
        )
      } catch {
        // table missing or already seeded
      }
    }
  },
  {
    version: 15,
    label: 'contacts.country + contacts.state',
    run: (db) => {
      try { db.run('ALTER TABLE contacts ADD COLUMN country TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE contacts ADD COLUMN state TEXT;') } catch { /* exists */ }
    }
  },
  {
    version: 16,
    label: 'Central de Projetos: situação, área, foco, ciclos, vínculos com timer/todos',
    run: (db) => {
      const cols: [string, string][] = [
        ['status', "TEXT NOT NULL DEFAULT 'incubadora'"], // incubadora|fila|foco|pausado|concluido|encerrado
        ['area', "TEXT NOT NULL DEFAULT 'pessoal'"], // pessoal | profissional
        ['priority', 'INTEGER NOT NULL DEFAULT 0'],
        ['finishLine', 'TEXT'],
        ['scope', 'TEXT'],
        ['futureIdeas', 'TEXT'],
        ['nextAction', 'TEXT'],
        ['nextActionAt', 'TEXT'],
        ['whereLeftOff', 'TEXT'],
        ['whereLeftOffAt', 'TEXT'],
        ['blocker', 'TEXT'],
        ['blockerNeed', 'TEXT'],
        ['pauseReason', 'TEXT'],
        ['resumeAt', 'TEXT'],
        ['resumeCondition', 'TEXT'],
        ['closeReason', 'TEXT'],
        ['retrospective', 'TEXT'],
        ['closedAt', 'TEXT'],
        ['statusChangedAt', 'TEXT'],
        ['continuous', 'INTEGER NOT NULL DEFAULT 0'],
        ['triagedAt', 'TEXT'],
        ['lastReviewedAt', 'TEXT'],
        ['createdAt', 'TEXT']
      ]
      for (const [c, def] of cols) {
        try { db.run(`ALTER TABLE projects ADD COLUMN ${c} ${def};`) } catch { /* exists */ }
      }
      try { db.run('ALTER TABLE project_milestones ADD COLUMN cycleId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE project_milestones ADD COLUMN description TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE tasks ADD COLUMN projectId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE tags ADD COLUMN projectId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE todos ADD COLUMN milestoneId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE todos ADD COLUMN doneAt TEXT;') } catch { /* exists */ }
      // Dados existentes: "trabalho" era área disfarçada de estágio → estágio indefinido (triagem decide).
      // "morto"/arquivado → encerrado. Projetos antigos entram na incubadora até a triagem.
      const now = new Date().toISOString()
      try {
        db.run("UPDATE projects SET status = 'encerrado', closedAt = COALESCE(closedAt, ?) WHERE archived = 1 OR stage = 'morto'", [now])
        db.run("UPDATE projects SET stage = '' WHERE stage IN ('trabalho', 'morto')")
        db.run('UPDATE projects SET createdAt = ? WHERE createdAt IS NULL', [now])
        db.run('UPDATE projects SET statusChangedAt = ? WHERE statusChangedAt IS NULL', [now])
        db.run("UPDATE todos SET doneAt = createdAt WHERE status = 'done' AND doneAt IS NULL")
      } catch {
        // best-effort backfill
      }
    }
  },
  {
    version: 17,
    label: 'Projetos: tamanho da próxima ação, dias da semana, changelog de ciclo',
    run: (db) => {
      const cols: [string, string, string][] = [
        ['projects', 'nextActionSize', 'TEXT'], // rapida (⚡ 15 min) | longa (🧠 2 h)
        ['projects', 'workDays', 'TEXT'], // JSON: [2,4] (0=dom … 6=sáb)
        ['projects', 'workStart', 'TEXT'], // HH:MM do bloco
        ['projects', 'workMinutes', 'INTEGER'],
        ['projects', 'calendarEventId', 'TEXT'], // evento recorrente no Google
        ['projects', 'calendarAccount', 'TEXT'],
        ['project_cycles', 'changelog', 'TEXT']
      ]
      for (const [t, c, def] of cols) {
        try { db.run(`ALTER TABLE ${t} ADD COLUMN ${c} ${def};`) } catch { /* exists */ }
      }
    }
  },
  {
    version: 18,
    label: 'Pessoas: prioridade e VIP (Central de Mensagens)',
    run: (db) => {
      const cols: [string, string][] = [
        ['priority', "TEXT NOT NULL DEFAULT 'normal'"], // alta | normal | baixa
        ['vip', 'INTEGER NOT NULL DEFAULT 0']
      ]
      for (const [c, def] of cols) {
        try { db.run(`ALTER TABLE contacts ADD COLUMN ${c} ${def};`) } catch { /* exists */ }
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

  dbPath = dbFilePath()

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

/** Absolute path of the live database file. */
export function dbFilePath(): string {
  return path.join(dataDir(), 'timetracker.db')
}

/** Replace the live DB with the given bytes (import). The next getDb() reloads it. */
export function replaceDbFile(bytes: Buffer): void {
  closeDb()
  fs.writeFileSync(dbFilePath(), bytes)
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
  const dir = path.join(dataDir(), 'snapshots')
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
  // only files inside snapshots/ can be restored (the path comes from the client)
  const resolved = path.resolve(snapPath)
  if (path.dirname(resolved) !== path.resolve(snapshotsDir())) return false
  if (!dbPath || !fs.existsSync(resolved)) return false
  closeDb()
  fs.copyFileSync(resolved, dbPath)
  return true
}
