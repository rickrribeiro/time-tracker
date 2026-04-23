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
`;
let db = null;
let dbPath;
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
  try {
    db.run("ALTER TABLE tasks ADD COLUMN secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL;");
  } catch (e) {
  }
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
async function createTask(title, tagId, secondaryTagId, startTime) {
  const db2 = await getDb();
  run(db2, "INSERT INTO tasks (title, tagId, secondaryTagId, startTime) VALUES (?, ?, ?, ?)", [
    title,
    tagId,
    secondaryTagId,
    startTime
  ]);
  const id = lastInsertId(db2);
  return { id, title, tagId, secondaryTagId, startTime, endTime: null };
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
async function getDailyStats(startDate, endDate) {
  const db2 = await getDb();
  return getAll(
    db2,
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
       ) as productiveErosMinutes,
       COALESCE(dc.isWorkDay, 0) as isWorkDay
     FROM tasks t
     LEFT JOIN tags tg ON t.tagId = tg.id
     LEFT JOIN day_configs dc ON substr(t.startTime, 1, 10) = dc.date
     WHERE t.startTime >= ? AND t.startTime < ?
     GROUP BY substr(t.startTime, 1, 10)
     
     UNION ALL
     
     SELECT
       date,
       0 as totalMinutes,
       0 as productiveMinutes,
       0 as semiProductiveMinutes,
       0 as productiveErosMinutes,
       isWorkDay
     FROM day_configs
     WHERE date >= substr(?, 1, 10) AND date < substr(?, 1, 10)
       AND date NOT IN (SELECT substr(startTime, 1, 10) FROM tasks WHERE startTime >= ? AND startTime < ?)

     ORDER BY date ASC`,
    [startDate, endDate, startDate, endDate, startDate, endDate]
  );
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
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
  async (_, title, tagId, secondaryTagId, startTime, endTime) => {
    const task = await createTask(title, tagId, secondaryTagId, startTime);
    console.log("Created task:", task);
    if (endTime) return updateTask(task.id, title, tagId, secondaryTagId, startTime, endTime);
    return task;
  }
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
