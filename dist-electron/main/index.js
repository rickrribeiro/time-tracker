"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");
const child_process = require("child_process");
const os = require("os");
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6366f1',
    isProductive INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tagId INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    startTime TEXT NOT NULL,
    endTime TEXT
  );

  INSERT OR IGNORE INTO tags (id, name, color, isProductive)
  VALUES (1, 'Idle', '#6b7280', 0);

  INSERT OR IGNORE INTO tags (id, name, color, isProductive)
  VALUES (2, 'Work', '#3b82f6', 1);

  INSERT OR IGNORE INTO tags (id, name, color, isProductive)
  VALUES (3, 'Break', '#f59e0b', 0);
  CREATE TABLE IF NOT EXISTS day_configs (
    date TEXT PRIMARY KEY,
    isWorkDay INTEGER NOT NULL DEFAULT 0
  );

  -- ── RickOS: Organização ──────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    githubRepoUrl TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    archived INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'inbox',   -- inbox | todo | doing | done
    priority INTEGER NOT NULL DEFAULT 0,
    dueDate TEXT,
    projectId INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'manual',  -- manual | quick-capture | github
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'daily',
    target INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS habit_entries (
    habitId INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (habitId, date)
  );

  -- ── RickOS: Finanças ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    balance REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense',   -- income | expense
    color TEXT NOT NULL DEFAULT '#6366f1'
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accountId INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    categoryId INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    type TEXT NOT NULL DEFAULT 'expense',   -- income | expense
    description TEXT,
    date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoryId INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    amount REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS investments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BRL'
  );

  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (1, 'Salário', 'income', '#22c55e');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (2, 'Alimentação', 'expense', '#f59e0b');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (3, 'Transporte', 'expense', '#3b82f6');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (4, 'Moradia', 'expense', '#8b5cf6');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (5, 'Lazer', 'expense', '#ec4899');
  INSERT OR IGNORE INTO categories (id, name, type, color) VALUES (6, 'Outros', 'expense', '#6b7280');

  -- ── RickOS: Viagens ──────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT,
    destination TEXT NOT NULL,
    startDate TEXT,
    endDate TEXT,
    budget REAL,
    currency TEXT NOT NULL DEFAULT 'BRL',
    status TEXT NOT NULL DEFAULT 'planned'
  );

  CREATE TABLE IF NOT EXISTS flight_watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tripId INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    origin TEXT,
    destination TEXT,
    price REAL,
    currency TEXT NOT NULL DEFAULT 'JPY',
    lastChecked TEXT
  );

  -- ── RickOS: Settings & integrações ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS github_issues (
    id INTEGER PRIMARY KEY,          -- GitHub's global issue id
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL,             -- open | closed
    repo TEXT NOT NULL,              -- owner/name
    url TEXT,
    labels TEXT,                     -- JSON array of label names
    milestone TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    startTime TEXT NOT NULL,         -- ISO
    endTime TEXT,
    location TEXT,
    source TEXT NOT NULL DEFAULT 'manual'  -- manual | google
  );
`;
let db = null;
let dbPath;
const MIGRATIONS = [
  {
    version: 1,
    label: "tasks.secondaryTagId",
    run: (db2) => {
      try {
        db2.run("ALTER TABLE tasks ADD COLUMN secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL;");
      } catch {
      }
    }
  }
];
function getUserVersion(database) {
  const res = database.exec("PRAGMA user_version");
  const v = res[0]?.values?.[0]?.[0];
  return typeof v === "number" ? v : 0;
}
function runMigrations(database) {
  const current = getUserVersion(database);
  const target = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
  if (current >= target) return;
  for (const m of MIGRATIONS) {
    if (m.version > current) m.run(database);
  }
  database.run(`PRAGMA user_version = ${target}`);
}
async function getDb() {
  if (db) return db;
  dbPath = path.join(electron.app.getPath("userData"), "timetracker.db");
  const sqlJsModulePath = require.resolve("sql.js");
  const wasmPath = path.join(path.dirname(sqlJsModulePath), "sql-wasm.wasm");
  const SQL = await initSqlJs({
    locateFile: () => wasmPath
  });
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA);
  runMigrations(db);
  saveDb();
  return db;
}
function saveDb() {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}
function closeDb() {
  if (db) {
    saveDb();
    db.close();
    db = null;
  }
}
function getOne(db2, sql, params = []) {
  const stmt = db2.prepare(sql);
  if (params.length) stmt.bind(params);
  if (stmt.step()) {
    const obj = stmt.getAsObject();
    stmt.free();
    return obj;
  }
  stmt.free();
  return null;
}
function getAll(db2, sql, params = []) {
  const stmt = db2.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}
function run(db2, sql, params = []) {
  const stmt = db2.prepare(sql);
  stmt.run(params);
  stmt.free();
  saveDb();
}
function lastInsertId(db2) {
  const stmt = db2.prepare("SELECT last_insert_rowid() as id");
  stmt.step();
  const id = stmt.getAsObject().id;
  stmt.free();
  return id;
}
async function getAllTags() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM tags ORDER BY id");
}
async function createTag(name, color, isProductive) {
  const db2 = await getDb();
  run(db2, "INSERT INTO tags (name, color, isProductive) VALUES (?, ?, ?)", [
    name,
    color,
    isProductive
  ]);
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM tags WHERE id = ?", [id]);
}
async function updateTag(id, name, color, isProductive) {
  const db2 = await getDb();
  run(db2, "UPDATE tags SET name = ?, color = ?, isProductive = ? WHERE id = ?", [
    name,
    color,
    isProductive,
    id
  ]);
  return getOne(db2, "SELECT * FROM tags WHERE id = ?", [id]);
}
async function deleteTag(id) {
  const db2 = await getDb();
  run(db2, "UPDATE tasks SET tagId = 1 WHERE tagId = ?", [id]);
  run(db2, "DELETE FROM tags WHERE id = ?", [id]);
}
const TASK_WITH_TAG_SQL = `
  SELECT t.id, t.title, t.tagId, t.secondaryTagId, t.startTime, t.endTime,
         tg.name as tagName, tg.color as tagColor, tg.isProductive as tagIsProductive,
         stg.name as secondaryTagName, stg.color as secondaryTagColor
  FROM tasks t
  LEFT JOIN tags tg ON t.tagId = tg.id
  LEFT JOIN tags stg ON t.secondaryTagId = stg.id
`;
async function getTasksForRange(startDate, endDate) {
  const db2 = await getDb();
  return getAll(
    db2,
    `${TASK_WITH_TAG_SQL}
     WHERE t.startTime >= ? AND t.startTime < ?
     ORDER BY t.startTime ASC`,
    [startDate, endDate]
  );
}
async function getAllTasks() {
  const db2 = await getDb();
  return getAll(
    db2,
    `${TASK_WITH_TAG_SQL} ORDER BY t.startTime DESC`
  );
}
async function getActiveTask() {
  const db2 = await getDb();
  return getOne(
    db2,
    `${TASK_WITH_TAG_SQL}
     WHERE t.endTime IS NULL
     ORDER BY t.startTime DESC
     LIMIT 1`
  );
}
async function createTask(title, tagId, secondaryTagId, startTime, endTime = null) {
  const db2 = await getDb();
  run(db2, "INSERT INTO tasks (title, tagId, secondaryTagId, startTime, endTime) VALUES (?, ?, ?, ?, ?)", [
    title,
    tagId,
    secondaryTagId,
    startTime,
    endTime
  ]);
  const id = lastInsertId(db2);
  return { id, title, tagId, secondaryTagId, startTime, endTime };
}
async function updateTask(id, title, tagId, secondaryTagId, startTime, endTime) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE tasks SET title = ?, tagId = ?, secondaryTagId = ?, startTime = ?, endTime = ? WHERE id = ?",
    [title, tagId, secondaryTagId, startTime, endTime, id]
  );
  return { id, title, tagId, secondaryTagId, startTime, endTime };
}
async function stopTask(id, endTime) {
  const db2 = await getDb();
  run(db2, "UPDATE tasks SET endTime = ? WHERE id = ?", [endTime, id]);
}
async function deleteTask(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM tasks WHERE id = ?", [id]);
}
async function stopAllActiveTasks(endTime) {
  const db2 = await getDb();
  run(db2, "UPDATE tasks SET endTime = ? WHERE endTime IS NULL", [endTime]);
}
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
async function getDailyStats(startDate, endDate) {
  const db2 = await getDb();
  const rows = getAll(
    db2,
    `SELECT t.startTime, t.endTime, tg.isProductive
     FROM tasks t
     LEFT JOIN tags tg ON t.tagId = tg.id
     WHERE t.startTime >= ? AND t.startTime < ?`,
    [startDate, endDate]
  );
  const firstDay = localDateKey(new Date(startDate));
  const lastDay = localDateKey(new Date(new Date(endDate).getTime() - 1));
  const byDate = /* @__PURE__ */ new Map();
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
    if (date < firstDay || date > lastDay) continue;
    const entry = bucket(date);
    if (!row.endTime) continue;
    const minutes = Math.trunc(
      (new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 6e4
    );
    entry.totalMinutes += minutes;
    if (row.isProductive === 1) entry.productiveMinutes += minutes;
    else if (row.isProductive === 2) entry.semiProductiveMinutes += minutes;
    else if (row.isProductive === 3) entry.productiveErosMinutes += minutes;
  }
  const configs = getAll(
    db2,
    "SELECT date, isWorkDay FROM day_configs WHERE date >= ? AND date <= ?",
    [firstDay, lastDay]
  );
  for (const config of configs) {
    bucket(config.date).isWorkDay = config.isWorkDay;
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
async function getTagStats(startDate, endDate) {
  const db2 = await getDb();
  return getAll(
    db2,
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
  );
}
async function updateDayConfig(date, isWorkDay) {
  const db2 = await getDb();
  run(db2, "INSERT OR REPLACE INTO day_configs (date, isWorkDay) VALUES (?, ?)", [date, isWorkDay]);
}
async function fillGapsWithIdle(date) {
  const db2 = await getDb();
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;
  const tasks = getAll(
    db2,
    `SELECT * FROM tasks WHERE startTime >= ? AND startTime <= ? ORDER BY startTime ASC`,
    [dayStart, dayEnd]
  );
  if (tasks.length === 0) return;
  for (let i = 0; i < tasks.length - 1; i++) {
    const current = tasks[i];
    const next = tasks[i + 1];
    if (!current.endTime) continue;
    const gap = new Date(next.startTime).getTime() - new Date(current.endTime).getTime();
    if (gap > 6e4) {
      run(db2, "INSERT INTO tasks (title, tagId, startTime, endTime) VALUES (?, 1, ?, ?)", [
        "Idle",
        current.endTime,
        next.startTime
      ]);
    }
  }
  mergeConsecutiveSameTasksSync(db2);
}
function mergeConsecutiveSameTasksSync(db2) {
  const tasks = getAll(
    db2,
    `SELECT * FROM tasks WHERE endTime IS NOT NULL ORDER BY startTime ASC`
  );
  const toDelete = [];
  const toUpdate = [];
  for (let i = 0; i < tasks.length - 1; i++) {
    const current = tasks[i];
    const next = tasks[i + 1];
    if (toDelete.includes(current.id)) continue;
    if (current.title === next.title && current.tagId === next.tagId && current.endTime === next.startTime) {
      toUpdate.push({ id: current.id, endTime: next.endTime || current.endTime });
      toDelete.push(next.id);
    }
  }
  for (const upd of toUpdate) {
    run(db2, "UPDATE tasks SET endTime = ? WHERE id = ?", [upd.endTime, upd.id]);
  }
  for (const id of toDelete) {
    run(db2, "DELETE FROM tasks WHERE id = ?", [id]);
  }
}
async function getTodos(status) {
  const db2 = await getDb();
  if (status) {
    return getAll(
      db2,
      "SELECT * FROM todos WHERE status = ? ORDER BY priority DESC, createdAt DESC",
      [status]
    );
  }
  return getAll(db2, "SELECT * FROM todos ORDER BY priority DESC, createdAt DESC");
}
async function createTodo(title, notes, status, source, priority = 0, dueDate = null, projectId = null) {
  const db2 = await getDb();
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  run(
    db2,
    "INSERT INTO todos (title, notes, status, priority, dueDate, projectId, source, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [title, notes, status, priority, dueDate, projectId, source, createdAt]
  );
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM todos WHERE id = ?", [id]);
}
async function updateTodo(id, title, notes, status, priority, dueDate, projectId) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE todos SET title = ?, notes = ?, status = ?, priority = ?, dueDate = ?, projectId = ? WHERE id = ?",
    [title, notes, status, priority, dueDate, projectId, id]
  );
  return getOne(db2, "SELECT * FROM todos WHERE id = ?", [id]);
}
async function deleteTodo(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM todos WHERE id = ?", [id]);
}
async function getProjects() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM projects ORDER BY archived ASC, name ASC");
}
async function createProject(name, description, githubRepoUrl, color) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO projects (name, description, githubRepoUrl, color) VALUES (?, ?, ?, ?)",
    [name, description, githubRepoUrl, color]
  );
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM projects WHERE id = ?", [id]);
}
async function updateProject(id, name, description, githubRepoUrl, color, archived) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE projects SET name = ?, description = ?, githubRepoUrl = ?, color = ?, archived = ? WHERE id = ?",
    [name, description, githubRepoUrl, color, archived, id]
  );
  return getOne(db2, "SELECT * FROM projects WHERE id = ?", [id]);
}
async function deleteProject(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM projects WHERE id = ?", [id]);
}
async function getHabits() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM habits ORDER BY id ASC");
}
async function createHabit(name, frequency, target) {
  const db2 = await getDb();
  run(db2, "INSERT INTO habits (name, frequency, target) VALUES (?, ?, ?)", [
    name,
    frequency,
    target
  ]);
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM habits WHERE id = ?", [id]);
}
async function updateHabit(id, name, frequency, target, active) {
  const db2 = await getDb();
  run(db2, "UPDATE habits SET name = ?, frequency = ?, target = ?, active = ? WHERE id = ?", [
    name,
    frequency,
    target,
    active,
    id
  ]);
  return getOne(db2, "SELECT * FROM habits WHERE id = ?", [id]);
}
async function deleteHabit(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM habits WHERE id = ?", [id]);
}
async function getHabitEntries(date) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM habit_entries WHERE date = ?", [date]);
}
async function getHabitEntriesForRange(startDate, endDate) {
  const db2 = await getDb();
  return getAll(
    db2,
    "SELECT * FROM habit_entries WHERE date >= ? AND date <= ? AND completed = 1",
    [startDate, endDate]
  );
}
async function toggleHabitEntry(habitId, date, completed) {
  const db2 = await getDb();
  run(
    db2,
    `INSERT INTO habit_entries (habitId, date, completed) VALUES (?, ?, ?)
     ON CONFLICT(habitId, date) DO UPDATE SET completed = excluded.completed`,
    [habitId, date, completed]
  );
}
async function getSetting(key) {
  const db2 = await getDb();
  const row = getOne(db2, "SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : null;
}
async function setSetting(key, value) {
  const db2 = await getDb();
  run(
    db2,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}
async function getAllSettings() {
  const db2 = await getDb();
  const rows = getAll(db2, "SELECT key, value FROM settings");
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}
async function getGithubIssues() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM github_issues ORDER BY updatedAt DESC");
}
async function replaceGithubIssues(issues) {
  const db2 = await getDb();
  run(db2, "DELETE FROM github_issues");
  for (const i of issues) {
    run(
      db2,
      `INSERT INTO github_issues (id, number, title, state, repo, url, labels, milestone, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [i.id, i.number, i.title, i.state, i.repo, i.url, i.labels, i.milestone, i.updatedAt]
    );
  }
}
async function getUpcomingEvents(fromISO, limit) {
  const db2 = await getDb();
  return getAll(
    db2,
    "SELECT * FROM calendar_events WHERE startTime >= ? ORDER BY startTime ASC LIMIT ?",
    [fromISO, limit]
  );
}
async function getEventsForRange(startISO, endISO) {
  const db2 = await getDb();
  return getAll(
    db2,
    "SELECT * FROM calendar_events WHERE startTime >= ? AND startTime < ? ORDER BY startTime ASC",
    [startISO, endISO]
  );
}
async function createCalendarEvent(title, startTime, endTime, location) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO calendar_events (title, startTime, endTime, location, source) VALUES (?, ?, ?, ?, 'manual')",
    [title, startTime, endTime, location]
  );
  const id = lastInsertId(db2);
  return getOne(db2, "SELECT * FROM calendar_events WHERE id = ?", [id]);
}
async function deleteCalendarEvent(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM calendar_events WHERE id = ?", [id]);
}
async function getAccounts() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM accounts ORDER BY name");
}
async function createAccount(name, currency, balance) {
  const db2 = await getDb();
  run(db2, "INSERT INTO accounts (name, currency, balance) VALUES (?, ?, ?)", [name, currency, balance]);
  return getOne(db2, "SELECT * FROM accounts WHERE id = ?", [lastInsertId(db2)]);
}
async function updateAccount(id, name, currency, balance) {
  const db2 = await getDb();
  run(db2, "UPDATE accounts SET name = ?, currency = ?, balance = ? WHERE id = ?", [name, currency, balance, id]);
}
async function deleteAccount(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM accounts WHERE id = ?", [id]);
}
async function getCategories() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM categories ORDER BY type DESC, name");
}
async function createCategory(name, type, color) {
  const db2 = await getDb();
  run(db2, "INSERT INTO categories (name, type, color) VALUES (?, ?, ?)", [name, type, color]);
  return getOne(db2, "SELECT * FROM categories WHERE id = ?", [lastInsertId(db2)]);
}
async function deleteCategory(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM categories WHERE id = ?", [id]);
}
async function getTransactions(month) {
  const db2 = await getDb();
  if (month) {
    return getAll(
      db2,
      "SELECT * FROM transactions WHERE substr(date, 1, 7) = ? ORDER BY date DESC, id DESC",
      [month]
    );
  }
  return getAll(db2, "SELECT * FROM transactions ORDER BY date DESC, id DESC");
}
async function createTransaction(accountId, categoryId, amount, currency, type, description, date) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO transactions (accountId, categoryId, amount, currency, type, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [accountId, categoryId, amount, currency, type, description, date]
  );
  return getOne(db2, "SELECT * FROM transactions WHERE id = ?", [lastInsertId(db2)]);
}
async function updateTransaction(id, accountId, categoryId, amount, currency, type, description, date) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE transactions SET accountId = ?, categoryId = ?, amount = ?, currency = ?, type = ?, description = ?, date = ? WHERE id = ?",
    [accountId, categoryId, amount, currency, type, description, date, id]
  );
}
async function deleteTransaction(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM transactions WHERE id = ?", [id]);
}
async function bulkInsertTransactions(rows) {
  const db2 = await getDb();
  for (const r of rows) {
    run(
      db2,
      "INSERT INTO transactions (accountId, categoryId, amount, currency, type, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [r.accountId, r.categoryId, r.amount, r.currency, r.type, r.description, r.date]
    );
  }
  return rows.length;
}
async function getBudgets(month) {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM budgets WHERE month = ?", [month]);
}
async function setBudget(categoryId, month, amount) {
  const db2 = await getDb();
  const existing = getOne(db2, "SELECT * FROM budgets WHERE categoryId = ? AND month = ?", [categoryId, month]);
  if (existing) {
    run(db2, "UPDATE budgets SET amount = ? WHERE id = ?", [amount, existing.id]);
  } else {
    run(db2, "INSERT INTO budgets (categoryId, month, amount) VALUES (?, ?, ?)", [categoryId, month, amount]);
  }
}
async function getInvestments() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM investments ORDER BY name");
}
async function createInvestment(name, type, amount, currency) {
  const db2 = await getDb();
  run(db2, "INSERT INTO investments (name, type, amount, currency) VALUES (?, ?, ?, ?)", [name, type, amount, currency]);
  return getOne(db2, "SELECT * FROM investments WHERE id = ?", [lastInsertId(db2)]);
}
async function deleteInvestment(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM investments WHERE id = ?", [id]);
}
async function getTrips() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM trips ORDER BY startDate IS NULL, startDate ASC");
}
async function createTrip(origin, destination, startDate, endDate, budget, currency, status) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO trips (origin, destination, startDate, endDate, budget, currency, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [origin, destination, startDate, endDate, budget, currency, status]
  );
  return getOne(db2, "SELECT * FROM trips WHERE id = ?", [lastInsertId(db2)]);
}
async function updateTrip(id, origin, destination, startDate, endDate, budget, currency, status) {
  const db2 = await getDb();
  run(
    db2,
    "UPDATE trips SET origin = ?, destination = ?, startDate = ?, endDate = ?, budget = ?, currency = ?, status = ? WHERE id = ?",
    [origin, destination, startDate, endDate, budget, currency, status, id]
  );
}
async function deleteTrip(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM trips WHERE id = ?", [id]);
}
async function getFlightWatches() {
  const db2 = await getDb();
  return getAll(db2, "SELECT * FROM flight_watches ORDER BY id DESC");
}
async function createFlightWatch(tripId, origin, destination, price, currency, lastChecked) {
  const db2 = await getDb();
  run(
    db2,
    "INSERT INTO flight_watches (tripId, origin, destination, price, currency, lastChecked) VALUES (?, ?, ?, ?, ?, ?)",
    [tripId, origin, destination, price, currency, lastChecked]
  );
  return getOne(db2, "SELECT * FROM flight_watches WHERE id = ?", [lastInsertId(db2)]);
}
async function deleteFlightWatch(id) {
  const db2 = await getDb();
  run(db2, "DELETE FROM flight_watches WHERE id = ?", [id]);
}
const SENSITIVE_KEYS = /* @__PURE__ */ new Set(["github_token"]);
const ENC_PREFIX = "enc:";
function encodeSecret(key, value) {
  if (!SENSITIVE_KEYS.has(key) || !value) return value;
  if (!electron.safeStorage.isEncryptionAvailable()) return value;
  return ENC_PREFIX + electron.safeStorage.encryptString(value).toString("base64");
}
function decodeSecret(value) {
  if (value == null || !value.startsWith(ENC_PREFIX)) return value;
  try {
    return electron.safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), "base64"));
  } catch {
    return "";
  }
}
const GITHUB_API = "https://api.github.com";
function repoFromIssue(issue) {
  if (issue.repository?.full_name) return issue.repository.full_name;
  if (issue.repository_url) {
    const m = issue.repository_url.match(/repos\/(.+)$/);
    if (m) return m[1];
  }
  return "?";
}
function labelNames(labels) {
  return labels.map((l) => typeof l === "string" ? l : l.name).filter(Boolean);
}
async function syncGithubIssues() {
  const token = decodeSecret(await getSetting("github_token"));
  if (!token) {
    throw new Error("GitHub token não configurado. Vá em Configurações e adicione um token.");
  }
  const res = await fetch(`${GITHUB_API}/issues?filter=assigned&state=all&per_page=100&sort=updated`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "RickOS"
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Token inválido ou expirado (401).");
    throw new Error(`GitHub API falhou (${res.status}). ${body.slice(0, 140)}`);
  }
  const data = await res.json();
  const issues = data.filter((i) => typeof i.number === "number" && typeof i.id === "number").map((i) => ({
    id: i.id,
    number: i.number,
    title: i.title,
    state: i.state,
    repo: repoFromIssue(i),
    url: i.html_url ?? null,
    labels: JSON.stringify(labelNames(i.labels ?? [])),
    milestone: i.milestone?.title ?? null,
    updatedAt: i.updated_at ?? null
  }));
  await replaceGithubIssues(issues);
  return issues.length;
}
const TIMEOUT_MS = 12e4;
function buildPath() {
  const home = os.homedir();
  const extra = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    path.join(home, ".claude", "local"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".local", "bin")
  ];
  return [process.env.PATH || "", ...extra].join(path.delimiter);
}
function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    if (!prompt.trim()) {
      reject(new Error("Prompt vazio."));
      return;
    }
    const child = child_process.spawn("claude", ["-p", prompt], {
      env: { ...process.env, PATH: buildPath() }
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("Tempo esgotado (120s) executando o Claude CLI."));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => stdout += d.toString());
    child.stderr.on("data", (d) => stderr += d.toString());
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "Claude CLI não encontrado. Instale o Claude Code e garanta que `claude` está no PATH."
          )
        );
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Claude CLI saiu com código ${code}.`));
      }
    });
  });
}
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}
electron.app.whenReady().then(() => {
  createWindow();
  electron.globalShortcut.register("CommandOrControl+Shift+Space", () => {
    const win = electron.BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send("quick-capture:open");
  });
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
electron.app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") electron.app.quit();
});
electron.ipcMain.handle("tags:getAll", () => getAllTags());
electron.ipcMain.handle(
  "tags:create",
  (_, name, color, isProductive) => createTag(name, color, isProductive)
);
electron.ipcMain.handle(
  "tags:update",
  (_, id, name, color, isProductive) => updateTag(id, name, color, isProductive)
);
electron.ipcMain.handle("tags:delete", (_, id) => deleteTag(id));
electron.ipcMain.handle("tasks:getAll", () => getAllTasks());
electron.ipcMain.handle(
  "tasks:getForRange",
  (_, startDate, endDate) => getTasksForRange(startDate, endDate)
);
electron.ipcMain.handle("tasks:getActive", () => getActiveTask());
electron.ipcMain.handle("tasks:start", async (_, title, tagId, secondaryTagId, startTime) => {
  const now = startTime || (/* @__PURE__ */ new Date()).toISOString();
  await stopAllActiveTasks(now);
  return createTask(title, tagId, secondaryTagId, now);
});
electron.ipcMain.handle("tasks:stop", async (_, id, endTime) => {
  const now = endTime || (/* @__PURE__ */ new Date()).toISOString();
  await stopTask(id, now);
});
electron.ipcMain.handle(
  "tasks:update",
  (_, id, title, tagId, secondaryTagId, startTime, endTime) => updateTask(id, title, tagId, secondaryTagId, startTime, endTime)
);
electron.ipcMain.handle("tasks:delete", (_, id) => deleteTask(id));
electron.ipcMain.handle(
  "tasks:add",
  (_, title, tagId, secondaryTagId, startTime, endTime) => createTask(title, tagId, secondaryTagId, startTime, endTime)
);
electron.ipcMain.handle("tasks:stopAll", (_, endTime) => stopAllActiveTasks(endTime));
electron.ipcMain.handle("tasks:fillGaps", (_, date) => fillGapsWithIdle(date));
electron.ipcMain.handle(
  "stats:daily",
  (_, startDate, endDate) => getDailyStats(startDate, endDate)
);
electron.ipcMain.handle(
  "stats:byTag",
  (_, startDate, endDate) => getTagStats(startDate, endDate)
);
electron.ipcMain.handle(
  "dayConfig:update",
  (_, date, isWorkDay) => updateDayConfig(date, isWorkDay)
);
electron.ipcMain.handle("todos:getAll", (_, status) => getTodos(status));
electron.ipcMain.handle(
  "todos:create",
  (_, title, notes, status, source, priority, dueDate, projectId) => createTodo(title, notes, status, source, priority, dueDate, projectId)
);
electron.ipcMain.handle(
  "todos:update",
  (_, id, title, notes, status, priority, dueDate, projectId) => updateTodo(id, title, notes, status, priority, dueDate, projectId)
);
electron.ipcMain.handle("todos:delete", (_, id) => deleteTodo(id));
electron.ipcMain.handle("projects:getAll", () => getProjects());
electron.ipcMain.handle(
  "projects:create",
  (_, name, description, githubRepoUrl, color) => createProject(name, description, githubRepoUrl, color)
);
electron.ipcMain.handle(
  "projects:update",
  (_, id, name, description, githubRepoUrl, color, archived) => updateProject(id, name, description, githubRepoUrl, color, archived)
);
electron.ipcMain.handle("projects:delete", (_, id) => deleteProject(id));
electron.ipcMain.handle("habits:getAll", () => getHabits());
electron.ipcMain.handle(
  "habits:create",
  (_, name, frequency, target) => createHabit(name, frequency, target)
);
electron.ipcMain.handle(
  "habits:update",
  (_, id, name, frequency, target, active) => updateHabit(id, name, frequency, target, active)
);
electron.ipcMain.handle("habits:delete", (_, id) => deleteHabit(id));
electron.ipcMain.handle("habits:getEntries", (_, date) => getHabitEntries(date));
electron.ipcMain.handle(
  "habits:getEntriesRange",
  (_, startDate, endDate) => getHabitEntriesForRange(startDate, endDate)
);
electron.ipcMain.handle(
  "habits:toggleEntry",
  (_, habitId, date, completed) => toggleHabitEntry(habitId, date, completed)
);
electron.ipcMain.handle("settings:get", async (_, key) => decodeSecret(await getSetting(key)));
electron.ipcMain.handle("settings:set", (_, key, value) => setSetting(key, encodeSecret(key, value)));
electron.ipcMain.handle("settings:getAll", async () => {
  const all = await getAllSettings();
  for (const k of Object.keys(all)) all[k] = decodeSecret(all[k]) ?? "";
  return all;
});
electron.ipcMain.handle("github:getIssues", () => getGithubIssues());
electron.ipcMain.handle("github:sync", () => syncGithubIssues());
electron.ipcMain.handle(
  "calendar:upcoming",
  (_, fromISO, limit) => getUpcomingEvents(fromISO, limit)
);
electron.ipcMain.handle(
  "calendar:range",
  (_, startISO, endISO) => getEventsForRange(startISO, endISO)
);
electron.ipcMain.handle(
  "calendar:create",
  (_, title, startTime, endTime, location) => createCalendarEvent(title, startTime, endTime, location)
);
electron.ipcMain.handle("calendar:delete", (_, id) => deleteCalendarEvent(id));
electron.ipcMain.handle("accounts:getAll", () => getAccounts());
electron.ipcMain.handle("accounts:create", (_, name, currency, balance) => createAccount(name, currency, balance));
electron.ipcMain.handle("accounts:update", (_, id, name, currency, balance) => updateAccount(id, name, currency, balance));
electron.ipcMain.handle("accounts:delete", (_, id) => deleteAccount(id));
electron.ipcMain.handle("categories:getAll", () => getCategories());
electron.ipcMain.handle("categories:create", (_, name, type, color) => createCategory(name, type, color));
electron.ipcMain.handle("categories:delete", (_, id) => deleteCategory(id));
electron.ipcMain.handle("transactions:getAll", (_, month) => getTransactions(month));
electron.ipcMain.handle(
  "transactions:create",
  (_, accountId, categoryId, amount, currency, type, description, date) => createTransaction(accountId, categoryId, amount, currency, type, description, date)
);
electron.ipcMain.handle(
  "transactions:update",
  (_, id, accountId, categoryId, amount, currency, type, description, date) => updateTransaction(id, accountId, categoryId, amount, currency, type, description, date)
);
electron.ipcMain.handle("transactions:delete", (_, id) => deleteTransaction(id));
electron.ipcMain.handle("transactions:bulk", (_, rows) => bulkInsertTransactions(rows));
electron.ipcMain.handle("budgets:getForMonth", (_, month) => getBudgets(month));
electron.ipcMain.handle("budgets:set", (_, categoryId, month, amount) => setBudget(categoryId, month, amount));
electron.ipcMain.handle("investments:getAll", () => getInvestments());
electron.ipcMain.handle("investments:create", (_, name, type, amount, currency) => createInvestment(name, type, amount, currency));
electron.ipcMain.handle("investments:delete", (_, id) => deleteInvestment(id));
electron.ipcMain.handle("trips:getAll", () => getTrips());
electron.ipcMain.handle(
  "trips:create",
  (_, origin, destination, startDate, endDate, budget, currency, status) => createTrip(origin, destination, startDate, endDate, budget, currency, status)
);
electron.ipcMain.handle(
  "trips:update",
  (_, id, origin, destination, startDate, endDate, budget, currency, status) => updateTrip(id, origin, destination, startDate, endDate, budget, currency, status)
);
electron.ipcMain.handle("trips:delete", (_, id) => deleteTrip(id));
electron.ipcMain.handle("flights:getAll", () => getFlightWatches());
electron.ipcMain.handle(
  "flights:create",
  (_, tripId, origin, destination, price, currency) => createFlightWatch(tripId, origin, destination, price, currency, (/* @__PURE__ */ new Date()).toISOString())
);
electron.ipcMain.handle("flights:delete", (_, id) => deleteFlightWatch(id));
electron.ipcMain.handle("ai:run", (_, prompt) => runClaude(prompt));
electron.ipcMain.handle("app:openExternal", (_, url) => electron.shell.openExternal(url));
electron.ipcMain.handle("app:exportDb", async () => {
  saveDb();
  const dbPath2 = path.join(electron.app.getPath("userData"), "timetracker.db");
  const options = {
    title: "Export Database",
    defaultPath: "timetracker_snapshot.sqlite",
    buttonLabel: "Export",
    filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }]
  };
  const result = await electron.dialog.showSaveDialog(options);
  if (!result.canceled && result.filePath) {
    fs.copyFileSync(dbPath2, result.filePath);
    return true;
  }
  return false;
});
electron.ipcMain.handle("app:importDb", async (event) => {
  const result = await electron.dialog.showOpenDialog({
    title: "Import Database Snapshot",
    buttonLabel: "Import",
    filters: [{ name: "SQLite Database", extensions: ["sqlite", "db"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths[0]) return false;
  const dbPath2 = path.join(electron.app.getPath("userData"), "timetracker.db");
  closeDb();
  fs.copyFileSync(result.filePaths[0], dbPath2);
  const win = electron.BrowserWindow.fromWebContents(event.sender);
  win?.webContents.reload();
  return true;
});
