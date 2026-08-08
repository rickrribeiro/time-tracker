import { getDb, saveDb } from './db';
// ── Helpers ───────────────────────────────────────────────────────────────────
// sql.js does NOT support params in db.exec() — always use prepare+step for parameterized queries
function getOne(db, sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length)
        stmt.bind(params);
    if (stmt.step()) {
        const obj = stmt.getAsObject();
        stmt.free();
        return obj;
    }
    stmt.free();
    return null;
}
function getAll(db, sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length)
        stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}
function run(db, sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
    saveDb();
}
function lastInsertId(db) {
    const stmt = db.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const id = stmt.getAsObject().id;
    stmt.free();
    return id;
}
// ── Tags ──────────────────────────────────────────────────────────────────────
export async function getAllTags() {
    const db = await getDb();
    return getAll(db, 'SELECT * FROM tags ORDER BY id');
}
export async function createTag(name, color, isProductive) {
    const db = await getDb();
    run(db, 'INSERT INTO tags (name, color, isProductive) VALUES (?, ?, ?)', [
        name,
        color,
        isProductive
    ]);
    const id = lastInsertId(db);
    return getOne(db, 'SELECT * FROM tags WHERE id = ?', [id]);
}
export async function updateTag(id, name, color, isProductive) {
    const db = await getDb();
    run(db, 'UPDATE tags SET name = ?, color = ?, isProductive = ? WHERE id = ?', [
        name,
        color,
        isProductive,
        id
    ]);
    return getOne(db, 'SELECT * FROM tags WHERE id = ?', [id]);
}
export async function deleteTag(id) {
    const db = await getDb();
    run(db, 'UPDATE tasks SET tagId = 1 WHERE tagId = ?', [id]);
    run(db, 'DELETE FROM tags WHERE id = ?', [id]);
}
// ── Tasks ─────────────────────────────────────────────────────────────────────
const TASK_WITH_TAG_SQL = `
  SELECT t.id, t.title, t.tagId, t.secondaryTagId, t.startTime, t.endTime,
         tg.name as tagName, tg.color as tagColor, tg.isProductive as tagIsProductive,
         stg.name as secondaryTagName, stg.color as secondaryTagColor
  FROM tasks t
  LEFT JOIN tags tg ON t.tagId = tg.id
  LEFT JOIN tags stg ON t.secondaryTagId = stg.id
`;
export async function getTasksForRange(startDate, endDate) {
    const db = await getDb();
    return getAll(db, `${TASK_WITH_TAG_SQL}
     WHERE t.startTime >= ? AND t.startTime < ?
     ORDER BY t.startTime ASC`, [startDate, endDate]);
}
export async function getAllTasks() {
    const db = await getDb();
    return getAll(db, `${TASK_WITH_TAG_SQL} ORDER BY t.startTime DESC`);
}
export async function getActiveTask() {
    const db = await getDb();
    return getOne(db, `${TASK_WITH_TAG_SQL}
     WHERE t.endTime IS NULL
     ORDER BY t.startTime DESC
     LIMIT 1`);
}
export async function createTask(title, tagId, secondaryTagId, startTime, endTime = null) {
    const db = await getDb();
    run(db, 'INSERT INTO tasks (title, tagId, secondaryTagId, startTime, endTime) VALUES (?, ?, ?, ?, ?)', [
        title,
        tagId,
        secondaryTagId,
        startTime,
        endTime
    ]);
    const id = lastInsertId(db);
    return { id, title, tagId, secondaryTagId, startTime, endTime };
}
export async function updateTask(id, title, tagId, secondaryTagId, startTime, endTime) {
    const db = await getDb();
    run(db, 'UPDATE tasks SET title = ?, tagId = ?, secondaryTagId = ?, startTime = ?, endTime = ? WHERE id = ?', [title, tagId, secondaryTagId, startTime, endTime, id]);
    return { id, title, tagId, secondaryTagId, startTime, endTime };
}
export async function stopTask(id, endTime) {
    const db = await getDb();
    run(db, 'UPDATE tasks SET endTime = ? WHERE id = ?', [endTime, id]);
}
export async function deleteTask(id) {
    const db = await getDb();
    run(db, 'DELETE FROM tasks WHERE id = ?', [id]);
}
export async function stopAllActiveTasks(endTime) {
    const db = await getDb();
    run(db, 'UPDATE tasks SET endTime = ? WHERE endTime IS NULL', [endTime]);
}
// ── Stats ─────────────────────────────────────────────────────────────────────
/** Format a Date as YYYY-MM-DD using the machine's LOCAL time (matches the renderer's localDateStr) */
function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
export async function getDailyStats(startDate, endDate) {
    const db = await getDb();
    // startDate/endDate are UTC ISO instants; buckets are LOCAL calendar days, so
    // grouping has to happen in JS (substr on an ISO string would bucket by UTC day
    // and leak the neighbouring month's days into the range).
    const rows = getAll(db, `SELECT t.startTime, t.endTime, tg.isProductive
     FROM tasks t
     LEFT JOIN tags tg ON t.tagId = tg.id
     WHERE t.startTime >= ? AND t.startTime < ?`, [startDate, endDate]);
    const firstDay = localDateKey(new Date(startDate));
    const lastDay = localDateKey(new Date(new Date(endDate).getTime() - 1));
    const byDate = new Map();
    const bucket = (date) => {
        let entry = byDate.get(date);
        if (!entry) {
            entry = {
                date,
                totalMinutes: 0,
                productiveMinutes: 0,
                semiProductiveMinutes: 0,
                productiveErosMinutes: 0,
                isWorkDay: 0
            };
            byDate.set(date, entry);
        }
        return entry;
    };
    for (const row of rows) {
        const date = localDateKey(new Date(row.startTime));
        if (date < firstDay || date > lastDay)
            continue;
        const entry = bucket(date);
        if (!row.endTime)
            continue;
        const minutes = Math.trunc((new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 60000);
        entry.totalMinutes += minutes;
        if (row.isProductive === 1)
            entry.productiveMinutes += minutes;
        else if (row.isProductive === 2)
            entry.semiProductiveMinutes += minutes;
        else if (row.isProductive === 3)
            entry.productiveErosMinutes += minutes;
    }
    const configs = getAll(db, 'SELECT date, isWorkDay FROM day_configs WHERE date >= ? AND date <= ?', [firstDay, lastDay]);
    for (const config of configs) {
        bucket(config.date).isWorkDay = config.isWorkDay;
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
export async function getTagStats(startDate, endDate) {
    const db = await getDb();
    return getAll(db, `SELECT tagId, tagName, tagColor, isProductive, SUM(minutes) as totalMinutes
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
     ORDER BY totalMinutes DESC`, [startDate, endDate, startDate, endDate]);
}
// ── Day Configs ──────────────────────────────────────────────────────────────
export async function updateDayConfig(date, isWorkDay) {
    const db = await getDb();
    run(db, 'INSERT OR REPLACE INTO day_configs (date, isWorkDay) VALUES (?, ?)', [date, isWorkDay]);
}
// ── Smart Logic ───────────────────────────────────────────────────────────────
export async function fillGapsWithIdle(date) {
    const db = await getDb();
    const dayStart = `${date}T00:00:00.000Z`;
    const dayEnd = `${date}T23:59:59.999Z`;
    const tasks = getAll(db, `SELECT * FROM tasks WHERE startTime >= ? AND startTime <= ? ORDER BY startTime ASC`, [dayStart, dayEnd]);
    if (tasks.length === 0)
        return;
    for (let i = 0; i < tasks.length - 1; i++) {
        const current = tasks[i];
        const next = tasks[i + 1];
        if (!current.endTime)
            continue;
        const gap = new Date(next.startTime).getTime() - new Date(current.endTime).getTime();
        if (gap > 60000) {
            run(db, 'INSERT INTO tasks (title, tagId, startTime, endTime) VALUES (?, 1, ?, ?)', [
                'Idle',
                current.endTime,
                next.startTime
            ]);
        }
    }
    mergeConsecutiveSameTasksSync(db);
}
function mergeConsecutiveSameTasksSync(db) {
    const tasks = getAll(db, `SELECT * FROM tasks WHERE endTime IS NOT NULL ORDER BY startTime ASC`);
    const toDelete = [];
    const toUpdate = [];
    for (let i = 0; i < tasks.length - 1; i++) {
        const current = tasks[i];
        const next = tasks[i + 1];
        if (toDelete.includes(current.id))
            continue;
        if (current.title === next.title &&
            current.tagId === next.tagId &&
            current.endTime === next.startTime) {
            toUpdate.push({ id: current.id, endTime: next.endTime || current.endTime });
            toDelete.push(next.id);
        }
    }
    for (const upd of toUpdate) {
        run(db, 'UPDATE tasks SET endTime = ? WHERE id = ?', [upd.endTime, upd.id]);
    }
    for (const id of toDelete) {
        run(db, 'DELETE FROM tasks WHERE id = ?', [id]);
    }
}
// ── Todos (Inbox + TODO share this table) ──────────────────────────────────────
export async function getTodos(status) {
    const db = await getDb();
    if (status) {
        return getAll(db, 'SELECT * FROM todos WHERE status = ? ORDER BY priority DESC, createdAt DESC', [status]);
    }
    return getAll(db, 'SELECT * FROM todos ORDER BY priority DESC, createdAt DESC');
}
export async function createTodo(title, notes, status, source, priority = 0, dueDate = null, projectId = null) {
    const db = await getDb();
    const createdAt = new Date().toISOString();
    run(db, 'INSERT INTO todos (title, notes, status, priority, dueDate, projectId, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [title, notes, status, priority, dueDate, projectId, source, createdAt]);
    const id = lastInsertId(db);
    return getOne(db, 'SELECT * FROM todos WHERE id = ?', [id]);
}
export async function updateTodo(id, title, notes, status, priority, dueDate, projectId) {
    const db = await getDb();
    run(db, 'UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, dueDate = ?, projectId = ? WHERE id = ?', [title, notes, status, priority, dueDate, projectId, id]);
    return getOne(db, 'SELECT * FROM todos WHERE id = ?', [id]);
}
export async function deleteTodo(id) {
    const db = await getDb();
    run(db, 'DELETE FROM todos WHERE id = ?', [id]);
}
// ── Projects ────────────────────────────────────────────────────────────────
export async function getProjects() {
    const db = await getDb();
    return getAll(db, 'SELECT * FROM projects ORDER BY archived ASC, name ASC');
}
export async function createProject(name, description, githubRepoUrl, color) {
    const db = await getDb();
    run(db, 'INSERT INTO projects (name, description, githubRepoUrl, color) VALUES (?, ?, ?, ?)', [name, description, githubRepoUrl, color]);
    const id = lastInsertId(db);
    return getOne(db, 'SELECT * FROM projects WHERE id = ?', [id]);
}
export async function updateProject(id, name, description, githubRepoUrl, color, archived) {
    const db = await getDb();
    run(db, 'UPDATE projects SET name = ?, description = ?, githubRepoUrl = ?, color = ?, archived = ? WHERE id = ?', [name, description, githubRepoUrl, color, archived, id]);
    return getOne(db, 'SELECT * FROM projects WHERE id = ?', [id]);
}
export async function deleteProject(id) {
    const db = await getDb();
    run(db, 'DELETE FROM projects WHERE id = ?', [id]);
}
// ── Habits ──────────────────────────────────────────────────────────────────
export async function getHabits() {
    const db = await getDb();
    return getAll(db, 'SELECT * FROM habits ORDER BY id ASC');
}
export async function createHabit(name, frequency, target) {
    const db = await getDb();
    run(db, 'INSERT INTO habits (name, frequency, target) VALUES (?, ?, ?)', [
        name,
        frequency,
        target
    ]);
    const id = lastInsertId(db);
    return getOne(db, 'SELECT * FROM habits WHERE id = ?', [id]);
}
export async function deleteHabit(id) {
    const db = await getDb();
    run(db, 'DELETE FROM habits WHERE id = ?', [id]);
}
export async function getHabitEntries(date) {
    const db = await getDb();
    return getAll(db, 'SELECT * FROM habit_entries WHERE date = ?', [date]);
}
export async function toggleHabitEntry(habitId, date, completed) {
    const db = await getDb();
    run(db, `INSERT INTO habit_entries (habitId, date, completed) VALUES (?, ?, ?)
     ON CONFLICT(habitId, date) DO UPDATE SET completed = excluded.completed`, [habitId, date, completed]);
}
// ── Settings (key-value) ──────────────────────────────────────────────────────
export async function getSetting(key) {
    const db = await getDb();
    const row = getOne(db, 'SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
}
export async function setSetting(key, value) {
    const db = await getDb();
    run(db, `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, value]);
}
export async function getAllSettings() {
    const db = await getDb();
    const rows = getAll(db, 'SELECT key, value FROM settings');
    const out = {};
    for (const r of rows)
        out[r.key] = r.value;
    return out;
}
export async function getGithubIssues() {
    const db = await getDb();
    return getAll(db, 'SELECT * FROM github_issues ORDER BY updatedAt DESC');
}
/** Full replace: the table is a read-only mirror of the current assigned issues. */
export async function replaceGithubIssues(issues) {
    const db = await getDb();
    run(db, 'DELETE FROM github_issues');
    for (const i of issues) {
        run(db, `INSERT INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [i.id, i.number, i.title, i.state, i.repo, i.url, i.labels, i.milestone, i.updatedAt]);
    }
}
