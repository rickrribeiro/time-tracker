import { Database } from 'sql.js'
import { randomUUID } from 'crypto'
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
  studyNodeId: number | null
}

export interface DbTaskWithTag extends DbTask {
  tagName: string | null
  tagColor: string | null
  tagIsProductive: number | null
  secondaryTagName: string | null
  secondaryTagColor: string | null
  studyNodeTitle: string | null
  studyTopicId: number | null
  studyTopicName: string | null
  studyTopicColor: string | null
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
  SELECT t.id, t.title, t.tagId, t.secondaryTagId, t.startTime, t.endTime, t.studyNodeId,
         tg.name as tagName, tg.color as tagColor, tg.isProductive as tagIsProductive,
         stg.name as secondaryTagName, stg.color as secondaryTagColor,
         sn.title as studyNodeTitle, st.id as studyTopicId, st.name as studyTopicName, st.color as studyTopicColor
  FROM tasks t
  LEFT JOIN tags tg ON t.tagId = tg.id
  LEFT JOIN tags stg ON t.secondaryTagId = stg.id
  LEFT JOIN study_nodes sn ON t.studyNodeId = sn.id
  LEFT JOIN study_topics st ON sn.topicId = st.id
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
  endTime: string | null = null,
  studyNodeId: number | null = null
): Promise<DbTask> {
  const db = await getDb()
  run(db, 'INSERT INTO tasks (title, tagId, secondaryTagId, startTime, endTime, studyNodeId) VALUES (?, ?, ?, ?, ?, ?)', [
    title,
    tagId,
    secondaryTagId,
    startTime,
    endTime,
    studyNodeId
  ])
  const id = lastInsertId(db)
  return { id, title, tagId, secondaryTagId, startTime, endTime, studyNodeId }
}

/** Total focused minutes per study topic (from tasks linked to a study node). */
export interface StudyTopicHours {
  topicId: number
  topicName: string
  minutes: number
}
export async function getStudyHoursByTopic(): Promise<StudyTopicHours[]> {
  const db = await getDb()
  return getAll<StudyTopicHours>(
    db,
    `SELECT st.id as topicId, st.name as topicName,
            CAST(ROUND(SUM((julianday(COALESCE(t.endTime, 'now')) - julianday(t.startTime)) * 24 * 60)) AS INTEGER) as minutes
     FROM tasks t
     JOIN study_nodes sn ON t.studyNodeId = sn.id
     JOIN study_topics st ON sn.topicId = st.id
     WHERE t.studyNodeId IS NOT NULL
     GROUP BY st.id, st.name
     ORDER BY minutes DESC`
  )
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
  // studyNodeId is preserved (not touched by this UPDATE)
  return getOne<DbTask>(db, 'SELECT id, title, tagId, secondaryTagId, startTime, endTime, studyNodeId FROM tasks WHERE id = ?', [id])!
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
  aiGenerated: number
  recurrence: string | null
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
  projectId: number | null = null,
  aiGenerated = 0,
  recurrence: string | null = null
): Promise<DbTodo> {
  const db = await getDb()
  const createdAt = new Date().toISOString()
  run(
    db,
    'INSERT INTO todos (title, notes, status, priority, dueDate, projectId, source, aiGenerated, recurrence, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [title, notes, status, priority, dueDate, projectId, source, aiGenerated, recurrence, createdAt]
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
  projectId: number | null,
  recurrence?: string | null
): Promise<DbTodo> {
  const db = await getDb()
  const prev = getOne<DbTodo>(db, 'SELECT status FROM todos WHERE id = ?', [id])
  if (recurrence === undefined) {
    run(
      db,
      'UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, dueDate = ?, projectId = ? WHERE id = ?',
      [title, notes, status, priority, dueDate, projectId, id]
    )
  } else {
    run(
      db,
      'UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, dueDate = ?, projectId = ?, recurrence = ? WHERE id = ?',
      [title, notes, status, priority, dueDate, projectId, recurrence, id]
    )
  }
  // On transition INTO done, spawn the next instance of a recurring todo (once).
  if (status === 'done' && prev?.status !== 'done') spawnRecurrenceIfNeeded(db, id)
  return getOne<DbTodo>(db, 'SELECT * FROM todos WHERE id = ?', [id])!
}

/** Compute the next due date (YYYY-MM-DD) from a recurrence rule. */
function nextDueDate(rec: { type: string; n?: number; day?: number }, fromDue: string | null): string {
  const today = new Date()
  const base = fromDue ? new Date(`${fromDue}T12:00:00`) : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (rec.type === 'everyNDays') {
    base.setDate(base.getDate() + (rec.n && rec.n > 0 ? rec.n : 1))
    return iso(base)
  }
  if (rec.type === 'afterCompletion') {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
    d.setDate(d.getDate() + (rec.n && rec.n > 0 ? rec.n : 1))
    return iso(d)
  }
  // dayOfMonth: next occurrence of day X (next month from today)
  const day = rec.day && rec.day >= 1 && rec.day <= 31 ? rec.day : 1
  const d = new Date(today.getFullYear(), today.getMonth() + 1, day, 12)
  return iso(d)
}

/** If the just-completed todo has a recurrence rule, create the next open instance. */
function spawnRecurrenceIfNeeded(db: Awaited<ReturnType<typeof getDb>>, id: number): void {
  const t = getOne<DbTodo>(db, 'SELECT * FROM todos WHERE id = ?', [id])
  if (!t || !t.recurrence) return
  // avoid duplicating: only spawn once per completion (the source becomes 'recurring')
  let rec: { type: string; n?: number; day?: number }
  try {
    rec = JSON.parse(t.recurrence)
  } catch {
    return
  }
  if (!rec || !rec.type) return
  const nextDue = nextDueDate(rec, t.dueDate)
  run(
    db,
    'INSERT INTO todos (title, notes, status, priority, dueDate, projectId, source, aiGenerated, recurrence, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [t.title, t.notes, 'todo', t.priority, nextDue, t.projectId, 'recurring', 0, t.recurrence, new Date().toISOString()]
  )
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
  const completedAt = completed ? new Date().toISOString() : null
  run(
    db,
    `INSERT INTO habit_entries (habitId, date, completed, completedAt) VALUES (?, ?, ?, ?)
     ON CONFLICT(habitId, date) DO UPDATE SET completed = excluded.completed, completedAt = excluded.completedAt`,
    [habitId, date, completed, completedAt]
  )
}

export interface HabitCompletion {
  habitId: number
  name: string
  completedAt: string
}
/** Completions with a recorded time for a given day (for the timeline overlay). */
export async function getHabitCompletionsForDate(date: string): Promise<HabitCompletion[]> {
  const db = await getDb()
  return getAll<HabitCompletion>(
    db,
    `SELECT he.habitId, h.name, he.completedAt
     FROM habit_entries he JOIN habits h ON h.id = he.habitId
     WHERE he.date = ? AND he.completed = 1 AND he.completedAt IS NOT NULL
     ORDER BY he.completedAt ASC`,
    [date]
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
  // Overlap semantics: any event that intersects [startISO, endISO), so multi-day
  // events show on every day they span (not only the day they start on).
  return getAll<DbCalendarEvent>(
    db,
    'SELECT * FROM calendar_events WHERE startTime < ? AND COALESCE(endTime, startTime) > ? ORDER BY startTime ASC',
    [endISO, startISO]
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
export interface DbInvestmentHistory {
  id: number
  investmentId: number
  month: string
  amount: number
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
function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Sync investments.amount to the value of the investment's most recent month. */
function syncInvestmentLatest(db: Awaited<ReturnType<typeof getDb>>, investmentId: number): void {
  const latest = getOne<DbInvestmentHistory>(
    db,
    'SELECT * FROM investment_history WHERE investmentId = ? ORDER BY month DESC LIMIT 1',
    [investmentId]
  )
  if (latest) run(db, 'UPDATE investments SET amount = ? WHERE id = ?', [latest.amount, investmentId])
}

export async function getInvestments(): Promise<DbInvestment[]> {
  const db = await getDb()
  return getAll<DbInvestment>(db, 'SELECT * FROM investments ORDER BY name')
}
export async function getInvestmentHistory(): Promise<DbInvestmentHistory[]> {
  const db = await getDb()
  return getAll<DbInvestmentHistory>(db, 'SELECT * FROM investment_history ORDER BY month')
}
export async function createInvestment(name: string, type: string | null, amount: number, currency: string): Promise<DbInvestment> {
  const db = await getDb()
  run(db, 'INSERT INTO investments (name, type, amount, currency) VALUES (?, ?, ?, ?)', [name, type, amount, currency])
  const id = lastInsertId(db)
  // record the opening value as this month's snapshot
  run(db, 'INSERT INTO investment_history (investmentId, month, amount) VALUES (?, ?, ?)', [id, currentMonthKey(), amount])
  return getOne<DbInvestment>(db, 'SELECT * FROM investments WHERE id = ?', [id])!
}
/** Upsert an investment's value for a given month, then refresh its latest amount. */
export async function setInvestmentValue(investmentId: number, month: string, amount: number): Promise<void> {
  const db = await getDb()
  const existing = getOne<DbInvestmentHistory>(
    db,
    'SELECT * FROM investment_history WHERE investmentId = ? AND month = ?',
    [investmentId, month]
  )
  if (existing) {
    run(db, 'UPDATE investment_history SET amount = ? WHERE id = ?', [amount, existing.id])
  } else {
    run(db, 'INSERT INTO investment_history (investmentId, month, amount) VALUES (?, ?, ?)', [investmentId, month, amount])
  }
  syncInvestmentLatest(db, investmentId)
}
export async function deleteInvestment(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM investment_history WHERE investmentId = ?', [id])
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

// ══════════════════════════════════════════════════════════════════════════════
// IA — Skills, Agentes, Execuções (ids TEXT uuid p/ export/import portável)
// ══════════════════════════════════════════════════════════════════════════════

export interface DbSkill {
  id: string
  name: string
  description: string | null
  category: string | null
  tags: string // JSON array
  content: string
  isFavorite: number
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface DbAgent {
  id: string
  name: string
  description: string | null
  role: string | null
  systemPrompt: string
  defaultSkillIds: string // JSON array
  tags: string // JSON array
  isFavorite: number
  createdAt: string
  updatedAt: string
}

export interface DbPromptExecution {
  id: string
  createdAt: string
  agentId: string | null
  skillIds: string // JSON array
  userPrompt: string
  finalPrompt: string
  response: string | null
}

// ── Skills ──────────────────────────────────────────────────────────────────

export async function getSkills(): Promise<DbSkill[]> {
  const db = await getDb()
  return getAll<DbSkill>(db, 'SELECT * FROM skills ORDER BY isFavorite DESC, updatedAt DESC')
}

export async function createSkill(
  name: string,
  description: string | null,
  category: string | null,
  tags: string,
  content: string
): Promise<DbSkill> {
  const db = await getDb()
  const now = new Date().toISOString()
  const id = randomUUID()
  run(
    db,
    `INSERT INTO skills (id, name, description, category, tags, content, isFavorite, usageCount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    [id, name, description, category, tags, content, now, now]
  )
  return getOne<DbSkill>(db, 'SELECT * FROM skills WHERE id = ?', [id])!
}

export async function updateSkill(
  id: string,
  name: string,
  description: string | null,
  category: string | null,
  tags: string,
  content: string
): Promise<DbSkill> {
  const db = await getDb()
  run(
    db,
    'UPDATE skills SET name = ?, description = ?, category = ?, tags = ?, content = ?, updatedAt = ? WHERE id = ?',
    [name, description, category, tags, content, new Date().toISOString(), id]
  )
  return getOne<DbSkill>(db, 'SELECT * FROM skills WHERE id = ?', [id])!
}

export async function deleteSkill(id: string): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM skills WHERE id = ?', [id])
}

export async function toggleSkillFavorite(id: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE skills SET isFavorite = 1 - isFavorite WHERE id = ?', [id])
}

export async function incrementSkillUsage(id: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE skills SET usageCount = usageCount + 1 WHERE id = ?', [id])
}

/** Import a skill object; assigns a fresh id if the incoming id already exists (no clobber). */
export async function importSkill(s: Partial<DbSkill> & { name: string }): Promise<DbSkill> {
  const db = await getDb()
  const now = new Date().toISOString()
  const exists = s.id ? getOne<DbSkill>(db, 'SELECT id FROM skills WHERE id = ?', [s.id]) : null
  const id = exists || !s.id ? randomUUID() : s.id
  run(
    db,
    `INSERT INTO skills (id, name, description, category, tags, content, isFavorite, usageCount, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      s.name,
      s.description ?? null,
      s.category ?? null,
      s.tags ?? '[]',
      s.content ?? '',
      s.isFavorite ?? 0,
      s.createdAt ?? now,
      now
    ]
  )
  return getOne<DbSkill>(db, 'SELECT * FROM skills WHERE id = ?', [id])!
}

// ── Agents ──────────────────────────────────────────────────────────────────

export async function getAgents(): Promise<DbAgent[]> {
  const db = await getDb()
  return getAll<DbAgent>(db, 'SELECT * FROM agents ORDER BY isFavorite DESC, updatedAt DESC')
}

export async function createAgent(
  name: string,
  description: string | null,
  role: string | null,
  systemPrompt: string,
  defaultSkillIds: string,
  tags: string
): Promise<DbAgent> {
  const db = await getDb()
  const now = new Date().toISOString()
  const id = randomUUID()
  run(
    db,
    `INSERT INTO agents (id, name, description, role, systemPrompt, defaultSkillIds, tags, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, name, description, role, systemPrompt, defaultSkillIds, tags, now, now]
  )
  return getOne<DbAgent>(db, 'SELECT * FROM agents WHERE id = ?', [id])!
}

export async function updateAgent(
  id: string,
  name: string,
  description: string | null,
  role: string | null,
  systemPrompt: string,
  defaultSkillIds: string,
  tags: string
): Promise<DbAgent> {
  const db = await getDb()
  run(
    db,
    'UPDATE agents SET name = ?, description = ?, role = ?, systemPrompt = ?, defaultSkillIds = ?, tags = ?, updatedAt = ? WHERE id = ?',
    [name, description, role, systemPrompt, defaultSkillIds, tags, new Date().toISOString(), id]
  )
  return getOne<DbAgent>(db, 'SELECT * FROM agents WHERE id = ?', [id])!
}

export async function deleteAgent(id: string): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM agents WHERE id = ?', [id])
}

export async function toggleAgentFavorite(id: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE agents SET isFavorite = 1 - isFavorite WHERE id = ?', [id])
}

export async function importAgent(a: Partial<DbAgent> & { name: string }): Promise<DbAgent> {
  const db = await getDb()
  const now = new Date().toISOString()
  const exists = a.id ? getOne<DbAgent>(db, 'SELECT id FROM agents WHERE id = ?', [a.id]) : null
  const id = exists || !a.id ? randomUUID() : a.id
  run(
    db,
    `INSERT INTO agents (id, name, description, role, systemPrompt, defaultSkillIds, tags, isFavorite, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      a.name,
      a.description ?? null,
      a.role ?? null,
      a.systemPrompt ?? '',
      a.defaultSkillIds ?? '[]',
      a.tags ?? '[]',
      a.isFavorite ?? 0,
      a.createdAt ?? now,
      now
    ]
  )
  return getOne<DbAgent>(db, 'SELECT * FROM agents WHERE id = ?', [id])!
}

// ── Executions ────────────────────────────────────────────────────────────────

export async function getExecutions(): Promise<DbPromptExecution[]> {
  const db = await getDb()
  return getAll<DbPromptExecution>(db, 'SELECT * FROM prompt_executions ORDER BY createdAt DESC')
}

export async function createExecution(
  agentId: string | null,
  skillIds: string, // JSON array
  userPrompt: string,
  finalPrompt: string,
  response: string | null
): Promise<DbPromptExecution> {
  const db = await getDb()
  const id = randomUUID()
  run(
    db,
    `INSERT INTO prompt_executions (id, createdAt, agentId, skillIds, userPrompt, finalPrompt, response)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, new Date().toISOString(), agentId, skillIds, userPrompt, finalPrompt, response]
  )
  // bump usage of each skill referenced
  try {
    const ids = JSON.parse(skillIds) as string[]
    for (const sid of ids) run(db, 'UPDATE skills SET usageCount = usageCount + 1 WHERE id = ?', [sid])
  } catch {
    // ignore malformed skillIds
  }
  return getOne<DbPromptExecution>(db, 'SELECT * FROM prompt_executions WHERE id = ?', [id])!
}

export async function deleteExecution(id: string): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM prompt_executions WHERE id = ?', [id])
}

// ── Links ─────────────────────────────────────────────────────────────────────

export interface DbLink {
  id: number
  title: string
  url: string
  checked: number
  tags: string // JSON array
  lastOpenedAt: string | null
  createdAt: string
}

export async function getLinks(): Promise<DbLink[]> {
  const db = await getDb()
  return getAll<DbLink>(db, 'SELECT * FROM links ORDER BY id ASC')
}

export async function createLink(title: string, url: string, tags = '[]'): Promise<DbLink> {
  const db = await getDb()
  run(db, 'INSERT INTO links (title, url, checked, tags, createdAt) VALUES (?, ?, 0, ?, ?)', [
    title,
    url,
    tags,
    new Date().toISOString()
  ])
  return getOne<DbLink>(db, 'SELECT * FROM links WHERE id = ?', [lastInsertId(db)])!
}

export async function updateLink(id: number, title: string, url: string, tags = '[]'): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE links SET title = ?, url = ?, tags = ? WHERE id = ?', [title, url, tags, id])
}

export async function setLinkChecked(id: number, checked: number): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE links SET checked = ? WHERE id = ?', [checked, id])
}

export async function setLinkOpened(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE links SET lastOpenedAt = ? WHERE id = ?', [new Date().toISOString(), id])
}

export async function deleteLink(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM links WHERE id = ?', [id])
}

// ══════════════════════════════════════════════════════════════════════════════
// CRM pessoal (contatos / relações)
// ══════════════════════════════════════════════════════════════════════════════
export interface DbContact {
  id: number
  name: string
  location: string | null
  birthday: string | null
  interests: string | null
  context: string | null
  lastContactAt: string | null
  nextFollowUp: string | null
  createdAt: string
}
export async function getContacts(): Promise<DbContact[]> {
  const db = await getDb()
  return getAll<DbContact>(db, 'SELECT * FROM contacts ORDER BY name COLLATE NOCASE ASC')
}
export async function createContact(
  name: string,
  location: string | null,
  birthday: string | null,
  interests: string | null,
  context: string | null,
  nextFollowUp: string | null
): Promise<DbContact> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO contacts (name, location, birthday, interests, context, nextFollowUp, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, location, birthday, interests, context, nextFollowUp, new Date().toISOString()]
  )
  return getOne<DbContact>(db, 'SELECT * FROM contacts WHERE id = ?', [lastInsertId(db)])!
}
export async function updateContact(
  id: number,
  name: string,
  location: string | null,
  birthday: string | null,
  interests: string | null,
  context: string | null,
  lastContactAt: string | null,
  nextFollowUp: string | null
): Promise<DbContact> {
  const db = await getDb()
  run(
    db,
    'UPDATE contacts SET name = ?, location = ?, birthday = ?, interests = ?, context = ?, lastContactAt = ?, nextFollowUp = ? WHERE id = ?',
    [name, location, birthday, interests, context, lastContactAt, nextFollowUp, id]
  )
  return getOne<DbContact>(db, 'SELECT * FROM contacts WHERE id = ?', [id])!
}
/** Mark a conversation now: set lastContactAt and clear the follow-up. */
export async function logContact(id: number): Promise<DbContact> {
  const db = await getDb()
  run(db, 'UPDATE contacts SET lastContactAt = ?, nextFollowUp = NULL WHERE id = ?', [new Date().toISOString(), id])
  return getOne<DbContact>(db, 'SELECT * FROM contacts WHERE id = ?', [id])!
}
export async function deleteContact(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM contacts WHERE id = ?', [id])
}

// ══════════════════════════════════════════════════════════════════════════════
// Automações: regras + agendador
// ══════════════════════════════════════════════════════════════════════════════
export interface DbRule {
  id: number
  type: string
  enabled: number
  params: string
  lastFiredAt: string | null
  createdAt: string
}
export async function getRules(): Promise<DbRule[]> {
  const db = await getDb()
  return getAll<DbRule>(db, 'SELECT * FROM rules ORDER BY id ASC')
}
export async function createRule(type: string, params: string): Promise<DbRule> {
  const db = await getDb()
  run(db, 'INSERT INTO rules (type, enabled, params, createdAt) VALUES (?, 1, ?, ?)', [type, params, new Date().toISOString()])
  return getOne<DbRule>(db, 'SELECT * FROM rules WHERE id = ?', [lastInsertId(db)])!
}
export async function updateRule(id: number, enabled: number, params: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE rules SET enabled = ?, params = ? WHERE id = ?', [enabled, params, id])
}
export async function setRuleFired(id: number, at: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE rules SET lastFiredAt = ? WHERE id = ?', [at, id])
}
export async function deleteRule(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM rules WHERE id = ?', [id])
}

export interface DbScheduledJob {
  id: number
  name: string
  prompt: string
  hour: number
  enabled: number
  lastRunAt: string | null
  createdAt: string
}
export async function getScheduledJobs(): Promise<DbScheduledJob[]> {
  const db = await getDb()
  return getAll<DbScheduledJob>(db, 'SELECT * FROM scheduled_jobs ORDER BY id ASC')
}
export async function createScheduledJob(name: string, prompt: string, hour: number): Promise<DbScheduledJob> {
  const db = await getDb()
  run(db, 'INSERT INTO scheduled_jobs (name, prompt, hour, enabled, createdAt) VALUES (?, ?, ?, 1, ?)', [name, prompt, hour, new Date().toISOString()])
  return getOne<DbScheduledJob>(db, 'SELECT * FROM scheduled_jobs WHERE id = ?', [lastInsertId(db)])!
}
export async function updateScheduledJob(id: number, name: string, prompt: string, hour: number, enabled: number): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE scheduled_jobs SET name = ?, prompt = ?, hour = ?, enabled = ? WHERE id = ?', [name, prompt, hour, enabled, id])
}
export async function setJobRan(id: number, at: string): Promise<void> {
  const db = await getDb()
  run(db, 'UPDATE scheduled_jobs SET lastRunAt = ? WHERE id = ?', [at, id])
}
export async function deleteScheduledJob(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM scheduled_jobs WHERE id = ?', [id])
}

// ══════════════════════════════════════════════════════════════════════════════
// Metas mensais
// ══════════════════════════════════════════════════════════════════════════════
export interface DbGoal {
  id: number
  month: string
  title: string
  kind: string
  refId: number | null
  target: number
  current: number
  unit: string | null
  done: number
  createdAt: string
}
export async function getGoals(month: string): Promise<DbGoal[]> {
  const db = await getDb()
  return getAll<DbGoal>(db, 'SELECT * FROM goals WHERE month = ? ORDER BY done ASC, id ASC', [month])
}
export async function createGoal(
  month: string,
  title: string,
  kind: string,
  refId: number | null,
  target: number,
  unit: string | null
): Promise<DbGoal> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO goals (month, title, kind, refId, target, current, unit, done, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)',
    [month, title, kind, refId, target, unit, new Date().toISOString()]
  )
  return getOne<DbGoal>(db, 'SELECT * FROM goals WHERE id = ?', [lastInsertId(db)])!
}
export async function updateGoal(
  id: number,
  title: string,
  target: number,
  current: number,
  unit: string | null,
  done: number
): Promise<DbGoal> {
  const db = await getDb()
  run(db, 'UPDATE goals SET title = ?, target = ?, current = ?, unit = ?, done = ? WHERE id = ?', [title, target, current, unit, done, id])
  return getOne<DbGoal>(db, 'SELECT * FROM goals WHERE id = ?', [id])!
}
export async function deleteGoal(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM goals WHERE id = ?', [id])
}

// ══════════════════════════════════════════════════════════════════════════════
// Estudos (Learning OS): topics, roadmap nodes, notes, flashcards
// ══════════════════════════════════════════════════════════════════════════════

export interface DbStudyTopic {
  id: number
  name: string
  category: string | null
  status: string
  targetDate: string | null
  priority: number
  color: string
  createdAt: string
}
export interface DbStudyNode {
  id: number
  topicId: number
  parentId: number | null
  title: string
  description: string | null
  status: string
  orderIndex: number
  estimatedHours: number | null
  completedAt: string | null
  createdAt: string
}
export interface DbStudyNote {
  id: number
  topicId: number
  nodeId: number | null
  content: string
  updatedAt: string
}
export interface DbStudyFlashcard {
  id: number
  topicId: number
  nodeId: number | null
  front: string
  back: string
  easeFactor: number
  intervalDays: number
  repetitions: number
  nextReviewAt: string | null
  lastReviewedAt: string | null
  createdAt: string
}

// ── Topics ──
export async function getStudyTopics(): Promise<DbStudyTopic[]> {
  const db = await getDb()
  return getAll<DbStudyTopic>(db, 'SELECT * FROM study_topics ORDER BY priority DESC, name ASC')
}
export async function createStudyTopic(
  name: string,
  category: string | null,
  status: string,
  targetDate: string | null,
  priority: number,
  color: string
): Promise<DbStudyTopic> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO study_topics (name, category, status, targetDate, priority, color, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, category, status, targetDate, priority, color, new Date().toISOString()]
  )
  return getOne<DbStudyTopic>(db, 'SELECT * FROM study_topics WHERE id = ?', [lastInsertId(db)])!
}
export async function updateStudyTopic(
  id: number,
  name: string,
  category: string | null,
  status: string,
  targetDate: string | null,
  priority: number,
  color: string
): Promise<DbStudyTopic> {
  const db = await getDb()
  run(
    db,
    'UPDATE study_topics SET name = ?, category = ?, status = ?, targetDate = ?, priority = ?, color = ? WHERE id = ?',
    [name, category, status, targetDate, priority, color, id]
  )
  return getOne<DbStudyTopic>(db, 'SELECT * FROM study_topics WHERE id = ?', [id])!
}
export async function deleteStudyTopic(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM study_topics WHERE id = ?', [id]) // children cascade (FKs on)
}

// ── Roadmap nodes ──
export async function getStudyNodes(topicId: number): Promise<DbStudyNode[]> {
  const db = await getDb()
  return getAll<DbStudyNode>(db, 'SELECT * FROM study_nodes WHERE topicId = ? ORDER BY orderIndex ASC, id ASC', [topicId])
}
export async function getAllStudyNodes(): Promise<DbStudyNode[]> {
  const db = await getDb()
  return getAll<DbStudyNode>(db, 'SELECT * FROM study_nodes')
}
export async function getAllStudyNotes(): Promise<DbStudyNote[]> {
  const db = await getDb()
  return getAll<DbStudyNote>(db, 'SELECT * FROM study_notes')
}
export async function createStudyNode(
  topicId: number,
  parentId: number | null,
  title: string,
  description: string | null,
  estimatedHours: number | null
): Promise<DbStudyNode> {
  const db = await getDb()
  // append at the end of its sibling group
  const siblings = getAll<{ n: number }>(
    db,
    'SELECT COALESCE(MAX(orderIndex), -1) + 1 AS n FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1)',
    [topicId, parentId]
  )
  const orderIndex = siblings[0]?.n ?? 0
  run(
    db,
    'INSERT INTO study_nodes (topicId, parentId, title, description, status, orderIndex, estimatedHours, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [topicId, parentId, title, description, 'todo', orderIndex, estimatedHours, new Date().toISOString()]
  )
  return getOne<DbStudyNode>(db, 'SELECT * FROM study_nodes WHERE id = ?', [lastInsertId(db)])!
}
export async function updateStudyNode(
  id: number,
  title: string,
  description: string | null,
  status: string,
  estimatedHours: number | null
): Promise<DbStudyNode> {
  const db = await getDb()
  const completedAt = status === 'done' ? new Date().toISOString() : null
  run(
    db,
    'UPDATE study_nodes SET title = ?, description = ?, status = ?, estimatedHours = ?, completedAt = ? WHERE id = ?',
    [title, description, status, estimatedHours, completedAt, id]
  )
  return getOne<DbStudyNode>(db, 'SELECT * FROM study_nodes WHERE id = ?', [id])!
}
export async function deleteStudyNode(id: number): Promise<void> {
  const db = await getDb()
  // delete the whole subtree (self-ref FK cascade isn't reliable in sql.js)
  const all = getAll<DbStudyNode>(db, 'SELECT id, parentId FROM study_nodes')
  const toDelete = new Set<number>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of all) {
      if (n.parentId != null && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
        toDelete.add(n.id)
        grew = true
      }
    }
  }
  for (const nid of toDelete) run(db, 'DELETE FROM study_nodes WHERE id = ?', [nid])
}
/**
 * Move a node to a new parent + position (drag-and-drop). Rewrites the target
 * sibling group's orderIndex sequentially. No-op if it would create a cycle
 * (dropping a node into its own subtree).
 */
export async function reorderStudyNode(id: number, newParentId: number | null, newIndex: number): Promise<void> {
  const db = await getDb()
  const n = getOne<DbStudyNode>(db, 'SELECT * FROM study_nodes WHERE id = ?', [id])
  if (!n) return
  // guard against cycles: newParent must not be the node or any descendant
  if (newParentId != null) {
    const all = getAll<DbStudyNode>(db, 'SELECT id, parentId FROM study_nodes WHERE topicId = ?', [n.topicId])
    const desc = new Set<number>([id])
    let grew = true
    while (grew) {
      grew = false
      for (const x of all) {
        if (x.parentId != null && desc.has(x.parentId) && !desc.has(x.id)) {
          desc.add(x.id)
          grew = true
        }
      }
    }
    if (desc.has(newParentId)) return
  }
  // sibling group in the destination, excluding the moved node
  const siblings = getAll<DbStudyNode>(
    db,
    'SELECT * FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1) AND id <> ? ORDER BY orderIndex ASC, id ASC',
    [n.topicId, newParentId, id]
  )
  const clamped = Math.max(0, Math.min(newIndex, siblings.length))
  siblings.splice(clamped, 0, n)
  run(db, 'UPDATE study_nodes SET parentId = ? WHERE id = ?', [newParentId, id])
  siblings.forEach((s, i) => run(db, 'UPDATE study_nodes SET orderIndex = ? WHERE id = ?', [i, s.id]))
}

/** Swap orderIndex with the previous/next sibling (same topic + parent). */
export async function moveStudyNode(id: number, dir: 'up' | 'down'): Promise<void> {
  const db = await getDb()
  const node = getOne<DbStudyNode>(db, 'SELECT * FROM study_nodes WHERE id = ?', [id])
  if (!node) return
  const siblings = getAll<DbStudyNode>(
    db,
    'SELECT * FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1) ORDER BY orderIndex ASC, id ASC',
    [node.topicId, node.parentId]
  )
  const idx = siblings.findIndex((s) => s.id === id)
  const swapWith = dir === 'up' ? siblings[idx - 1] : siblings[idx + 1]
  if (!swapWith) return
  run(db, 'UPDATE study_nodes SET orderIndex = ? WHERE id = ?', [swapWith.orderIndex, node.id])
  run(db, 'UPDATE study_nodes SET orderIndex = ? WHERE id = ?', [node.orderIndex, swapWith.id])
}

// ── Notes (one per node; nodeId null = topic-level) ──
export async function getStudyNote(topicId: number, nodeId: number | null): Promise<DbStudyNote | null> {
  const db = await getDb()
  return nodeId == null
    ? getOne<DbStudyNote>(db, 'SELECT * FROM study_notes WHERE topicId = ? AND nodeId IS NULL', [topicId])
    : getOne<DbStudyNote>(db, 'SELECT * FROM study_notes WHERE nodeId = ?', [nodeId])
}
export async function saveStudyNote(topicId: number, nodeId: number | null, content: string): Promise<DbStudyNote> {
  const db = await getDb()
  const existing = await getStudyNote(topicId, nodeId)
  const now = new Date().toISOString()
  if (existing) {
    run(db, 'UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?', [content, now, existing.id])
    return getOne<DbStudyNote>(db, 'SELECT * FROM study_notes WHERE id = ?', [existing.id])!
  }
  run(db, 'INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)', [topicId, nodeId, content, now])
  return getOne<DbStudyNote>(db, 'SELECT * FROM study_notes WHERE id = ?', [lastInsertId(db)])!
}

// ── Flashcards ──
export async function getStudyFlashcards(topicId?: number): Promise<DbStudyFlashcard[]> {
  const db = await getDb()
  return topicId == null
    ? getAll<DbStudyFlashcard>(db, 'SELECT * FROM study_flashcards ORDER BY id DESC')
    : getAll<DbStudyFlashcard>(db, 'SELECT * FROM study_flashcards WHERE topicId = ? ORDER BY id DESC', [topicId])
}
export async function getDueFlashcards(nowISO: string): Promise<DbStudyFlashcard[]> {
  const db = await getDb()
  return getAll<DbStudyFlashcard>(
    db,
    'SELECT * FROM study_flashcards WHERE nextReviewAt IS NULL OR nextReviewAt <= ? ORDER BY nextReviewAt ASC, id ASC',
    [nowISO]
  )
}
export async function createStudyFlashcard(
  topicId: number,
  nodeId: number | null,
  front: string,
  back: string
): Promise<DbStudyFlashcard> {
  const db = await getDb()
  run(
    db,
    'INSERT INTO study_flashcards (topicId, nodeId, front, back, createdAt) VALUES (?, ?, ?, ?, ?)',
    [topicId, nodeId, front, back, new Date().toISOString()]
  )
  return getOne<DbStudyFlashcard>(db, 'SELECT * FROM study_flashcards WHERE id = ?', [lastInsertId(db)])!
}
export async function updateStudyFlashcard(id: number, front: string, back: string): Promise<DbStudyFlashcard> {
  const db = await getDb()
  run(db, 'UPDATE study_flashcards SET front = ?, back = ? WHERE id = ?', [front, back, id])
  return getOne<DbStudyFlashcard>(db, 'SELECT * FROM study_flashcards WHERE id = ?', [id])!
}
export async function deleteStudyFlashcard(id: number): Promise<void> {
  const db = await getDb()
  run(db, 'DELETE FROM study_flashcards WHERE id = ?', [id])
}
/** Persist the SRS schedule computed in the renderer. */
export async function reviewStudyFlashcard(
  id: number,
  easeFactor: number,
  intervalDays: number,
  repetitions: number,
  nextReviewAt: string,
  lastReviewedAt: string
): Promise<DbStudyFlashcard> {
  const db = await getDb()
  run(
    db,
    'UPDATE study_flashcards SET easeFactor = ?, intervalDays = ?, repetitions = ?, nextReviewAt = ?, lastReviewedAt = ? WHERE id = ?',
    [easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt, id]
  )
  return getOne<DbStudyFlashcard>(db, 'SELECT * FROM study_flashcards WHERE id = ?', [id])!
}

// ── Quiz attempts ──
export interface DbStudyQuizAttempt {
  id: number
  topicId: number
  score: number
  total: number
  durationMs: number | null
  createdAt: string
}
export async function getStudyQuizAttempts(topicId: number): Promise<DbStudyQuizAttempt[]> {
  const db = await getDb()
  return getAll<DbStudyQuizAttempt>(db, 'SELECT * FROM study_quiz_attempts WHERE topicId = ? ORDER BY createdAt DESC LIMIT 20', [topicId])
}
export async function createStudyQuizAttempt(topicId: number, score: number, total: number, durationMs: number | null): Promise<DbStudyQuizAttempt> {
  const db = await getDb()
  run(db, 'INSERT INTO study_quiz_attempts (topicId, score, total, durationMs, createdAt) VALUES (?, ?, ?, ?, ?)', [topicId, score, total, durationMs, new Date().toISOString()])
  return getOne<DbStudyQuizAttempt>(db, 'SELECT * FROM study_quiz_attempts WHERE id = ?', [lastInsertId(db)])!
}

// ── Export bundle (all rows for one topic) ──
export interface StudyBundle {
  topic: DbStudyTopic
  nodes: DbStudyNode[]
  notes: DbStudyNote[]
  flashcards: DbStudyFlashcard[]
}
export async function getStudyBundle(topicId: number): Promise<StudyBundle | null> {
  const db = await getDb()
  const topic = getOne<DbStudyTopic>(db, 'SELECT * FROM study_topics WHERE id = ?', [topicId])
  if (!topic) return null
  return {
    topic,
    nodes: getAll<DbStudyNode>(db, 'SELECT * FROM study_nodes WHERE topicId = ? ORDER BY orderIndex ASC, id ASC', [topicId]),
    notes: getAll<DbStudyNote>(db, 'SELECT * FROM study_notes WHERE topicId = ?', [topicId]),
    flashcards: getAll<DbStudyFlashcard>(db, 'SELECT * FROM study_flashcards WHERE topicId = ?', [topicId])
  }
}
/** Recreate a topic from a bundle, assigning fresh ids and remapping parent/node refs. */
export async function importStudyBundle(bundle: StudyBundle): Promise<number> {
  const db = await getDb()
  const now = new Date().toISOString()
  const t = bundle.topic
  run(
    db,
    'INSERT INTO study_topics (name, category, status, targetDate, priority, color, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [t.name, t.category, t.status ?? 'studying', t.targetDate, t.priority ?? 0, t.color ?? '#6366f1', now]
  )
  const newTopicId = lastInsertId(db)

  // nodes: insert respecting parent order so parents exist first; remap ids
  const nodeIdMap = new Map<number, number>()
  const remaining = [...(bundle.nodes ?? [])]
  let guard = remaining.length + 5
  while (remaining.length && guard-- > 0) {
    for (let i = 0; i < remaining.length; ) {
      const n = remaining[i]
      const parentReady = n.parentId == null || nodeIdMap.has(n.parentId)
      if (!parentReady) {
        i++
        continue
      }
      run(
        db,
        'INSERT INTO study_nodes (topicId, parentId, title, description, status, orderIndex, estimatedHours, completedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newTopicId, n.parentId == null ? null : nodeIdMap.get(n.parentId) ?? null, n.title, n.description ?? null, n.status ?? 'todo', n.orderIndex ?? 0, n.estimatedHours ?? null, n.completedAt ?? null, n.createdAt ?? now]
      )
      nodeIdMap.set(n.id, lastInsertId(db))
      remaining.splice(i, 1)
    }
  }

  for (const note of bundle.notes ?? []) {
    const mappedNode = note.nodeId == null ? null : nodeIdMap.get(note.nodeId) ?? null
    run(db, 'INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)', [newTopicId, mappedNode, note.content ?? '', note.updatedAt ?? now])
  }
  for (const fc of bundle.flashcards ?? []) {
    const mappedNode = fc.nodeId == null ? null : nodeIdMap.get(fc.nodeId) ?? null
    run(
      db,
      'INSERT INTO study_flashcards (topicId, nodeId, front, back, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newTopicId, mappedNode, fc.front, fc.back, fc.easeFactor ?? 2.5, fc.intervalDays ?? 0, fc.repetitions ?? 0, fc.nextReviewAt ?? null, fc.lastReviewedAt ?? null, fc.createdAt ?? now]
    )
  }
  return newTopicId
}
