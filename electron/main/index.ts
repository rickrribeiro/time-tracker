import { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, Notification } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'
import fs from 'fs'
import { getDb, closeDb, saveDb, snapshotDailyIfNeeded, listSnapshots, restoreSnapshot } from './database/db'
import {
  getAllTags,
  getAllTasks,
  createTag,
  updateTag,
  deleteTag,
  getTasksForRange,
  getActiveTask,
  createTask,
  getStudyHoursByTopic,
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
  getHabitCompletionsForDate,
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
  getInvestmentHistory,
  createInvestment,
  setInvestmentValue,
  deleteInvestment,
  getTrips,
  createTrip,
  updateTrip,
  deleteTrip,
  getFlightWatches,
  createFlightWatch,
  deleteFlightWatch,
  getTripDocuments,
  setTripDocument,
  getSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  toggleSkillFavorite,
  importSkill,
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  toggleAgentFavorite,
  importAgent,
  getExecutions,
  createExecution,
  deleteExecution,
  getLinks,
  createLink,
  updateLink,
  setLinkChecked,
  deleteLink,
  getStudyTopics,
  createStudyTopic,
  updateStudyTopic,
  deleteStudyTopic,
  getStudyNodes,
  getAllStudyNodes,
  getAllStudyNotes,
  createStudyNode,
  updateStudyNode,
  deleteStudyNode,
  moveStudyNode,
  reorderStudyNode,
  getStudyNote,
  saveStudyNote,
  getStudyFlashcards,
  getDueFlashcards,
  createStudyFlashcard,
  updateStudyFlashcard,
  deleteStudyFlashcard,
  reviewStudyFlashcard,
  getStudyQuizAttempts,
  createStudyQuizAttempt,
  getStudyBundle,
  importStudyBundle,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getRules,
  createRule,
  updateRule,
  setRuleFired,
  deleteRule,
  getScheduledJobs,
  createScheduledJob,
  updateScheduledJob,
  setJobRan,
  deleteScheduledJob
} from './database/queries'
import type { DbTransaction, DbSkill, DbAgent, StudyBundle } from './database/queries'
import { syncGithubIssues, createIssueViaClaude } from './services/github'
import { runClaude } from './services/claude'
import { connectGoogle, googleConnected, listGoogleAccounts, disconnectGoogle, disconnectGoogleAccount, syncGoogleCalendar, uploadFileToDrive } from './services/google'
import { syncPluggy, pluggyConfigured, createConnectToken } from './services/pluggy'
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

const DAY_MS = 24 * 60 * 60 * 1000

/** Sync the Google Calendar at most once every 24h (if connected). */
async function maybeAutoSyncGoogle(): Promise<void> {
  try {
    if (!(await googleConnected())) return
    const last = await getSetting('google_last_sync')
    if (last && Date.now() - new Date(last).getTime() < DAY_MS) return
    const n = await syncGoogleCalendar()
    await setSetting('google_last_sync', new Date().toISOString())
    broadcast('calendar:updated', { source: 'google', count: n })
  } catch {
    // network/auth error — leave the timestamp so it retries on the next check
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

  // Daily local snapshot of the DB (versioning) — after the DB is loaded.
  getDb().then(() => snapshotDailyIfNeeded())

  // Rules engine: evaluate every minute while the app is open.
  setTimeout(() => void evaluateRules(), 15000)
  setInterval(() => void evaluateRules(), 60 * 1000)

  // Daily Google Calendar auto-sync: shortly after boot, then re-check every 6h.
  setTimeout(() => void maybeAutoSyncGoogle(), 8000)
  setInterval(() => void maybeAutoSyncGoogle(), 6 * 60 * 60 * 1000)

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

ipcMain.handle('tasks:start', async (_, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, studyNodeId?: number | null) => {
  const now = startTime || new Date().toISOString()
  await stopAllActiveTasks(now)
  return createTask(title, tagId, secondaryTagId, now, null, studyNodeId ?? null)
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
  (_, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null, studyNodeId?: number | null) =>
    createTask(title, tagId, secondaryTagId, startTime, endTime, studyNodeId ?? null)
)

ipcMain.handle('tasks:stopAll', (_, endTime: string) => stopAllActiveTasks(endTime))
ipcMain.handle('tasks:studyHours', () => getStudyHoursByTopic())

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
    projectId: number | null,
    aiGenerated?: number,
    recurrence?: string | null
  ) => createTodo(title, notes, status, source, priority, dueDate, projectId, aiGenerated ?? 0, recurrence ?? null)
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
    projectId: number | null,
    recurrence?: string | null
  ) => updateTodo(id, title, notes, status, priority, dueDate, projectId, recurrence)
)

ipcMain.handle('todos:delete', (_, id: number) => deleteTodo(id))

// ── IPC: Metas ────────────────────────────────────────────────────────────────
ipcMain.handle('goals:getForMonth', (_, month: string) => getGoals(month))
ipcMain.handle('goals:create', (_, month: string, title: string, kind: string, refId: number | null, target: number, unit: string | null) =>
  createGoal(month, title, kind, refId, target, unit))
ipcMain.handle('goals:update', (_, id: number, title: string, target: number, current: number, unit: string | null, done: number) =>
  updateGoal(id, title, target, current, unit, done))
ipcMain.handle('goals:delete', (_, id: number) => deleteGoal(id))

// ── IPC: Automações (regras + agendador) ──────────────────────────────────────
ipcMain.handle('rules:getAll', () => getRules())
ipcMain.handle('rules:create', (_, type: string, params: string) => createRule(type, params))
ipcMain.handle('rules:update', (_, id: number, enabled: number, params: string) => updateRule(id, enabled, params))
ipcMain.handle('rules:delete', (_, id: number) => deleteRule(id))

ipcMain.handle('jobs:getAll', () => getScheduledJobs())
ipcMain.handle('jobs:create', (_, name: string, prompt: string, hour: number) => createScheduledJob(name, prompt, hour))
ipcMain.handle('jobs:update', (_, id: number, name: string, prompt: string, hour: number, enabled: number) => updateScheduledJob(id, name, prompt, hour, enabled))
ipcMain.handle('jobs:delete', (_, id: number) => deleteScheduledJob(id))

// ── Automation engines (run while the app is open) ────────────────────────────
function notifyNative(title: string, body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  } catch {
    // ignore
  }
}

function todayRangeISO(): { start: string; end: string } {
  const n = new Date()
  return {
    start: new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString(),
    end: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toISOString()
  }
}

let evaluatingRules = false
async function evaluateRules(): Promise<void> {
  if (evaluatingRules) return
  evaluatingRules = true
  try {
    const rules = (await getRules()).filter((r) => r.enabled)
    const now = Date.now()
    for (const r of rules) {
      let params: { minutes?: number; startHour?: number; endHour?: number; count?: number; percent?: number } = {}
      try {
        params = JSON.parse(r.params)
      } catch {
        // ignore
      }
      const last = r.lastFiredAt ? new Date(r.lastFiredAt).getTime() : 0
      try {
        if (r.type === 'idle_productive') {
          const minutes = params.minutes ?? 45
          const startHour = params.startHour ?? 9
          const endHour = params.endHour ?? 18
          const h = new Date().getHours()
          if (h < startHour || h >= endHour) continue
          if (now - last < minutes * 60000) continue
          const { start, end } = todayRangeISO()
          const tasks = await getTasksForRange(start, end)
          const productive = tasks.filter((t) => (t.tagIsProductive ?? 0) !== 0)
          if (productive.some((t) => !t.endTime)) continue // productive task running now
          let lastEnd = 0
          for (const t of productive) {
            const e = t.endTime ? new Date(t.endTime).getTime() : 0
            if (e > lastEnd) lastEnd = e
          }
          const workStart = new Date()
          workStart.setHours(startHour, 0, 0, 0)
          const ref = lastEnd || workStart.getTime()
          if (now - ref >= minutes * 60000) {
            notifyNative('⏳ Hora de focar?', `Você está há ~${Math.round((now - ref) / 60000)}min sem tarefa produtiva.`)
            await setRuleFired(r.id, new Date().toISOString())
          }
        } else if (r.type === 'due_flashcards') {
          const count = params.count ?? 30
          if (now - last < 6 * 3600 * 1000) continue
          const due = await getDueFlashcards(new Date().toISOString())
          if (due.length > count) {
            notifyNative('🔁 Revisões acumulando', `${due.length} flashcards vencidos — hora de revisar.`)
            await setRuleFired(r.id, new Date().toISOString())
          }
        } else if (r.type === 'budget_threshold') {
          const percent = params.percent ?? 80
          if (now - last < 24 * 3600 * 1000) continue
          const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
          const budgets = await getBudgets(month)
          if (!budgets.length) continue
          const txs = await getTransactions(month)
          const spent: Record<number, number> = {}
          for (const t of txs) if (t.type === 'expense' && t.categoryId != null) spent[t.categoryId] = (spent[t.categoryId] ?? 0) + t.amount
          const crossed = budgets.filter((b) => b.categoryId != null && b.amount > 0 && ((spent[b.categoryId] ?? 0) / b.amount) * 100 > percent)
          if (crossed.length) {
            const cats = await getCategories()
            const names = crossed.map((b) => cats.find((c) => c.id === b.categoryId)?.name ?? `#${b.categoryId}`)
            await createTodo(`Revisar orçamento: ${names.join(', ')} passou de ${percent}%`, 'Gerado por regra automática', 'inbox', 'rule', 2, null, null, 1)
            notifyNative('💸 Orçamento estourando', `${names.join(', ')} passou de ${percent}%.`)
            await setRuleFired(r.id, new Date().toISOString())
          }
        }
      } catch {
        // ignore this rule's error, keep evaluating others
      }
    }
  } finally {
    evaluatingRules = false
  }
}

// OCR/extração de imagem para o Inbox: salva a imagem num arquivo temporário e pede
// ao Claude local (multimodal, via ferramenta Read) para extrair um JSON estruturado.
ipcMain.handle('inbox:ocr', async (_, base64: string, ext: string) => {
  const dir = join(app.getPath('temp'), 'rickos-ocr')
  fs.mkdirSync(dir, { recursive: true })
  const safeExt = /^[a-z0-9]{1,5}$/i.test(ext) ? ext : 'png'
  const file = join(dir, `${randomUUID()}.${safeExt}`)
  const b64 = base64.includes(',') ? base64.split(',')[1] : base64
  fs.writeFileSync(file, Buffer.from(b64, 'base64'))
  const prompt = `Você recebeu o caminho de uma imagem: ${file}
Use a ferramenta Read para abrir a imagem e extraia as informações em JSON.
Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON), no formato:
{ "title": string, "amount": number|null, "currency": string|null, "date": "YYYY-MM-DD"|null, "link": string|null, "note": string|null }
Regras:
- "title": tarefa/assunto curto e acionável que resume a imagem (comece com um verbo quando fizer sentido).
- "amount"/"currency": se houver valor monetário (boleto, comprovante, recibo).
- "date": se houver uma data relevante (vencimento, evento) — formato YYYY-MM-DD.
- "link": URL visível na imagem.
- "note": detalhes úteis (ex.: itens de um quadro branco, linha digitável do boleto).
- Campos ausentes = null.`
  try {
    const command = await resolveClaudeCommand()
    const out = await runClaude(prompt, command, {
      model: await resolveModel(),
      extraArgs: ['--allowedTools', 'Read'],
      timeoutMs: 180000
    })
    return { ok: true, output: out }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    try {
      fs.unlinkSync(file)
    } catch {
      // ignore cleanup errors
    }
  }
})

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
ipcMain.handle('habits:completionsForDate', (_, date: string) => getHabitCompletionsForDate(date))

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
ipcMain.handle('github:sync', async () => {
  const n = await syncGithubIssues()
  await setSetting('github_last_sync', new Date().toISOString())
  return n
})
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
ipcMain.handle('google:accounts', () => listGoogleAccounts())
ipcMain.handle('google:disconnect', () => disconnectGoogle())
ipcMain.handle('google:disconnectAccount', (_, email: string) => disconnectGoogleAccount(email))
ipcMain.handle('google:sync', async () => {
  const n = await syncGoogleCalendar()
  await setSetting('google_last_sync', new Date().toISOString())
  return n
})

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
ipcMain.handle('investments:history', () => getInvestmentHistory())
ipcMain.handle('investments:create', (_, name: string, type: string | null, amount: number, currency: string) => createInvestment(name, type, amount, currency))
ipcMain.handle('investments:setValue', (_, investmentId: number, month: string, amount: number) => setInvestmentValue(investmentId, month, amount))
ipcMain.handle('investments:delete', (_, id: number) => deleteInvestment(id))

// ── IPC: Open Finance (Pluggy) ────────────────────────────────────────────────

ipcMain.handle('pluggy:sync', async () => {
  const r = await syncPluggy()
  await setSetting('pluggy_last_sync', new Date().toISOString())
  return r
})
ipcMain.handle('pluggy:status', () => pluggyConfigured())
ipcMain.handle('pluggy:connectToken', () => createConnectToken())

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
ipcMain.handle('flights:search', async (_, origin: string, destination: string, currency: string, date?: string | null) => {
  const r = await searchFlightPrice(origin, destination, currency, date)
  await setSetting('skyscanner_last_sync', new Date().toISOString())
  return r
})
ipcMain.handle('flights:refreshWatch', async (_, id: number) => {
  const r = await refreshWatchPrice(id)
  await setSetting('skyscanner_last_sync', new Date().toISOString())
  return r
})

ipcMain.handle('tripDocs:get', (_, tripId: number) => getTripDocuments(tripId))
ipcMain.handle('tripDocs:set', (_, tripId: number, item: string, checked: number) =>
  setTripDocument(tripId, item, checked)
)

// ── IPC: IA library (skills / agents / executions) ────────────────────────────

ipcMain.handle('skills:getAll', () => getSkills())
ipcMain.handle('skills:create', (_, name: string, description: string | null, category: string | null, tags: string, content: string) =>
  createSkill(name, description, category, tags, content)
)
ipcMain.handle('skills:update', (_, id: string, name: string, description: string | null, category: string | null, tags: string, content: string) =>
  updateSkill(id, name, description, category, tags, content)
)
ipcMain.handle('skills:delete', (_, id: string) => deleteSkill(id))
ipcMain.handle('skills:toggleFavorite', (_, id: string) => toggleSkillFavorite(id))

ipcMain.handle('agents:getAll', () => getAgents())
ipcMain.handle('agents:create', (_, name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) =>
  createAgent(name, description, role, systemPrompt, defaultSkillIds, tags)
)
ipcMain.handle('agents:update', (_, id: string, name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) =>
  updateAgent(id, name, description, role, systemPrompt, defaultSkillIds, tags)
)
ipcMain.handle('agents:delete', (_, id: string) => deleteAgent(id))
ipcMain.handle('agents:toggleFavorite', (_, id: string) => toggleAgentFavorite(id))

ipcMain.handle('executions:getAll', () => getExecutions())
ipcMain.handle('executions:create', (_, agentId: string | null, skillIds: string, userPrompt: string, finalPrompt: string, response: string | null) =>
  createExecution(agentId, skillIds, userPrompt, finalPrompt, response)
)
ipcMain.handle('executions:delete', (_, id: string) => deleteExecution(id))

// ── IPC: Links ────────────────────────────────────────────────────────────────

ipcMain.handle('links:getAll', () => getLinks())
ipcMain.handle('links:create', (_, title: string, url: string, tags?: string) => createLink(title, url, tags))
ipcMain.handle('links:update', (_, id: number, title: string, url: string, tags?: string) => updateLink(id, title, url, tags))
ipcMain.handle('links:setChecked', (_, id: number, checked: number) => setLinkChecked(id, checked))
ipcMain.handle('links:delete', (_, id: number) => deleteLink(id))

// ── IPC: Estudos (Learning OS) ────────────────────────────────────────────────
ipcMain.handle('study:topics', () => getStudyTopics())
ipcMain.handle('study:createTopic', (_, name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) =>
  createStudyTopic(name, category, status, targetDate, priority, color))
ipcMain.handle('study:updateTopic', (_, id: number, name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) =>
  updateStudyTopic(id, name, category, status, targetDate, priority, color))
ipcMain.handle('study:deleteTopic', (_, id: number) => deleteStudyTopic(id))

ipcMain.handle('study:nodes', (_, topicId: number) => getStudyNodes(topicId))
ipcMain.handle('study:allNodes', () => getAllStudyNodes())
ipcMain.handle('study:allNotes', () => getAllStudyNotes())
ipcMain.handle('study:createNode', (_, topicId: number, parentId: number | null, title: string, description: string | null, estimatedHours: number | null) =>
  createStudyNode(topicId, parentId, title, description, estimatedHours))
ipcMain.handle('study:updateNode', (_, id: number, title: string, description: string | null, status: string, estimatedHours: number | null) =>
  updateStudyNode(id, title, description, status, estimatedHours))
ipcMain.handle('study:deleteNode', (_, id: number) => deleteStudyNode(id))
ipcMain.handle('study:moveNode', (_, id: number, dir: 'up' | 'down') => moveStudyNode(id, dir))
ipcMain.handle('study:reorderNode', (_, id: number, newParentId: number | null, newIndex: number) => reorderStudyNode(id, newParentId, newIndex))

ipcMain.handle('study:getNote', (_, topicId: number, nodeId: number | null) => getStudyNote(topicId, nodeId))
ipcMain.handle('study:saveNote', (_, topicId: number, nodeId: number | null, content: string) => saveStudyNote(topicId, nodeId, content))

ipcMain.handle('study:flashcards', (_, topicId?: number) => getStudyFlashcards(topicId))
ipcMain.handle('study:due', (_, nowISO: string) => getDueFlashcards(nowISO))
ipcMain.handle('study:createFlashcard', (_, topicId: number, nodeId: number | null, front: string, back: string) =>
  createStudyFlashcard(topicId, nodeId, front, back))
ipcMain.handle('study:updateFlashcard', (_, id: number, front: string, back: string) => updateStudyFlashcard(id, front, back))
ipcMain.handle('study:deleteFlashcard', (_, id: number) => deleteStudyFlashcard(id))
ipcMain.handle('study:reviewFlashcard', (_, id: number, easeFactor: number, intervalDays: number, repetitions: number, nextReviewAt: string, lastReviewedAt: string) =>
  reviewStudyFlashcard(id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt))
ipcMain.handle('study:quizAttempts', (_, topicId: number) => getStudyQuizAttempts(topicId))
ipcMain.handle('study:saveQuizAttempt', (_, topicId: number, score: number, total: number, durationMs: number | null) =>
  createStudyQuizAttempt(topicId, score, total, durationMs))

// ── IPC: Estudos export/import ────────────────────────────────────────────────
function studySlug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'topico'
  )
}

/** Consolidate a topic bundle into a single Markdown "caderno" (roadmap order). */
function studyToMarkdown(bundle: StudyBundle): string {
  const lines: string[] = [`# ${bundle.topic.name}`, '']
  const noteByNode = new Map<number | null, string>()
  for (const n of bundle.notes) noteByNode.set(n.nodeId, n.content)
  const childrenOf = (pid: number | null): typeof bundle.nodes =>
    bundle.nodes
      .filter((x) => (x.parentId ?? null) === pid)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
  const topicNote = noteByNode.get(null)
  if (topicNote && topicNote.trim()) lines.push(topicNote.trim(), '')
  const walk = (pid: number | null, level: number): void => {
    for (const node of childrenOf(pid)) {
      const h = '#'.repeat(Math.min(6, level + 1))
      lines.push(`${h} ${node.title}${node.status === 'done' ? ' ✓' : ''}`, '')
      if (node.description) lines.push(node.description, '')
      const note = noteByNode.get(node.id)
      if (note && note.trim()) lines.push(note.trim(), '')
      walk(node.id, level + 1)
    }
  }
  walk(null, 1)
  return lines.join('\n')
}

ipcMain.handle('study:exportMarkdown', async (_, topicId: number) => {
  const bundle = await getStudyBundle(topicId)
  if (!bundle) return { ok: false }
  const result = await dialog.showSaveDialog({
    title: 'Exportar caderno',
    defaultPath: `${studySlug(bundle.topic.name)}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (result.canceled || !result.filePath) return { ok: false }
  fs.writeFileSync(result.filePath, studyToMarkdown(bundle))
  return { ok: true, message: `Caderno salvo em ${result.filePath}` }
})

ipcMain.handle('study:exportJson', async (_, topicId: number) => {
  const bundle = await getStudyBundle(topicId)
  if (!bundle) return false
  return exportJson(`${studySlug(bundle.topic.name)}.study.json`, bundle)
})

ipcMain.handle('study:importJson', async () => {
  const bundle = await readJson<StudyBundle>()
  if (!bundle || !bundle.topic) return { ok: false }
  const topicId = await importStudyBundle(bundle)
  return { ok: true, topicId }
})

ipcMain.handle('study:exportFolder', async (_, topicId: number) => {
  const bundle = await getStudyBundle(topicId)
  if (!bundle) return { ok: false }
  const result = await dialog.showOpenDialog({
    title: 'Escolha a pasta de destino',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || !result.filePaths[0]) return { ok: false }
  const root = join(result.filePaths[0], studySlug(bundle.topic.name))
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(join(root, 'roadmap.json'), JSON.stringify(bundle, null, 2))
  const noteByNode = new Map<number | null, string>()
  for (const n of bundle.notes) noteByNode.set(n.nodeId, n.content)
  for (const node of bundle.nodes) {
    const note = noteByNode.get(node.id) ?? ''
    const body = `# ${node.title}\n\n${node.description ? node.description + '\n\n' : ''}${note}`
    fs.writeFileSync(join(root, `${String(node.orderIndex).padStart(3, '0')}-${studySlug(node.title)}.md`), body)
  }
  return { ok: true, message: `Exportado para ${root}` }
})

ipcMain.handle('study:importFolder', async () => {
  const result = await dialog.showOpenDialog({ title: 'Escolha a pasta do tópico', properties: ['openDirectory'] })
  if (result.canceled || !result.filePaths[0]) return { ok: false }
  const roadmapPath = join(result.filePaths[0], 'roadmap.json')
  if (!fs.existsSync(roadmapPath)) return { ok: false, error: 'roadmap.json não encontrado na pasta.' }
  try {
    const bundle = JSON.parse(fs.readFileSync(roadmapPath, 'utf8')) as StudyBundle
    const topicId = await importStudyBundle(bundle)
    return { ok: true, topicId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// Per-entity JSON export/import (mirrors app:exportDb using dialog + fs)
async function exportJson(defaultName: string, data: unknown): Promise<boolean> {
  const result = await dialog.showSaveDialog({
    title: 'Exportar',
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2))
  return true
}

async function readJson<T>(): Promise<T | null> {
  const result = await dialog.showOpenDialog({
    title: 'Importar',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return null
  return JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')) as T
}

ipcMain.handle('skills:export', async (_, id: string) => {
  const skill = (await getSkills()).find((s) => s.id === id)
  if (!skill) return false
  return exportJson(`${skill.name}.skill.json`, skill)
})
ipcMain.handle('skills:import', async () => {
  const obj = await readJson<Partial<DbSkill> & { name?: string }>()
  if (!obj || !obj.name) return null
  return importSkill(obj as Partial<DbSkill> & { name: string })
})

ipcMain.handle('agents:export', async (_, id: string) => {
  const agent = (await getAgents()).find((a) => a.id === id)
  if (!agent) return false
  return exportJson(`${agent.name}.agent.json`, agent)
})
ipcMain.handle('agents:import', async () => {
  const obj = await readJson<Partial<DbAgent> & { name?: string }>()
  if (!obj || !obj.name) return null
  return importAgent(obj as Partial<DbAgent> & { name: string })
})

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

// Tools the local Claude may use without an approval prompt (headless `-p` blocks
// everything else). Default lets it run gh/git and touch files; override via setting.
const DEFAULT_ALLOWED_TOOLS = 'Bash(gh:*) Bash(git:*) Read Write Edit Glob Grep'

async function resolveAllowedToolsArgs(): Promise<string[]> {
  const tools = ((await getSetting('claude_allowed_tools')) || DEFAULT_ALLOWED_TOOLS).trim()
  return tools ? ['--allowedTools', tools] : []
}

/** Extract `owner/repo` from an https or ssh GitHub URL, else null. */
function parseRepoSlug(url: string | null): string | null {
  if (!url) return null
  const m = url.trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i)
  return m ? m[1] : null
}

/**
 * Prompt header describing the selected project so the local Claude targets the
 * right repo. The working directory is the RickOS app (its only remote is
 * `time-tracker`), so we must tell it the project's repo explicitly and to pass
 * `--repo` to gh — otherwise it would create issues in the wrong repository.
 */
async function buildProjectContext(projectId?: number | null): Promise<string> {
  if (projectId == null) return ''
  const p = (await getProjects()).find((x) => x.id === projectId)
  if (!p) return ''
  const slug = parseRepoSlug(p.githubRepoUrl)
  const lines = ['### CONTEXTO DO PROJETO', `Projeto: ${p.name}`]
  if (p.description) lines.push(`Descrição: ${p.description}`)
  if (p.githubRepoUrl) lines.push(`Repositório GitHub: ${p.githubRepoUrl}`)
  if (slug) {
    lines.push(
      `Repositório de destino para git/gh: ${slug}`,
      `IMPORTANTE: sempre use --repo ${slug} nos comandos gh (ex.: gh issue create --repo ${slug} ...).`,
      'NÃO use o remote da pasta atual — o diretório de trabalho é o app RickOS, não este projeto.'
    )
  }
  return lines.join('\n') + '\n\n'
}

ipcMain.handle('ai:run', async (_, prompt: string, projectId?: number, model?: string) => {
  return runClaude(prompt, await resolveClaudeCommand(projectId), { model: await resolveModel(model) })
})

// ── Background AI runs (owned by main; survive renderer navigation) ────────────
interface AiRun {
  id: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  output: string
  error: string | null
  kill?: () => void
}
const aiRuns = new Map<string, AiRun>()

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.webContents.isDestroyed()) w.webContents.send(channel, payload)
}

interface AiStartParams {
  prompt: string
  projectId?: number | null
  model?: string
  agentId?: string | null
  skillIds?: string
  userPrompt?: string
  save?: boolean // persist an execution in the AI history (default true)
}

// Start a run in the background: returns runId immediately. Output accumulates in main,
// streams via 'ai:chunk', completes via 'ai:done', and the execution is persisted here —
// so it keeps running (and is saved) even if the user leaves the Prompt Runner.
ipcMain.handle('ai:start', async (_, params: AiStartParams) => {
  const runId = randomUUID()
  const run: AiRun = { id: runId, status: 'running', output: '', error: null }
  aiRuns.set(runId, run)
  const command = await resolveClaudeCommand(params.projectId ?? undefined)
  const model = await resolveModel(params.model)
  const context = await buildProjectContext(params.projectId)
  const extraArgs = await resolveAllowedToolsArgs()

  runClaude(context + params.prompt, command, {
    model,
    extraArgs, // libera gh/git/arquivos para o Claude executar (ex.: criar issue)
    timeoutMs: 0, // sem timeout: tarefas podem demorar
    streamJson: true, // transmite texto/pensamento/uso de ferramentas ao vivo
    onChunk: (text) => {
      run.output += text
      broadcast('ai:chunk', { runId, text })
    },
    registerChild: (kill) => {
      run.kill = kill
    }
  })
    .then(async (result) => {
      run.status = 'done'
      run.output = result
      if (params.save !== false) {
        try {
          await createExecution(params.agentId ?? null, params.skillIds ?? '[]', params.userPrompt ?? '', params.prompt, result)
        } catch {
          // saving is best-effort
        }
      }
      broadcast('ai:done', { runId, ok: true, output: result, error: null })
    })
    .catch((e) => {
      const cancelled = run.status === 'cancelled'
      run.status = cancelled ? 'cancelled' : 'error'
      run.error = cancelled ? 'Execução cancelada.' : e instanceof Error ? e.message : String(e)
      broadcast('ai:done', { runId, ok: false, output: run.output, error: run.error })
    })
    .finally(() => {
      // keep the finished run available for reconnect for a while, then prune
      setTimeout(() => aiRuns.delete(runId), 10 * 60 * 1000)
    })

  return runId
})

ipcMain.handle('ai:getRun', (_, runId: string) => {
  const r = aiRuns.get(runId)
  return r ? { status: r.status, output: r.output, error: r.error } : null
})

// One-shot streaming (used by the Assistente page).
ipcMain.handle('ai:runStream', async (event, prompt: string, projectId?: number, model?: string, runId?: string) => {
  const command = await resolveClaudeCommand(projectId)
  const context = await buildProjectContext(projectId)
  const extraArgs = await resolveAllowedToolsArgs()
  return runClaude(context + prompt, command, {
    model: await resolveModel(model),
    extraArgs,
    onChunk: (text) => {
      if (!event.sender.isDestroyed()) event.sender.send('ai:chunk', { runId, text })
    }
  })
})

ipcMain.handle('ai:cancel', (_, runId: string) => {
  const r = aiRuns.get(runId)
  if (r?.kill) {
    r.status = 'cancelled'
    r.kill()
    return true
  }
  return false
})

// ── IPC: App ──────────────────────────────────────────────────────────────────

ipcMain.handle('app:openExternal', (_, url: string) => shell.openExternal(url))

ipcMain.handle('app:exportDb', async () => {
  // Ensure the DB is loaded (schema/migrations applied) and flushed so the snapshot
  // contains every table — the whole sql.js DB lives in this single file.
  await getDb()
  saveDb()
  const dbPath = join(app.getPath('userData'), 'timetracker.db')

  // Ask where to send the backup: local file or Google Drive (if connected).
  const connected = await googleConnected()
  const buttons = connected
    ? ['Baixar localmente', 'Google Drive', 'Cancelar']
    : ['Baixar localmente', 'Cancelar']
  const choice = await dialog.showMessageBox({
    type: 'question',
    message: 'Exportar backup do banco',
    detail: connected
      ? 'Escolha o destino do backup.'
      : 'Dica: conecte o Google em Configurações para habilitar o envio ao Drive.',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1
  })
  const picked = buttons[choice.response]

  if (picked === 'Baixar localmente') {
    const result = await dialog.showSaveDialog({
      title: 'Exportar banco',
      defaultPath: 'timetracker_snapshot.sqlite',
      buttonLabel: 'Exportar',
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    })
    if (result.canceled || !result.filePath) return { ok: false }
    fs.copyFileSync(dbPath, result.filePath)
    return { ok: true, target: 'local', message: `Backup salvo em ${result.filePath}` }
  }

  if (picked === 'Google Drive') {
    try {
      const accounts = await listGoogleAccounts()
      let email: string | undefined = accounts[0]
      if (accounts.length > 1) {
        const accBtns = [...accounts, 'Cancelar']
        const pick = await dialog.showMessageBox({
          type: 'question',
          message: 'Enviar para qual conta Google?',
          buttons: accBtns,
          defaultId: 0,
          cancelId: accBtns.length - 1
        })
        if (accBtns[pick.response] === 'Cancelar') return { ok: false }
        email = accBtns[pick.response]
      }
      const now = new Date()
      const pad = (n: number): string => String(n).padStart(2, '0')
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
      const fileName = `timetracker_snapshot_${stamp}.sqlite`
      const r = await uploadFileToDrive(dbPath, fileName, email)
      return { ok: true, target: 'drive', message: `Enviado ao Google Drive (${r.account}): ${r.name}`, link: r.link }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return { ok: false }
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

ipcMain.handle('app:snapshots', () => listSnapshots())
ipcMain.handle('app:restoreSnapshot', async (event, snapPath: string) => {
  const ok = restoreSnapshot(snapPath)
  if (ok) BrowserWindow.fromWebContents(event.sender)?.webContents.reload()
  return ok
})
