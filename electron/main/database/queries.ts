import { Database } from 'sql.js'
import { getDb, saveDb } from './db'

export interface DbTag {
  id: number
  name: string
  color: string
  isProductive: number
}

export interface DbTask {
  id: number
  title: string
  tagId: number | null
  secondaryTagId: number | null
  startTime: string
  endTime: string | null
}

export interface DbTaskWithTag extends DbTask {
  tagName: string | null
  tagColor: string | null
  tagIsProductive: number | null
  secondaryTagName: string | null
  secondaryTagColor: string | null
}

export interface DailyStats {
  date: string
  totalMinutes: number
  productiveMinutes: number
  semiProductiveMinutes: number
  productiveErosMinutes: number
}

export interface TagStats {
  tagId: number | null
  tagName: string | null
  tagColor: string | null
  isProductive: number | null
  totalMinutes: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// sql.js does NOT support params in db.exec() — always use prepare+step for parameterized queries

function getOne<T>(db: Database, sql: string, params: (string | number | null)[] = []): T | null {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  if (stmt.step()) {
    const obj = stmt.getAsObject() as T
    stmt.free()
    return obj
  }
  stmt.free()
  return null
}

function getAll<T>(db: Database, sql: string, params: (string | number | null)[] = []): T[] {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

function run(db: Database, sql: string, params: (string | number | null)[] = []): void {
  const stmt = db.prepare(sql)
  stmt.run(params)
  stmt.free()
  saveDb()
}

function lastInsertId(db: Database): number {
  const stmt = db.prepare('SELECT last_insert_rowid() as id')
  stmt.step()
  const id = stmt.getAsObject().id as number
  stmt.free()
  return id
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function getAllTags(): Promise<DbTag[]> {
  const db = await getDb()
  return getAll<DbTag>(db, 'SELECT * FROM tags ORDER BY id')
}

export async function createTag(name: string, color: string, isProductive: number): Promise<DbTag> {
  const db = await getDb()
  run(db, 'INSERT INTO tags (name, color, isProductive) VALUES (?, ?, ?)', [
    name,
    color,
    isProductive
  ])
  const id = lastInsertId(db)
  return getOne<DbTag>(db, 'SELECT * FROM tags WHERE id = ?', [id])!
}

export async function updateTag(
  id: number,
  name: string,
  color: string,
  isProductive: number
): Promise<DbTag> {
  const db = await getDb()
  run(db, 'UPDATE tags SET name = ?, color = ?, isProductive = ? WHERE id = ?', [
    name,
    color,
    isProductive,
    id
  ])
  return getOne<DbTag>(db, 'SELECT * FROM tags WHERE id = ?', [id])!
}

export async function deleteTag(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE tasks SET tagId = 1 WHERE tagId = ?', [id])
  run(db, 'DELETE FROM tags WHERE id = ?', [id])
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const TASK_WITH_TAG_SQL = `
  SELECT t.id, t.title, t.tagId, t.secondaryTagId, t.startTime, t.endTime,
         tg.name as tagName, tg.color as tagColor, tg.isProductive as tagIsProductive,
         stg.name as secondaryTagName, stg.color as secondaryTagColor
  FROM tasks t
  LEFT JOIN tags tg ON t.tagId = tg.id
  LEFT JOIN tags stg ON t.secondaryTagId = stg.id
`

export async function getTasksForRange(startDate: string, endDate: string): Promise<DbTaskWithTag[]> {
  const db = await getDb()
  return getAll<DbTaskWithTag>(
    db,
    `${TASK_WITH_TAG_SQL}
     WHERE t.startTime >= ? AND t.startTime < ?
     ORDER BY t.startTime ASC`,
    [startDate, endDate]
  )
}

export async function getAllTasks(): Promise<DbTaskWithTag[]> {
  const db = await getDb()
  return getAll<DbTaskWithTag>(
    db,
    `${TASK_WITH_TAG_SQL} ORDER BY t.startTime DESC`
  )
}

export async function getActiveTask(): Promise<DbTaskWithTag | null> {
  const db = await getDb()
  return getOne<DbTaskWithTag>(
    db,
    `${TASK_WITH_TAG_SQL}
     WHERE t.endTime IS NULL
     ORDER BY t.startTime DESC
     LIMIT 1`
  )
}

export async function createTask(
  title: string,
  tagId: number | null,
  secondaryTagId: number | null,
  startTime: string
): Promise<DbTask> {
  const db = await getDb()
  run(db, 'INSERT INTO tasks (title, tagId, secondaryTagId, startTime) VALUES (?, ?, ?, ?)', [
    title,
    tagId,
    secondaryTagId,
    startTime
  ])
  const id = lastInsertId(db)
  return { id, title, tagId, secondaryTagId, startTime, endTime: null }
}

export async function updateTask(
  id: number,
  title: string,
  tagId: number | null,
  secondaryTagId: number | null,
  startTime: string,
  endTime: string | null
): Promise<DbTask> {
  const db = await getDb()
  run(
    db,
    'UPDATE tasks SET title = ?, tagId = ?, secondaryTagId = ?, startTime = ?, endTime = ? WHERE id = ?',
    [title, tagId, secondaryTagId, startTime, endTime, id]
  )
  return { id, title, tagId, secondaryTagId, startTime, endTime }
}

export async function stopTask(id: number, endTime: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE tasks SET endTime = ? WHERE id = ?', [endTime, id])
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM tasks WHERE id = ?', [id])
}

export async function stopAllActiveTasks(endTime: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE tasks SET endTime = ? WHERE endTime IS NULL', [endTime])
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getDailyStats(startDate: string, endDate: string): Promise<DailyStats[]> {
  const db = await getDb()
  return getAll<DailyStats>(
    db,
    `SELECT
       substr(t.startTime, 1, 10) as date,
       SUM(
         CASE
           WHEN t.endTime IS NOT NULL
           THEN CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER)
           ELSE 0
         END
       ) as totalMinutes,
       SUM(
         CASE
           WHEN tg.isProductive = 1 AND t.endTime IS NOT NULL
           THEN CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER)
           ELSE 0
         END
       ) as productiveMinutes,
       SUM(
         CASE
           WHEN tg.isProductive = 2 AND t.endTime IS NOT NULL
           THEN CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER)
           ELSE 0
         END
       ) as semiProductiveMinutes,
       SUM(
         CASE
           WHEN tg.isProductive = 3 AND t.endTime IS NOT NULL
           THEN CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER)
           ELSE 0
         END
       ) as productiveErosMinutes
     FROM tasks t
     LEFT JOIN tags tg ON t.tagId = tg.id
     WHERE t.startTime >= ? AND t.startTime < ?
     GROUP BY substr(t.startTime, 1, 10)
     ORDER BY date ASC`,
    [startDate, endDate]
  )
}

export async function getTagStats(startDate: string, endDate: string): Promise<TagStats[]> {
  const db = await getDb()
  return getAll<TagStats>(
    db,
    `SELECT tagId, tagName, tagColor, isProductive, SUM(minutes) as totalMinutes
     FROM (
       SELECT t.tagId, tg.name as tagName, tg.color as tagColor, tg.isProductive,
              CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER) as minutes
       FROM tasks t
       JOIN tags tg ON t.tagId = tg.id
       WHERE t.endTime IS NOT NULL AND t.startTime >= ? AND t.startTime < ?
       
       UNION ALL
       
       SELECT t.secondaryTagId as tagId, tg.name as tagName, tg.color as tagColor, tg.isProductive,
              CAST((julianday(t.endTime) - julianday(t.startTime)) * 24 * 60 AS INTEGER) as minutes
       FROM tasks t
       JOIN tags tg ON t.secondaryTagId = tg.id
       WHERE t.endTime IS NOT NULL AND t.startTime >= ? AND t.startTime < ?
     )
     GROUP BY tagId
     ORDER BY totalMinutes DESC`,
    [startDate, endDate, startDate, endDate]
  )
}

// ── Smart Logic ───────────────────────────────────────────────────────────────

export async function fillGapsWithIdle(date: string): Promise<void> {
  const db = await getDb()
  const dayStart = `${date}T00:00:00.000Z`
  const dayEnd = `${date}T23:59:59.999Z`

  const tasks = getAll<DbTask>(
    db,
    `SELECT * FROM tasks WHERE startTime >= ? AND startTime <= ? ORDER BY startTime ASC`,
    [dayStart, dayEnd]
  )

  if (tasks.length === 0) return

  for (let i = 0; i < tasks.length - 1; i++) {
    const current = tasks[i]
    const next = tasks[i + 1]
    if (!current.endTime) continue
    const gap = new Date(next.startTime).getTime() - new Date(current.endTime).getTime()
    if (gap > 60000) {
      run(db, 'INSERT INTO tasks (title, tagId, startTime, endTime) VALUES (?, 1, ?, ?)', [
        'Idle',
        current.endTime,
        next.startTime
      ])
    }
  }

  mergeConsecutiveSameTasksSync(db)
}

function mergeConsecutiveSameTasksSync(db: Database): void {
  const tasks = getAll<DbTask>(
    db,
    `SELECT * FROM tasks WHERE endTime IS NOT NULL ORDER BY startTime ASC`
  )

  const toDelete: number[] = []
  const toUpdate: { id: number; endTime: string }[] = []

  for (let i = 0; i < tasks.length - 1; i++) {
    const current = tasks[i]
    const next = tasks[i + 1]
    if (toDelete.includes(current.id)) continue

    if (
      current.title === next.title &&
      current.tagId === next.tagId &&
      current.endTime === next.startTime
    ) {
      toUpdate.push({ id: current.id, endTime: next.endTime || current.endTime! })
      toDelete.push(next.id)
    }
  }

  for (const upd of toUpdate) {
    run(db, 'UPDATE tasks SET endTime = ? WHERE id = ?', [upd.endTime, upd.id])
  }
  for (const id of toDelete) {
    run(db, 'DELETE FROM tasks WHERE id = ?', [id])
  }
}
