import { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { getDb, closeDb, saveDb } from './database/db'
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
  updateHabit,
  deleteHabit,
  getHabitEntries,
  getHabitEntriesForRange,
  toggleHabitEntry,
  getSetting,
  setSetting,
  getAllSettings,
  getGithubIssues,
  createLocalIssue,
  deleteGithubIssue,
  getUpcomingEvents,
  getEventsForRange,
  createCalendarEvent,
  deleteCalendarEvent,
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getCategories,
  createCategory,
  deleteCategory,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkInsertTransactions,
  getBudgets,
  setBudget,
  getInvestments,
  createInvestment,
  deleteInvestment,
  getTrips,
  createTrip,
  updateTrip,
  deleteTrip,
  getFlightWatches,
  createFlightWatch,
  deleteFlightWatch,
  getTripDocuments,
  setTripDocument
} from './database/queries'
import type { DbTransaction } from './database/queries'
import { syncGithubIssues, createIssueViaClaude } from './services/github'
import { runClaude } from './services/claude'
import { connectGoogle, googleConnected, disconnectGoogle, syncGoogleCalendar } from './services/google'
import { syncPluggy, pluggyConfigured } from './services/pluggy'
import { searchFlightPrice, refreshWatchPrice } from './services/flights'
import { encodeSecret, decodeSecret } from './services/secrets'

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
  (_, name: string, description: string | null, githubRepoUrl: string | null, color: string, claudeCommand: string | null) =>
    createProject(name, description, githubRepoUrl, color, claudeCommand)
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
    archived: number,
    claudeCommand: string | null
  ) => updateProject(id, name, description, githubRepoUrl, color, archived, claudeCommand)
)

ipcMain.handle('projects:delete', (_, id: number) => deleteProject(id))

// ── IPC: Habits ───────────────────────────────────────────────────────────────

ipcMain.handle('habits:getAll', () => getHabits())

ipcMain.handle('habits:create', (_, name: string, frequency: string, target: number) =>
  createHabit(name, frequency, target)
)

ipcMain.handle(
  'habits:update',
  (_, id: number, name: string, frequency: string, target: number, active: number) =>
    updateHabit(id, name, frequency, target, active)
)

ipcMain.handle('habits:delete', (_, id: number) => deleteHabit(id))

ipcMain.handle('habits:getEntries', (_, date: string) => getHabitEntries(date))

ipcMain.handle('habits:getEntriesRange', (_, startDate: string, endDate: string) =>
  getHabitEntriesForRange(startDate, endDate)
)

ipcMain.handle('habits:toggleEntry', (_, habitId: number, date: string, completed: number) =>
  toggleHabitEntry(habitId, date, completed)
)

// ── IPC: Settings ───────────────────────────────────────────────────────────
// Sensitive values (tokens) are encrypted at rest via safeStorage — see services/secrets.

ipcMain.handle('settings:get', async (_, key: string) => decodeSecret(await getSetting(key)))
ipcMain.handle('settings:set', (_, key: string, value: string) => setSetting(key, encodeSecret(key, value)))
ipcMain.handle('settings:getAll', async () => {
  const all = await getAllSettings()
  for (const k of Object.keys(all)) all[k] = decodeSecret(all[k]) ?? ''
  return all
})

// ── IPC: GitHub ───────────────────────────────────────────────────────────────

ipcMain.handle('github:getIssues', () => getGithubIssues())
ipcMain.handle('github:sync', () => syncGithubIssues())
ipcMain.handle('github:createLocal', (_, repo: string, title: string, body: string | null) =>
  createLocalIssue(repo, title, body)
)
ipcMain.handle('github:deleteIssue', (_, id: number) => deleteGithubIssue(id))
ipcMain.handle('github:createOnGithub', (_, id: number) => createIssueViaClaude(id))

// ── IPC: Calendar ─────────────────────────────────────────────────────────────

ipcMain.handle('calendar:upcoming', (_, fromISO: string, limit: number) =>
  getUpcomingEvents(fromISO, limit)
)
ipcMain.handle('calendar:range', (_, startISO: string, endISO: string) =>
  getEventsForRange(startISO, endISO)
)
ipcMain.handle(
  'calendar:create',
  (_, title: string, startTime: string, endTime: string | null, location: string | null) =>
    createCalendarEvent(title, startTime, endTime, location)
)
ipcMain.handle('calendar:delete', (_, id: number) => deleteCalendarEvent(id))

// ── IPC: Google Calendar ──────────────────────────────────────────────────────

ipcMain.handle('google:connect', () => connectGoogle())
ipcMain.handle('google:status', () => googleConnected())
ipcMain.handle('google:disconnect', () => disconnectGoogle())
ipcMain.handle('google:sync', () => syncGoogleCalendar())

// ── IPC: Finance ──────────────────────────────────────────────────────────────

ipcMain.handle('accounts:getAll', () => getAccounts())
ipcMain.handle('accounts:create', (_, name: string, currency: string, balance: number) => createAccount(name, currency, balance))
ipcMain.handle('accounts:update', (_, id: number, name: string, currency: string, balance: number) => updateAccount(id, name, currency, balance))
ipcMain.handle('accounts:delete', (_, id: number) => deleteAccount(id))

ipcMain.handle('categories:getAll', () => getCategories())
ipcMain.handle('categories:create', (_, name: string, type: string, color: string) => createCategory(name, type, color))
ipcMain.handle('categories:delete', (_, id: number) => deleteCategory(id))

ipcMain.handle('transactions:getAll', (_, month?: string) => getTransactions(month))
ipcMain.handle('transactions:create', (_, accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) =>
  createTransaction(accountId, categoryId, amount, currency, type, description, date)
)
ipcMain.handle('transactions:update', (_, id: number, accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) =>
  updateTransaction(id, accountId, categoryId, amount, currency, type, description, date)
)
ipcMain.handle('transactions:delete', (_, id: number) => deleteTransaction(id))
ipcMain.handle('transactions:bulk', (_, rows: Omit<DbTransaction, 'id'>[]) => bulkInsertTransactions(rows))

ipcMain.handle('budgets:getForMonth', (_, month: string) => getBudgets(month))
ipcMain.handle('budgets:set', (_, categoryId: number, month: string, amount: number) => setBudget(categoryId, month, amount))

ipcMain.handle('investments:getAll', () => getInvestments())
ipcMain.handle('investments:create', (_, name: string, type: string | null, amount: number, currency: string) => createInvestment(name, type, amount, currency))
ipcMain.handle('investments:delete', (_, id: number) => deleteInvestment(id))

// ── IPC: Open Finance (Pluggy) ────────────────────────────────────────────────

ipcMain.handle('pluggy:sync', () => syncPluggy())
ipcMain.handle('pluggy:status', () => pluggyConfigured())

// ── IPC: Travel ───────────────────────────────────────────────────────────────

ipcMain.handle('trips:getAll', () => getTrips())
ipcMain.handle('trips:create', (_, origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) =>
  createTrip(origin, destination, startDate, endDate, budget, currency, status)
)
ipcMain.handle('trips:update', (_, id: number, origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) =>
  updateTrip(id, origin, destination, startDate, endDate, budget, currency, status)
)
ipcMain.handle('trips:delete', (_, id: number) => deleteTrip(id))

ipcMain.handle('flights:getAll', () => getFlightWatches())
ipcMain.handle('flights:create', (_, tripId: number | null, origin: string | null, destination: string | null, price: number | null, currency: string) =>
  createFlightWatch(tripId, origin, destination, price, currency, new Date().toISOString())
)
ipcMain.handle('flights:delete', (_, id: number) => deleteFlightWatch(id))
ipcMain.handle('flights:search', (_, origin: string, destination: string, currency: string, date?: string | null) =>
  searchFlightPrice(origin, destination, currency, date)
)
ipcMain.handle('flights:refreshWatch', (_, id: number) => refreshWatchPrice(id))

ipcMain.handle('tripDocs:get', (_, tripId: number) => getTripDocuments(tripId))
ipcMain.handle('tripDocs:set', (_, tripId: number, item: string, checked: number) =>
  setTripDocument(tripId, item, checked)
)

// ── IPC: AI (Claude CLI) ──────────────────────────────────────────────────────

/** Effective Claude command: per-project override → global setting → "claude". */
async function resolveClaudeCommand(projectId?: number): Promise<string> {
  if (projectId != null) {
    const projects = await getProjects()
    const p = projects.find((x) => x.id === projectId)
    if (p?.claudeCommand && p.claudeCommand.trim()) return p.claudeCommand.trim()
  }
  return (await getSetting('claude_command')) || 'claude'
}

/** Effective model: explicit arg → global setting → '' (CLI default). */
async function resolveModel(model?: string): Promise<string> {
  return (model || (await getSetting('claude_model')) || '').trim()
}

ipcMain.handle('ai:run', async (_, prompt: string, projectId?: number, model?: string) => {
  return runClaude(prompt, await resolveClaudeCommand(projectId), { model: await resolveModel(model) })
})

// Streaming variant: emits 'ai:chunk' events as output arrives; resolves with full text.
ipcMain.handle('ai:runStream', async (event, prompt: string, projectId?: number, model?: string) => {
  const command = await resolveClaudeCommand(projectId)
  return runClaude(prompt, command, {
    model: await resolveModel(model),
    onChunk: (text) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:chunk', text)
    }
  })
})

// ── IPC: App ──────────────────────────────────────────────────────────────────

ipcMain.handle('app:openExternal', (_, url: string) => shell.openExternal(url))

ipcMain.handle('app:exportDb', async () => {
  // Ensure the DB is loaded (schema/migrations applied) and flushed so the snapshot
  // contains every table — the whole sql.js DB lives in this single file.
  await getDb()
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
