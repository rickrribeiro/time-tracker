import initSqlJs, { Database } from 'sql.js'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { SCHEMA } from './schema'

let db: Database | null = null
let dbPath: string

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

  // Migration: Add secondaryTagId to tasks if it doesn't exist
  try {
    db.run('ALTER TABLE tasks ADD COLUMN secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL;')
  } catch (e) {
    // Column likely already exists
  }

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
