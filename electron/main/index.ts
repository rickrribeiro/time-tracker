import { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } from 'electron'
import { randomUUID } from 'crypto'
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
  deleteLink
} from './database/queries'
import type { DbTransaction, DbSkill, DbAgent } from './database/queries'
import { syncGithubIssues, createIssueViaClaude } from './services/github'
import { runClaude } from './services/claude'
import { connectGoogle, googleConnected, listGoogleAccounts, disconnectGoogle, disconnectGoogleAccount, syncGoogleCalendar } from './services/google'
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
      try {
        await createExecution(params.agentId ?? null, params.skillIds ?? '[]', params.userPrompt ?? '', params.prompt, result)
      } catch {
        // saving is best-effort
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
