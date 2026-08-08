import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { SCHEMA } from './schema'

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
