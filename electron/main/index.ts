import { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { closeDb, saveDb } from './database/db'
import {
  getAllTags,
  getAllTasks,
  createTag,
  updateTag,
  deleteTag,
  getTasksForRange,
  getActiveTask,
  createTask,
  updateTask,
  stopTask,
  deleteTask,
  stopAllActiveTasks,
  getDailyStats,
  getTagStats,
  fillGapsWithIdle,
  updateDayConfig,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getHabits,
  createHabit,
  deleteHabit,
  getHabitEntries,
  toggleHabitEntry,
  getSetting,
  setSetting,
  getAllSettings,
  getGithubIssues
} from './database/queries'
import { syncGithubIssues } from './services/github'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  // Global quick-capture: focus the window and open the capture modal
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('quick-capture:open')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: Tags ─────────────────────────────────────────────────────────────────

ipcMain.handle('tags:getAll', () => getAllTags())

ipcMain.handle('tags:create', (_, name: string, color: string, isProductive: number) =>
  createTag(name, color, isProductive)
)

ipcMain.handle('tags:update', (_, id: number, name: string, color: string, isProductive: number) =>
  updateTag(id, name, color, isProductive)
)

ipcMain.handle('tags:delete', (_, id: number) => deleteTag(id))

// ── IPC: Tasks ────────────────────────────────────────────────────────────────

ipcMain.handle('tasks:getAll', () => getAllTasks())

ipcMain.handle('tasks:getForRange', (_, startDate: string, endDate: string) =>
  getTasksForRange(startDate, endDate)
)

ipcMain.handle('tasks:getActive', () => getActiveTask())

ipcMain.handle('tasks:start', async (_, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string) => {
  const now = startTime || new Date().toISOString()
  await stopAllActiveTasks(now)
  return createTask(title, tagId, secondaryTagId, now)
})

ipcMain.handle('tasks:stop', async (_, id: number, endTime?: string) => {
  const now = endTime || new Date().toISOString()
  await stopTask(id, now)
})

ipcMain.handle(
  'tasks:update',
  (_, id: number, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null) =>
    updateTask(id, title, tagId, secondaryTagId, startTime, endTime)
)

ipcMain.handle('tasks:delete', (_, id: number) => deleteTask(id))

ipcMain.handle(
  'tasks:add',
  (_, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null) =>
    createTask(title, tagId, secondaryTagId, startTime, endTime)
)

ipcMain.handle('tasks:stopAll', (_, endTime: string) => stopAllActiveTasks(endTime))

ipcMain.handle('tasks:fillGaps', (_, date: string) => fillGapsWithIdle(date))

// ── IPC: Stats ────────────────────────────────────────────────────────────────

ipcMain.handle('stats:daily', (_, startDate: string, endDate: string) =>
  getDailyStats(startDate, endDate)
)

ipcMain.handle('stats:byTag', (_, startDate: string, endDate: string) =>
  getTagStats(startDate, endDate)
)

ipcMain.handle('dayConfig:update', (_, date: string, isWorkDay: number) =>
  updateDayConfig(date, isWorkDay)
)

// ── IPC: Todos (Inbox + TODO) ───────────────────────────────────────────────

ipcMain.handle('todos:getAll', (_, status?: string) => getTodos(status))

ipcMain.handle(
  'todos:create',
  (
    _,
    title: string,
    notes: string | null,
    status: string,
    source: string,
    priority: number,
    dueDate: string | null,
    projectId: number | null
  ) => createTodo(title, notes, status, source, priority, dueDate, projectId)
)

ipcMain.handle(
  'todos:update',
  (
    _,
    id: number,
    title: string,
    notes: string | null,
    status: string,
    priority: number,
    dueDate: string | null,
    projectId: number | null
  ) => updateTodo(id, title, notes, status, priority, dueDate, projectId)
)

ipcMain.handle('todos:delete', (_, id: number) => deleteTodo(id))

// ── IPC: Projects ─────────────────────────────────────────────────────────────

ipcMain.handle('projects:getAll', () => getProjects())

ipcMain.handle(
  'projects:create',
  (_, name: string, description: string | null, githubRepoUrl: string | null, color: string) =>
    createProject(name, description, githubRepoUrl, color)
)

ipcMain.handle(
  'projects:update',
  (
    _,
    id: number,
    name: string,
    description: string | null,
    githubRepoUrl: string | null,
    color: string,
    archived: number
  ) => updateProject(id, name, description, githubRepoUrl, color, archived)
)

ipcMain.handle('projects:delete', (_, id: number) => deleteProject(id))

// ── IPC: Habits ───────────────────────────────────────────────────────────────

ipcMain.handle('habits:getAll', () => getHabits())

ipcMain.handle('habits:create', (_, name: string, frequency: string, target: number) =>
  createHabit(name, frequency, target)
)

ipcMain.handle('habits:delete', (_, id: number) => deleteHabit(id))

ipcMain.handle('habits:getEntries', (_, date: string) => getHabitEntries(date))

ipcMain.handle('habits:toggleEntry', (_, habitId: number, date: string, completed: number) =>
  toggleHabitEntry(habitId, date, completed)
)

// ── IPC: Settings ───────────────────────────────────────────────────────────

ipcMain.handle('settings:get', (_, key: string) => getSetting(key))
ipcMain.handle('settings:set', (_, key: string, value: string) => setSetting(key, value))
ipcMain.handle('settings:getAll', () => getAllSettings())

// ── IPC: GitHub ───────────────────────────────────────────────────────────────

ipcMain.handle('github:getIssues', () => getGithubIssues())
ipcMain.handle('github:sync', () => syncGithubIssues())

// ── IPC: App ──────────────────────────────────────────────────────────────────

ipcMain.handle('app:openExternal', (_, url: string) => shell.openExternal(url))

ipcMain.handle('app:exportDb', async () => {
  saveDb()
  const dbPath = join(app.getPath('userData'), 'timetracker.db')
  const options = {
    title: 'Export Database',
    defaultPath: 'timetracker_snapshot.sqlite',
    buttonLabel: 'Export',
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
  }
  const result = await dialog.showSaveDialog(options)
  if (!result.canceled && result.filePath) {
    fs.copyFileSync(dbPath, result.filePath)
    return true
  }
  return false
})

ipcMain.handle('app:importDb', async (event) => {
  const result = await dialog.showOpenDialog({
    title: 'Import Database Snapshot',
    buttonLabel: 'Import',
    filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return false

  const dbPath = join(app.getPath('userData'), 'timetracker.db')
  closeDb()
  fs.copyFileSync(result.filePaths[0], dbPath)

  const win = BrowserWindow.fromWebContents(event.sender)
  win?.webContents.reload()
  return true
})
