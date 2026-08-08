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
  isWorkDay: number
}

export interface DayConfig {
  date: string
  isWorkDay: number
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
  startTime: string,
  endTime: string | null = null
): Promise<DbTask> {
  const db = await getDb()
  run(db, 'INSERT INTO tasks (title, tagId, secondaryTagId, startTime, endTime) VALUES (?, ?, ?, ?, ?)', [
    title,
    tagId,
    secondaryTagId,
    startTime,
    endTime
  ])
  const id = lastInsertId(db)
  return { id, title, tagId, secondaryTagId, startTime, endTime }
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

/** Format a Date as YYYY-MM-DD using the machine's LOCAL time (matches the renderer's localDateStr) */
function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function getDailyStats(startDate: string, endDate: string): Promise<DailyStats[]> {
  const db = await getDb()

  // startDate/endDate are UTC ISO instants; buckets are LOCAL calendar days, so
  // grouping has to happen in JS (substr on an ISO string would bucket by UTC day
  // and leak the neighbouring month's days into the range).
  const rows = getAll<{ startTime: string; endTime: string | null; isProductive: number | null }>(
    db,
    `SELECT t.startTime, t.endTime, tg.isProductive
     FROM tasks t
     LEFT JOIN tags tg ON t.tagId = tg.id
     WHERE t.startTime >= ? AND t.startTime < ?`,
    [startDate, endDate]
  )

  const firstDay = localDateKey(new Date(startDate))
  const lastDay = localDateKey(new Date(new Date(endDate).getTime() - 1))

  const byDate = new Map<string, DailyStats>()
  const bucket = (date: string): DailyStats => {
    let entry = byDate.get(date)
    if (!entry) {
      entry = {
        date,
        totalMinutes: 0,
        productiveMinutes: 0,
        semiProductiveMinutes: 0,
        productiveErosMinutes: 0,
        isWorkDay: 0
      }
      byDate.set(date, entry)
    }
    return entry
  }

  for (const row of rows) {
    const date = localDateKey(new Date(row.startTime))
    if (date < firstDay || date > lastDay) continue
    const entry = bucket(date)
    if (!row.endTime) continue
    const minutes = Math.trunc(
      (new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 60000
    )
    entry.totalMinutes += minutes
    if (row.isProductive === 1) entry.productiveMinutes += minutes
    else if (row.isProductive === 2) entry.semiProductiveMinutes += minutes
    else if (row.isProductive === 3) entry.productiveErosMinutes += minutes
  }

  const configs = getAll<DayConfig>(
    db,
    'SELECT date, isWorkDay FROM day_configs WHERE date >= ? AND date <= ?',
    [firstDay, lastDay]
  )
  for (const config of configs) {
    bucket(config.date).isWorkDay = config.isWorkDay
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
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

// ── Day Configs ──────────────────────────────────────────────────────────────
export async function updateDayConfig(date: string, isWorkDay: number): Promise<void> {
  const db = await getDb()
  run(db, 'INSERT OR REPLACE INTO day_configs (date, isWorkDay) VALUES (?, ?)', [date, isWorkDay])
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

// ══════════════════════════════════════════════════════════════════════════════
// RickOS modules — reference CRUD (Inbox/TODO, Projects, Habits)
// ══════════════════════════════════════════════════════════════════════════════

export interface DbProject {
  id: number
  name: string
  description: string | null
  githubRepoUrl: string | null
  color: string
  archived: number
}

export interface DbTodo {
  id: number
  title: string
  notes: string | null
  status: string
  priority: number
  dueDate: string | null
  projectId: number | null
  source: string
  createdAt: string
}

export interface DbHabit {
  id: number
  name: string
  frequency: string
  target: number
  active: number
}

export interface DbHabitEntry {
  habitId: number
  date: string
  completed: number
}

// ── Todos (Inbox + TODO share this table) ──────────────────────────────────────

export async function getTodos(status?: string): Promise<DbTodo[]> {
  const db = await getDb()
  if (status) {
    return getAll<DbTodo>(
      db,
      'SELECT * FROM todos WHERE status = ? ORDER BY priority DESC, createdAt DESC',
      [status]
    )
  }
  return getAll<DbTodo>(db, 'SELECT * FROM todos ORDER BY priority DESC, createdAt DESC')
}

export async function createTodo(
  title: string,
  notes: string | null,
  status: string,
  source: string,
  priority = 0,
  dueDate: string | null = null,
  projectId: number | null = null
): Promise<DbTodo> {
  const db = await getDb()
  const createdAt = new Date().toISOString()
  run(
    db,
    'INSERT INTO todos (title, notes, status, priority, dueDate, projectId, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, notes, status, priority, dueDate, projectId, source, createdAt]
  )
  const id = lastInsertId(db)
  return getOne<DbTodo>(db, 'SELECT * FROM todos WHERE id = ?', [id])!
}

export async function updateTodo(
  id: number,
  title: string,
  notes: string | null,
  status: string,
  priority: number,
  dueDate: string | null,
  projectId: number | null
): Promise<DbTodo> {
  const db = await getDb()
  run(
    db,
    'UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, dueDate = ?, projectId = ? WHERE id = ?',
    [title, notes, status, priority, dueDate, projectId, id]
  )
  return getOne<DbTodo>(db, 'SELECT * FROM todos WHERE id = ?', [id])!
}

export async function deleteTodo(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM todos WHERE id = ?', [id])
}

// ── Projects ────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<DbProject[]> {
  const db = await getDb()
  return getAll<DbProject>(db, 'SELECT * FROM projects ORDER BY archived ASC, name ASC')
}

export async function createProject(
  name: string,
  description: string | null,
  githubRepoUrl: string | null,
  color: string
): Promise<DbProject> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO projects (name, description, githubRepoUrl, color) VALUES (?, ?, ?, ?)',
    [name, description, githubRepoUrl, color]
  )
  const id = lastInsertId(db)
  return getOne<DbProject>(db, 'SELECT * FROM projects WHERE id = ?', [id])!
}

export async function updateProject(
  id: number,
  name: string,
  description: string | null,
  githubRepoUrl: string | null,
  color: string,
  archived: number
): Promise<DbProject> {
  const db = await getDb()
  run(
    db,
    'UPDATE projects SET name = ?, description = ?, githubRepoUrl = ?, color = ?, archived = ? WHERE id = ?',
    [name, description, githubRepoUrl, color, archived, id]
  )
  return getOne<DbProject>(db, 'SELECT * FROM projects WHERE id = ?', [id])!
}

export async function deleteProject(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM projects WHERE id = ?', [id])
}

// ── Habits ──────────────────────────────────────────────────────────────────

export async function getHabits(): Promise<DbHabit[]> {
  const db = await getDb()
  return getAll<DbHabit>(db, 'SELECT * FROM habits ORDER BY id ASC')
}

export async function createHabit(
  name: string,
  frequency: string,
  target: number
): Promise<DbHabit> {
  const db = await getDb()
  run(db, 'INSERT INTO habits (name, frequency, target) VALUES (?, ?, ?)', [
    name,
    frequency,
    target
  ])
  const id = lastInsertId(db)
  return getOne<DbHabit>(db, 'SELECT * FROM habits WHERE id = ?', [id])!
}

export async function deleteHabit(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM habits WHERE id = ?', [id])
}

export async function getHabitEntries(date: string): Promise<DbHabitEntry[]> {
  const db = await getDb()
  return getAll<DbHabitEntry>(db, 'SELECT * FROM habit_entries WHERE date = ?', [date])
}

export async function toggleHabitEntry(
  habitId: number,
  date: string,
  completed: number
): Promise<void> {
  const db = await getDb()
  run(
    db,
    `INSERT INTO habit_entries (habitId, date, completed) VALUES (?, ?, ?)
     ON CONFLICT(habitId, date) DO UPDATE SET completed = excluded.completed`,
    [habitId, date, completed]
  )
}

// ── Settings (key-value) ──────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb()
  const row = getOne<{ value: string }>(db, 'SELECT value FROM settings WHERE key = ?', [key])
  return row ? row.value : null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb()
  run(
    db,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  )
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb()
  const rows = getAll<{ key: string; value: string }>(db, 'SELECT key, value FROM settings')
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

// ── GitHub issues (read-only mirror) ────────────────────────────────────────────

export interface DbGithubIssue {
  id: number
  number: number
  title: string
  state: string
  repo: string
  url: string | null
  labels: string | null // JSON array
  milestone: string | null
  updatedAt: string | null
}

export async function getGithubIssues(): Promise<DbGithubIssue[]> {
  const db = await getDb()
  return getAll<DbGithubIssue>(db, 'SELECT * FROM github_issues ORDER BY updatedAt DESC')
}

/** Full replace: the table is a read-only mirror of the current assigned issues. */
export async function replaceGithubIssues(issues: DbGithubIssue[]): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM github_issues')
  for (const i of issues) {
    run(
      db,
      `INSERT INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.number, i.title, i.state, i.repo, i.url, i.labels, i.milestone, i.updatedAt]
    )
  }
}
