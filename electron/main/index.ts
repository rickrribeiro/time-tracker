import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
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
  fillGapsWithIdle
} from './database/queries'

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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
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
  async (_, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null) => {
    const task = await createTask(title, tagId, secondaryTagId, startTime)
    console.log('Created task:', task)
    if (endTime) return updateTask(task.id, title, tagId, secondaryTagId, startTime, endTime)
    return task
  }
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

// ── IPC: App ──────────────────────────────────────────────────────────────────

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
