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
  claudeCommand: string | null
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
  color: string,
  claudeCommand: string | null = null
): Promise<DbProject> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO projects (name, description, githubRepoUrl, color, claudeCommand) VALUES (?, ?, ?, ?, ?)',
    [name, description, githubRepoUrl, color, claudeCommand]
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
  archived: number,
  claudeCommand: string | null = null
): Promise<DbProject> {
  const db = await getDb()
  run(
    db,
    'UPDATE projects SET name = ?, description = ?, githubRepoUrl = ?, color = ?, archived = ?, claudeCommand = ? WHERE id = ?',
    [name, description, githubRepoUrl, color, archived, claudeCommand, id]
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

export async function updateHabit(
  id: number,
  name: string,
  frequency: string,
  target: number,
  active: number
): Promise<DbHabit> {
  const db = await getDb()
  run(db, 'UPDATE habits SET name = ?, frequency = ?, target = ?, active = ? WHERE id = ?', [
    name,
    frequency,
    target,
    active,
    id
  ])
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

export async function getHabitEntriesForRange(
  startDate: string,
  endDate: string
): Promise<DbHabitEntry[]> {
  const db = await getDb()
  return getAll<DbHabitEntry>(
    db,
    'SELECT * FROM habit_entries WHERE date >= ? AND date <= ? AND completed = 1',
    [startDate, endDate]
  )
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
  local: number
  body: string | null
}

export async function getGithubIssues(): Promise<DbGithubIssue[]> {
  const db = await getDb()
  return getAll<DbGithubIssue>(db, 'SELECT * FROM github_issues ORDER BY local DESC, updatedAt DESC')
}

/** Create a local-only issue (negative id so it never collides with GitHub ids). */
export async function createLocalIssue(repo: string, title: string, body: string | null): Promise<DbGithubIssue> {
  const db = await getDb()
  const minRow = getOne<{ m: number | null }>(db, 'SELECT MIN(id) as m FROM github_issues WHERE id < 0')
  const id = (minRow?.m ?? 0) - 1
  run(
    db,
    `INSERT INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt, local, body)
     VALUES (?, 0, ?, 'open', ?, NULL, '[]', NULL, ?, 1, ?)`,
    [id, title, repo, new Date().toISOString(), body]
  )
  return getOne<DbGithubIssue>(db, 'SELECT * FROM github_issues WHERE id = ?', [id])!
}

/** Mark a local issue as existing on GitHub after creation. */
export async function markIssueOnGithub(id: number, url: string, number: number): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE github_issues SET url = ?, number = ? WHERE id = ?', [url, number, id])
}

export async function deleteGithubIssue(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM github_issues WHERE id = ?', [id])
}

/** Full replace of the GitHub mirror — keeps local (in-app) issues. */
export async function replaceGithubIssues(issues: DbGithubIssue[]): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM github_issues WHERE local = 0')
  for (const i of issues) {
    run(
      db,
      `INSERT INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.number, i.title, i.state, i.repo, i.url, i.labels, i.milestone, i.updatedAt]
    )
  }
}

/** Incremental merge: insert new issues and update changed ones (keyed on GitHub id). */
export async function upsertGithubIssues(issues: DbGithubIssue[]): Promise<void> {
  const db = await getDb()
  for (const i of issues) {
    run(
      db,
      `INSERT OR REPLACE INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.number, i.title, i.state, i.repo, i.url, i.labels, i.milestone, i.updatedAt]
    )
  }
}

// ── Calendar events ─────────────────────────────────────────────────────────────

export interface DbCalendarEvent {
  id: number
  title: string
  startTime: string
  endTime: string | null
  location: string | null
  source: string
}

export async function getUpcomingEvents(fromISO: string, limit: number): Promise<DbCalendarEvent[]> {
  const db = await getDb()
  return getAll<DbCalendarEvent>(
    db,
    'SELECT * FROM calendar_events WHERE startTime >= ? ORDER BY startTime ASC LIMIT ?',
    [fromISO, limit]
  )
}

export async function getEventsForRange(startISO: string, endISO: string): Promise<DbCalendarEvent[]> {
  const db = await getDb()
  return getAll<DbCalendarEvent>(
    db,
    'SELECT * FROM calendar_events WHERE startTime >= ? AND startTime < ? ORDER BY startTime ASC',
    [startISO, endISO]
  )
}

export async function createCalendarEvent(
  title: string,
  startTime: string,
  endTime: string | null,
  location: string | null
): Promise<DbCalendarEvent> {
  const db = await getDb()
  run(
    db,
    "INSERT INTO calendar_events (title, startTime, endTime, location, source) VALUES (?, ?, ?, ?, 'manual')",
    [title, startTime, endTime, location]
  )
  const id = lastInsertId(db)
  return getOne<DbCalendarEvent>(db, 'SELECT * FROM calendar_events WHERE id = ?', [id])!
}

export async function deleteCalendarEvent(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM calendar_events WHERE id = ?', [id])
}

/** Replace all Google-sourced events (leaves manual events untouched). */
export async function replaceGoogleEvents(
  events: { title: string; startTime: string; endTime: string | null; location: string | null }[]
): Promise<void> {
  const db = await getDb()
  run(db, "DELETE FROM calendar_events WHERE source = 'google'")
  for (const e of events) {
    run(
      db,
      "INSERT INTO calendar_events (title, startTime, endTime, location, source) VALUES (?, ?, ?, ?, 'google')",
      [e.title, e.startTime, e.endTime, e.location]
    )
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Finance (accounts, categories, transactions, budgets, investments)
// ══════════════════════════════════════════════════════════════════════════════

export interface DbAccount {
  id: number
  name: string
  currency: string
  balance: number
}
export interface DbCategory {
  id: number
  name: string
  type: string
  color: string
}
export interface DbTransaction {
  id: number
  accountId: number | null
  categoryId: number | null
  amount: number
  currency: string
  type: string
  description: string | null
  date: string
}
export interface DbBudget {
  id: number
  categoryId: number | null
  month: string
  amount: number
}
export interface DbInvestment {
  id: number
  name: string
  type: string | null
  amount: number
  currency: string
}

// ── Accounts ──
export async function getAccounts(): Promise<DbAccount[]> {
  const db = await getDb()
  return getAll<DbAccount>(db, 'SELECT * FROM accounts ORDER BY name')
}
export async function createAccount(name: string, currency: string, balance: number): Promise<DbAccount> {
  const db = await getDb()
  run(db, 'INSERT INTO accounts (name, currency, balance) VALUES (?, ?, ?)', [name, currency, balance])
  return getOne<DbAccount>(db, 'SELECT * FROM accounts WHERE id = ?', [lastInsertId(db)])!
}
export async function updateAccount(id: number, name: string, currency: string, balance: number): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE accounts SET name = ?, currency = ?, balance = ? WHERE id = ?', [name, currency, balance, id])
}
export async function deleteAccount(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM accounts WHERE id = ?', [id])
}

// ── Categories ──
export async function getCategories(): Promise<DbCategory[]> {
  const db = await getDb()
  return getAll<DbCategory>(db, 'SELECT * FROM categories ORDER BY type DESC, name')
}
export async function createCategory(name: string, type: string, color: string): Promise<DbCategory> {
  const db = await getDb()
  run(db, 'INSERT INTO categories (name, type, color) VALUES (?, ?, ?)', [name, type, color])
  return getOne<DbCategory>(db, 'SELECT * FROM categories WHERE id = ?', [lastInsertId(db)])!
}
export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM categories WHERE id = ?', [id])
}

// ── Transactions ──
export async function getTransactions(month?: string): Promise<DbTransaction[]> {
  const db = await getDb()
  if (month) {
    return getAll<DbTransaction>(
      db,
      "SELECT * FROM transactions WHERE substr(date, 1, 7) = ? ORDER BY date DESC, id DESC",
      [month]
    )
  }
  return getAll<DbTransaction>(db, 'SELECT * FROM transactions ORDER BY date DESC, id DESC')
}
export async function createTransaction(
  accountId: number | null,
  categoryId: number | null,
  amount: number,
  currency: string,
  type: string,
  description: string | null,
  date: string
): Promise<DbTransaction> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO transactions (accountId, categoryId, amount, currency, type, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [accountId, categoryId, amount, currency, type, description, date]
  )
  return getOne<DbTransaction>(db, 'SELECT * FROM transactions WHERE id = ?', [lastInsertId(db)])!
}
export async function updateTransaction(
  id: number,
  accountId: number | null,
  categoryId: number | null,
  amount: number,
  currency: string,
  type: string,
  description: string | null,
  date: string
): Promise<void> {
  const db = await getDb()
  run(
    db,
    'UPDATE transactions SET accountId = ?, categoryId = ?, amount = ?, currency = ?, type = ?, description = ?, date = ? WHERE id = ?',
    [accountId, categoryId, amount, currency, type, description, date, id]
  )
}
export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM transactions WHERE id = ?', [id])
}
export async function bulkInsertTransactions(rows: Omit<DbTransaction, 'id'>[]): Promise<number> {
  const db = await getDb()
  for (const r of rows) {
    run(
      db,
      'INSERT INTO transactions (accountId, categoryId, amount, currency, type, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.accountId, r.categoryId, r.amount, r.currency, r.type, r.description, r.date]
    )
  }
  return rows.length
}

// ── Budgets ──
export async function getBudgets(month: string): Promise<DbBudget[]> {
  const db = await getDb()
  return getAll<DbBudget>(db, 'SELECT * FROM budgets WHERE month = ?', [month])
}
export async function setBudget(categoryId: number, month: string, amount: number): Promise<void> {
  const db = await getDb()
  const existing = getOne<DbBudget>(db, 'SELECT * FROM budgets WHERE categoryId = ? AND month = ?', [categoryId, month])
  if (existing) {
    run(db, 'UPDATE budgets SET amount = ? WHERE id = ?', [amount, existing.id])
  } else {
    run(db, 'INSERT INTO budgets (categoryId, month, amount) VALUES (?, ?, ?)', [categoryId, month, amount])
  }
}

// ── Investments ──
export async function getInvestments(): Promise<DbInvestment[]> {
  const db = await getDb()
  return getAll<DbInvestment>(db, 'SELECT * FROM investments ORDER BY name')
}
export async function createInvestment(name: string, type: string | null, amount: number, currency: string): Promise<DbInvestment> {
  const db = await getDb()
  run(db, 'INSERT INTO investments (name, type, amount, currency) VALUES (?, ?, ?, ?)', [name, type, amount, currency])
  return getOne<DbInvestment>(db, 'SELECT * FROM investments WHERE id = ?', [lastInsertId(db)])!
}
export async function deleteInvestment(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM investments WHERE id = ?', [id])
}

// ══════════════════════════════════════════════════════════════════════════════
// Travel (trips, flight watches)
// ══════════════════════════════════════════════════════════════════════════════

export interface DbTrip {
  id: number
  origin: string | null
  destination: string
  startDate: string | null
  endDate: string | null
  budget: number | null
  currency: string
  status: string
}
export interface DbFlightWatch {
  id: number
  tripId: number | null
  origin: string | null
  destination: string | null
  price: number | null
  currency: string
  lastChecked: string | null
}

export async function getTrips(): Promise<DbTrip[]> {
  const db = await getDb()
  return getAll<DbTrip>(db, 'SELECT * FROM trips ORDER BY startDate IS NULL, startDate ASC')
}
export async function createTrip(
  origin: string | null,
  destination: string,
  startDate: string | null,
  endDate: string | null,
  budget: number | null,
  currency: string,
  status: string
): Promise<DbTrip> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO trips (origin, destination, startDate, endDate, budget, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [origin, destination, startDate, endDate, budget, currency, status]
  )
  return getOne<DbTrip>(db, 'SELECT * FROM trips WHERE id = ?', [lastInsertId(db)])!
}
export async function updateTrip(
  id: number,
  origin: string | null,
  destination: string,
  startDate: string | null,
  endDate: string | null,
  budget: number | null,
  currency: string,
  status: string
): Promise<void> {
  const db = await getDb()
  run(
    db,
    'UPDATE trips SET origin = ?, destination = ?, startDate = ?, endDate = ?, budget = ?, currency = ?, status = ? WHERE id = ?',
    [origin, destination, startDate, endDate, budget, currency, status, id]
  )
}
export async function deleteTrip(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM trips WHERE id = ?', [id])
}

export async function getFlightWatches(): Promise<DbFlightWatch[]> {
  const db = await getDb()
  return getAll<DbFlightWatch>(db, 'SELECT * FROM flight_watches ORDER BY id DESC')
}
export async function createFlightWatch(
  tripId: number | null,
  origin: string | null,
  destination: string | null,
  price: number | null,
  currency: string,
  lastChecked: string
): Promise<DbFlightWatch> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO flight_watches (tripId, origin, destination, price, currency, lastChecked) VALUES (?, ?, ?, ?, ?, ?)',
    [tripId, origin, destination, price, currency, lastChecked]
  )
  return getOne<DbFlightWatch>(db, 'SELECT * FROM flight_watches WHERE id = ?', [lastInsertId(db)])!
}
export async function deleteFlightWatch(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM flight_watches WHERE id = ?', [id])
}

export async function updateFlightWatchPrice(
  id: number,
  price: number,
  lastChecked: string
): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE flight_watches SET price = ?, lastChecked = ? WHERE id = ?', [price, lastChecked, id])
}

// ── Trip documents (per-trip checklist) ─────────────────────────────────────────

export interface DbTripDocument {
  tripId: number
  item: string
  checked: number
}

export async function getTripDocuments(tripId: number): Promise<DbTripDocument[]> {
  const db = await getDb()
  return getAll<DbTripDocument>(db, 'SELECT * FROM trip_documents WHERE tripId = ?', [tripId])
}

export async function setTripDocument(tripId: number, item: string, checked: number): Promise<void> {
  const db = await getDb()
  run(
    db,
    `INSERT INTO trip_documents (tripId, item, checked) VALUES (?, ?, ?)
     ON CONFLICT(tripId, item) DO UPDATE SET checked = excluded.checked`,
    [tripId, item, checked]
  )
}
