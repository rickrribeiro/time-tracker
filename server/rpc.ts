import { randomUUID } from 'crypto'
import os from 'os'
import { join } from 'path'
import fs from 'fs'
import { getDb, saveDb, dbFilePath, replaceDbFile, listSnapshots, restoreSnapshot } from './database/db'
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
  updateDayConfig,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  getProjects,
  createProject,
  updateProject,
  setProjectStage,
  deleteProject,
  getProjectMilestones,
  createProjectMilestone,
  toggleProjectMilestone,
  deleteProjectMilestone,
  getProject,
  patchProject,
  setProjectStatus,
  completeNextAction,
  getProjectEvents,
  addProjectEvent,
  updateProjectMilestone,
  getProjectCycles,
  createProjectCycle,
  updateProjectCycle,
  extendProjectCycle,
  closeProjectCycle,
  deleteProjectCycle,
  getProjectNotes,
  saveProjectNote,
  deleteProjectNote,
  linkTodosToProject,
  setTodoMilestone,
  setTagProject,
  setTaskProject,
  getProjectTasks,
  getProjectHours,
  getUnlinkedTagHours,
  getDelegations,
  getProjectCycle,
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
  setLinkOpened,
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
  getStudyReviewCountsByDay,
  getStudyQuizAttempts,
  createStudyQuizAttempt,
  getStudyBundle,
  importStudyBundle,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  getStayFavorites,
  addStayFavorite,
  removeStayFavorite,
  getStayWatches,
  addStayWatch,
  updateStayWatchPrice,
  removeStayWatch,
  getStayPriceHistory,
  addStayPricePoint,
  getStaySearchHistory,
  addStaySearchHistory,
  getContacts,
  createContact,
  updateContact,
  logContact,
  deleteContact,
  getRules,
  createRule,
  updateRule,
  setRuleFired,
  deleteRule,
  getScheduledJobs,
  createScheduledJob,
  updateScheduledJob,
  setJobRan,
  deleteScheduledJob,
  getAiUsage,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications
} from './database/queries'
import type { NotificationInput } from './database/queries'
import type { DbTransaction, DbSkill, DbAgent, StudyBundle, DbStayFavorite, DbStayWatch, DbStayPricePoint } from './database/queries'
import { syncGithubIssues, createIssueViaClaude } from './services/github'
import { runClaude } from './services/claude'
import { beginGoogleConnect, awaitGoogleConnect, googleConnected, listGoogleAccounts, disconnectGoogle, disconnectGoogleAccount, syncGoogleCalendar, uploadFileToDrive } from './services/google'
import { syncPluggy, pluggyConfigured, createConnectToken } from './services/pluggy'
import { registerFlightRpc } from './flights/rpc'
import { schedulerTick as flightsTick, bootFlights } from './flights/runner'
import { encodeSecret, decodeSecret, legacySecrets } from './services/secrets'
import { broadcast } from './events'
import { notify, notificationsChanged } from './services/notifications'
import { suggestProjects, ignoreProjectSuggestion, restoreProjectSuggestions } from './services/projectScan'
import { projectsOverview, projectCommits, readRoadmap, setRoadmapItem, createRoadmapTemplate, checkProjectRadar, generateCycleChangelog, cycleCommits, setProjectSchedule } from './services/projectHub'
import { claudeHookStatus, installClaudeHook, uninstallClaudeHook, handleClaudeSession, AUTO_WHERE_KEY, HOOK_MODEL_KEY } from './services/claudeHook'
import type { SessionPayload } from './services/claudeHook'
import { delegateNextAction, cancelDelegation, reviewDelegation, discardDelegation, acceptDelegation, prDelegation, recoverDelegations } from './services/delegation'
import type { ProjectStatusPayload } from './database/queries'
import {
  scanGit,
  cachedScan,
  branchDetails,
  pruneWorktrees,
  fetchRepo,
  deleteMergedBranch,
  createPullRequest,
  openPath
} from './services/gitscan'
import { getConfig } from './config'

/**
 * RPC registry: every `<ns>:<action>` channel the clients can call. The handlers
 * were moved verbatim from the old Electron main process; `ipcMain` below is a
 * tiny shim so they keep their original `(event, ...args)` signature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: RpcEvent, ...args: any[]) => unknown
export interface RpcEvent {
  /** Kept for signature compatibility with the old ipcMain handlers. */
  readonly source: 'rpc'
}
export const handlers = new Map<string, Handler>()
const ipcMain = {
  handle(channel: string, fn: Handler): void {
    handlers.set(channel, fn)
  }
}

export async function callRpc(channel: string, args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`Canal RPC desconhecido: ${channel}`)
  return fn({ source: 'rpc' }, ...args)
}

/** Hora local do sync automático diário do Google Calendar. */
const GOOGLE_SYNC_HOUR = 7

/** Sincroniza e registra o resultado (`google_last_sync` / `google_last_sync_error`). */
async function runGoogleSync(): Promise<number> {
  try {
    const n = await syncGoogleCalendar()
    await setSetting('google_last_sync', new Date().toISOString())
    await setSetting('google_last_sync_error', '')
    broadcast('calendar:updated', { source: 'google', count: n })
    return n
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await setSetting('google_last_sync_error', `${new Date().toISOString()}|${msg}`)
    throw e
  }
}

/**
 * Sync diário às 7h (hora local). Se o servidor estava desligado às 7h, roda na
 * primeira checagem depois disso no mesmo dia. Uma tentativa por dia: se falhar,
 * avisa na central de notificações em vez de tentar de novo a cada checagem.
 */
async function maybeDailyGoogleSync(): Promise<void> {
  const now = new Date()
  if (now.getHours() < GOOGLE_SYNC_HOUR) return
  const today = now.toLocaleDateString('sv-SE') // YYYY-MM-DD local
  try {
    if ((await getSetting('google_autosync_day')) === today) return
    if (!(await googleConnected())) return
    await setSetting('google_autosync_day', today)
    await runGoogleSync()
  } catch (e) {
    await notify({
      title: '📅 Falha ao sincronizar o Google Calendar',
      body: e instanceof Error ? e.message : String(e),
      source: 'google',
      page: 'settings'
    })
  }
}

let schedulerStarted = false
/** Background engines (rules, scheduled agents, Google sync) — run while the server is up. */
export function startScheduler(): void {
  if (schedulerStarted) return
  schedulerStarted = true
  // Rules engine: evaluate every minute.
  setTimeout(() => void evaluateRules(), 15000)
  setInterval(() => void evaluateRules(), 60 * 1000)
  // Scheduled agents: check every 5 minutes (+ shortly after boot).
  setTimeout(() => void runScheduledJobs(), 20000)
  setInterval(() => void runScheduledJobs(), 5 * 60 * 1000)
  // Google Calendar: sync diário às 7h (checa a cada 5 min).
  setTimeout(() => void maybeDailyGoogleSync(), 10000)
  setInterval(() => void maybeDailyGoogleSync(), 5 * 60 * 1000)
  // Radar de projetos: notificações 1x/dia (pausa vencida, foco sem próxima ação, ciclos…).
  setTimeout(() => void checkProjectRadar().catch(() => undefined), 60000)
  void recoverDelegations().catch(() => undefined)
  setInterval(() => void checkProjectRadar().catch(() => undefined), 60 * 60 * 1000)
  // Passagens: retoma execuções interrompidas, migra registros antigos e dispara monitores vencidos.
  void bootFlights().catch((e) => console.error('[flights] boot', e))
  setTimeout(() => void flightsTick().catch(() => undefined), 45000)
  setInterval(() => void flightsTick().catch(() => undefined), 5 * 60 * 1000)
}

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

ipcMain.handle('tasks:start', async (_, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, studyNodeId?: number | null, projectId?: number | null) => {
  const now = startTime || new Date().toISOString()
  await stopAllActiveTasks(now)
  return createTask(title, tagId, secondaryTagId, now, null, studyNodeId ?? null, projectId ?? null)
})
ipcMain.handle('tasks:setProject', (_, taskId: number, projectId: number | null) => setTaskProject(taskId, projectId))

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
    recurrence?: string | null,
    type?: string
  ) => createTodo(title, notes, status, source, priority, dueDate, projectId, aiGenerated ?? 0, recurrence ?? null, type ?? 'projeto')
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
    recurrence?: string | null,
    type?: string
  ) => updateTodo(id, title, notes, status, priority, dueDate, projectId, recurrence, type)
)

ipcMain.handle('todos:delete', (_, id: number) => deleteTodo(id))

// ── IPC: Metas ────────────────────────────────────────────────────────────────
ipcMain.handle('goals:getForMonth', (_, month: string) => getGoals(month))
ipcMain.handle('goals:create', (_, month: string, title: string, kind: string, refId: number | null, target: number, unit: string | null) =>
  createGoal(month, title, kind, refId, target, unit))
ipcMain.handle('goals:update', (_, id: number, title: string, target: number, current: number, unit: string | null, done: number) =>
  updateGoal(id, title, target, current, unit, done))
ipcMain.handle('goals:delete', (_, id: number) => deleteGoal(id))

// ── IPC: Travel Stay Finder ───────────────────────────────────────────────────
ipcMain.handle('stays:favorites', () => getStayFavorites())
ipcMain.handle('stays:addFavorite', (_, f: DbStayFavorite) => addStayFavorite(f))
ipcMain.handle('stays:removeFavorite', (_, id: string) => removeStayFavorite(id))
ipcMain.handle('stays:watches', () => getStayWatches())
ipcMain.handle('stays:addWatch', (_, w: DbStayWatch) => addStayWatch(w))
ipcMain.handle('stays:updateWatchPrice', (_, id: string, current: number, best: number, at: string) => updateStayWatchPrice(id, current, best, at))
ipcMain.handle('stays:removeWatch', (_, id: string) => removeStayWatch(id))
ipcMain.handle('stays:priceHistory', (_, watchId: string) => getStayPriceHistory(watchId))
ipcMain.handle('stays:addPricePoint', (_, p: DbStayPricePoint) => addStayPricePoint(p))
ipcMain.handle('stays:searchHistory', () => getStaySearchHistory())
ipcMain.handle('stays:addSearchHistory', (_, filters: string) => addStaySearchHistory(filters))

// ── IPC: CRM (contatos) ───────────────────────────────────────────────────────
ipcMain.handle('contacts:getAll', () => getContacts())
ipcMain.handle('contacts:create', (_, name: string, location: string | null, country: string | null, state: string | null, birthday: string | null, interests: string | null, context: string | null, nextFollowUp: string | null) =>
  createContact(name, location, country, state, birthday, interests, context, nextFollowUp))
ipcMain.handle('contacts:update', (_, id: number, name: string, location: string | null, country: string | null, state: string | null, birthday: string | null, interests: string | null, context: string | null, lastContactAt: string | null, nextFollowUp: string | null) =>
  updateContact(id, name, location, country, state, birthday, interests, context, lastContactAt, nextFollowUp))
ipcMain.handle('contacts:log', (_, id: number) => logContact(id))
ipcMain.handle('contacts:delete', (_, id: number) => deleteContact(id))

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
function notifyNative(title: string, body: string, page?: string): void {
  void notify({ title, body, source: 'automacao', page: page ?? null })
}

// ── Notificações (sino da sidebar) ────────────────────────────────────────────
ipcMain.handle('notifications:list', (_, limit?: number) => getNotifications(limit ?? 100))
ipcMain.handle('notifications:unreadCount', () => getUnreadNotificationCount())
ipcMain.handle('notifications:create', (_, n: NotificationInput) => notify(n))
ipcMain.handle('notifications:markRead', async (_, id: number, read?: boolean) => {
  await markNotificationRead(id, read !== false)
  notificationsChanged()
})
ipcMain.handle('notifications:markAllRead', async () => {
  await markAllNotificationsRead()
  notificationsChanged()
})
ipcMain.handle('notifications:delete', async (_, id: number) => {
  await deleteNotification(id)
  notificationsChanged()
})
ipcMain.handle('notifications:clear', async (_, onlyRead?: boolean) => {
  await clearNotifications(!!onlyRead)
  notificationsChanged()
})

function todayRangeISO(): { start: string; end: string } {
  const n = new Date()
  return {
    start: new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString(),
    end: new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).toISOString()
  }
}

// Scheduled agents: run each enabled job once per day at/after its hour; output → Inbox.
let runningJobs = false
async function runScheduledJobs(): Promise<void> {
  if (runningJobs) return
  runningJobs = true
  try {
    const jobs = (await getScheduledJobs()).filter((j) => j.enabled)
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    for (const job of jobs) {
      if (now.getHours() < job.hour) continue
      const ranDay = job.lastRunAt ? job.lastRunAt.slice(0, 10) : ''
      // lastRunAt is stored as local YYYY-MM-DD to compare against "today"
      if (ranDay === todayStr) continue
      await setJobRan(job.id, todayStr) // mark first to avoid double-run if it takes long
      try {
        const command = await resolveClaudeCommand()
        const out = await runClaude(job.prompt, command, { model: await resolveModel(), timeoutMs: 0, usage: { source: 'agendador' } })
        const text = (out || '').trim()
        if (text) {
          await createTodo(`🤖 ${job.name}`, text.slice(0, 4000), 'inbox', 'agent', 1, null, null, 1)
          broadcast('inbox:updated', { jobId: job.id })
          void notify({ title: `🤖 ${job.name}`, body: 'O agente agendado terminou — resultado no Inbox.', source: 'agendador', page: 'inbox' })
        }
      } catch {
        // leave it marked as run today; try again tomorrow
      }
    }
  } finally {
    runningJobs = false
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
      let params: { minutes?: number; startHour?: number; endHour?: number; count?: number; percent?: number; days?: number } = {}
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
            notifyNative('⏳ Hora de focar?', `Você está há ~${Math.round((now - ref) / 60000)}min sem tarefa produtiva.`, 'timeline')
            await setRuleFired(r.id, new Date().toISOString())
          }
        } else if (r.type === 'due_flashcards') {
          const count = params.count ?? 30
          if (now - last < 6 * 3600 * 1000) continue
          const due = await getDueFlashcards(new Date().toISOString())
          if (due.length > count) {
            notifyNative('🔁 Revisões acumulando', `${due.length} flashcards vencidos — hora de revisar.`, 'estudos-review')
            await setRuleFired(r.id, new Date().toISOString())
          }
        } else if (r.type === 'stale_branches') {
          const days = params.days ?? 3
          if (now - last < 24 * 3600 * 1000) continue
          const scan = await cachedScan(30 * 60 * 1000)
          const lost = scan.branches.filter(
            (b) => (b.status === 'risk' || b.status === 'forgotten') && (b.idleDays ?? 0) >= days
          )
          if (lost.length) {
            const repos = [...new Set(lost.map((b) => b.repoName))]
            notifyNative(
              '🌿 Trabalho esquecido em branches',
              `${lost.length} branch(es) parada(s) há ${days}+ dias com código não entregue: ${repos.slice(0, 4).join(', ')}${repos.length > 4 ? '…' : ''}`,
              'worktrees'
            )
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
            notifyNative('💸 Orçamento estourando', `${names.join(', ')} passou de ${percent}%.`, 'budget')
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
  const dir = join(os.tmpdir(), 'rickos-ocr')
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
      timeoutMs: 180000,
      usage: { source: 'inbox' }
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
  (_, name: string, description: string | null, githubRepoUrl: string | null, color: string, claudeCommand: string | null, localPath?: string | null, stage?: string, businessModel?: string | null, pricing?: string | null, audience?: string | null) =>
    createProject(name, description, githubRepoUrl, color, claudeCommand, localPath ?? null, stage ?? 'ideia', businessModel ?? null, pricing ?? null, audience ?? null)
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
    claudeCommand: string | null,
    localPath?: string | null,
    stage?: string,
    businessModel?: string | null,
    pricing?: string | null,
    audience?: string | null
  ) => updateProject(id, name, description, githubRepoUrl, color, archived, claudeCommand, localPath ?? null, stage ?? 'ideia', businessModel ?? null, pricing ?? null, audience ?? null)
)

ipcMain.handle('projects:setStage', (_, id: number, stage: string) => setProjectStage(id, stage))
ipcMain.handle('projects:delete', (_, id: number) => deleteProject(id))
// Sugestões: pastas da pasta de projetos do computador (padrão ~/Projects) ainda não cadastradas.
ipcMain.handle('projects:suggestions', () => suggestProjects())
ipcMain.handle('projects:ignoreSuggestion', (_, dir: string) => ignoreProjectSuggestion(dir))
ipcMain.handle('projects:restoreSuggestions', () => restoreProjectSuggestions())

ipcMain.handle('milestones:getAll', () => getProjectMilestones())
ipcMain.handle('milestones:create', (_, projectId: number, title: string, targetDate: string | null) => createProjectMilestone(projectId, title, targetDate))
ipcMain.handle('milestones:toggle', (_, id: number, done: number) => toggleProjectMilestone(id, done))
ipcMain.handle('milestones:delete', (_, id: number) => deleteProjectMilestone(id))
ipcMain.handle('milestones:update', (_, id: number, title: string, targetDate: string | null, cycleId: number | null, description: string | null) =>
  updateProjectMilestone(id, title, targetDate, cycleId, description)
)

// ── IPC: Central de Projetos ──────────────────────────────────────────────────
const projectsChanged = (id?: number): void => broadcast('projects:updated', { id: id ?? null })
ipcMain.handle('projects:get', (_, id: number) => getProject(id))
ipcMain.handle('projects:patch', async (_, id: number, fields: Record<string, string | number | null>) => {
  const p = await patchProject(id, fields)
  projectsChanged(id)
  return p
})
ipcMain.handle('projects:setStatus', async (_, id: number, status: string, payload?: ProjectStatusPayload) => {
  const p = await setProjectStatus(id, status, payload ?? {})
  projectsChanged(id)
  return p
})
ipcMain.handle('projects:completeNextAction', async (_, id: number, next: string | null, size?: string | null) => {
  const p = await completeNextAction(id, next, size ?? null)
  projectsChanged(id)
  return p
})
ipcMain.handle('projects:overview', () => projectsOverview())
ipcMain.handle('projects:events', (_, projectId?: number | null, limit?: number) => getProjectEvents(projectId ?? null, limit ?? 200))
ipcMain.handle('projects:addEvent', async (_, projectId: number, kind: string, text: string | null) => {
  await addProjectEvent(projectId, kind, text)
  projectsChanged(projectId)
})
ipcMain.handle('projects:commits', (_, projectId: number, limit?: number) => projectCommits(projectId, limit ?? 30))
ipcMain.handle('projects:tasks', (_, projectId: number, limit?: number) => getProjectTasks(projectId, limit ?? 100))
ipcMain.handle('projects:hours', (_, from: string, to: string) => getProjectHours(from, to))
ipcMain.handle('projects:unlinkedTags', () => getUnlinkedTagHours())
ipcMain.handle('projects:linkTodos', (_, todoIds: number[], projectId: number | null, milestoneId?: number | null) => linkTodosToProject(todoIds, projectId, milestoneId ?? null))
ipcMain.handle('projects:setTodoMilestone', (_, todoId: number, milestoneId: number | null) => setTodoMilestone(todoId, milestoneId))
ipcMain.handle('projects:linkTag', (_, tagId: number, projectId: number | null) => setTagProject(tagId, projectId))
ipcMain.handle('projects:roadmap', (_, projectId: number) => readRoadmap(projectId))
ipcMain.handle('projects:roadmapSet', (_, projectId: number, line: number, expected: string, mark: ' ' | 'x' | '~' | '-') => setRoadmapItem(projectId, line, expected, mark))
ipcMain.handle('projects:roadmapCreate', (_, projectId: number) => createRoadmapTemplate(projectId))
ipcMain.handle('projects:radarCheck', () => checkProjectRadar(true))
ipcMain.handle('cycles:getAll', (_, projectId?: number | null) => getProjectCycles(projectId ?? null))
ipcMain.handle('cycles:create', (_, projectId: number, name: string, goal: string | null, startDate: string, dueDate: string | null) => createProjectCycle(projectId, name, goal, startDate, dueDate))
ipcMain.handle('cycles:update', (_, id: number, name: string, goal: string | null, dueDate: string | null) => updateProjectCycle(id, name, goal, dueDate))
ipcMain.handle('cycles:extend', (_, id: number, newDueDate: string, reason: string | null) => extendProjectCycle(id, newDueDate, reason))
ipcMain.handle('cycles:close', async (_, id: number, status: 'concluido' | 'cancelado', retrospective: string | null) => {
  await closeProjectCycle(id, status, retrospective)
  // sempre deixa um changelog (agrupado pelos commits) — a versão com IA é opcional
  const c = await getProjectCycle(id)
  if (status === 'concluido' && c && !c.changelog) await generateCycleChangelog(id, false).catch(() => undefined)
})
ipcMain.handle('cycles:changelog', (_, id: number, useAi: boolean) => generateCycleChangelog(id, !!useAi))
ipcMain.handle('cycles:commits', (_, id: number) => cycleCommits(id))
ipcMain.handle('projects:setSchedule', async (_, projectId: number, days: number[], start: string | null, minutes: number | null, syncCalendar: boolean) => {
  const r = await setProjectSchedule(projectId, days, start, minutes, !!syncCalendar)
  projectsChanged(projectId)
  return r
})
// Hook do Claude Code ("onde parei" automático)
ipcMain.handle('projects:claudeSession', (_, payload: SessionPayload) => handleClaudeSession(payload))
ipcMain.handle('projects:hookStatus', () => claudeHookStatus())
ipcMain.handle('projects:hookInstall', () => installClaudeHook())
ipcMain.handle('projects:hookUninstall', () => uninstallClaudeHook())
ipcMain.handle('projects:hookConfig', async (_, enabled: boolean, model: string | null) => {
  await setSetting(AUTO_WHERE_KEY, enabled ? '1' : '0')
  if (model != null) await setSetting(HOOK_MODEL_KEY, model.trim())
  return claudeHookStatus()
})
// Delegar a próxima ação ao Claude (worktree isolado)
ipcMain.handle('delegations:getAll', (_, projectId?: number | null) => getDelegations(projectId ?? null))
ipcMain.handle('delegations:start', (_, projectId: number, action: string | null, instructions: string | null) => delegateNextAction(projectId, action, instructions))
ipcMain.handle('delegations:cancel', (_, id: number) => cancelDelegation(id))
ipcMain.handle('delegations:review', (_, id: number) => reviewDelegation(id))
ipcMain.handle('delegations:discard', (_, id: number) => discardDelegation(id))
ipcMain.handle('delegations:accept', (_, id: number) => acceptDelegation(id))
ipcMain.handle('delegations:pr', (_, id: number) => prDelegation(id))
ipcMain.handle('cycles:delete', (_, id: number) => deleteProjectCycle(id))
ipcMain.handle('projectNotes:getAll', (_, projectId: number) => getProjectNotes(projectId))
ipcMain.handle('projectNotes:save', (_, note: { id?: number | null; projectId: number; kind: string; title: string; body: string | null; url: string | null; pinned?: number }) => saveProjectNote(note))
ipcMain.handle('projectNotes:delete', (_, id: number) => deleteProjectNote(id))

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
ipcMain.handle('settings:legacySecrets', () => legacySecrets())
ipcMain.handle('settings:getAll', async () => {
  const all = await getAllSettings()
  for (const k of Object.keys(all)) all[k] = decodeSecret(all[k]) ?? ''
  return all
})

// ── IPC: GitHub ───────────────────────────────────────────────────────────────

ipcMain.handle('github:getIssues', () => getGithubIssues())
ipcMain.handle('github:sync', () => syncGithubIssues(true))
ipcMain.handle('github:createLocal', (_, repo: string, title: string, body: string | null) =>
  createLocalIssue(repo, title, body)
)
ipcMain.handle('github:deleteIssue', (_, id: number) => deleteGithubIssue(id))
ipcMain.handle('github:createOnGithub', (_, id: number) => createIssueViaClaude(id))

// ── IPC: Git (worktrees & branches) ─────────────────────────────────────────
ipcMain.handle('git:scan', (_, opts?: { prs?: boolean; refreshPrs?: boolean }) => scanGit(opts ?? {}))
ipcMain.handle('git:summary', () => cachedScan(10 * 60 * 1000))
ipcMain.handle('git:details', (_, repoPath: string, branch: string | null, worktreePath: string | null) =>
  branchDetails(repoPath, branch, worktreePath))
ipcMain.handle('git:prune', (_, repoPath: string) => pruneWorktrees(repoPath))
ipcMain.handle('git:fetch', (_, repoPath: string) => fetchRepo(repoPath))
ipcMain.handle('git:deleteBranch', (_, repoPath: string, branch: string) => deleteMergedBranch(repoPath, branch))
ipcMain.handle('git:createPr', (_, repoPath: string, branch: string) => createPullRequest(repoPath, branch))
ipcMain.handle('git:openPath', (_, target: string, app: 'vscode' | 'finder' | 'terminal') => openPath(target, app))

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

ipcMain.handle('google:beginConnect', () => beginGoogleConnect(getConfig().publicUrl))
ipcMain.handle('google:awaitConnect', () => awaitGoogleConnect())
ipcMain.handle('google:status', () => googleConnected())
ipcMain.handle('google:accounts', () => listGoogleAccounts())
ipcMain.handle('google:disconnect', () => disconnectGoogle())
ipcMain.handle('google:disconnectAccount', (_, email: string) => disconnectGoogleAccount(email))
ipcMain.handle('google:sync', () => runGoogleSync())

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

// Monitoramento de passagens: canais `flightMon:*` (server/flights/rpc.ts).
registerFlightRpc((channel, fn) => ipcMain.handle(channel, fn))

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
ipcMain.handle('links:markOpened', (_, id: number) => setLinkOpened(id))
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
ipcMain.handle('study:reviewFlashcard', (_, id: number, easeFactor: number, intervalDays: number, repetitions: number, nextReviewAt: string, lastReviewedAt: string, rating?: string | null) =>
  reviewStudyFlashcard(id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt, rating))
ipcMain.handle('study:reviewCountsByDay', (_, startISO: string, endISO: string) => getStudyReviewCountsByDay(startISO, endISO))
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

// Exports return the file content; the client turns it into a download (or, on
// the folder export, writes it with the File System Access API when available).
// Imports receive the parsed content from a file the client picked.
export interface ExportFile {
  name: string
  mime: string
  content: string
}

ipcMain.handle('study:exportMarkdown', async (_, topicId: number): Promise<ExportFile | null> => {
  const bundle = await getStudyBundle(topicId)
  if (!bundle) return null
  return { name: `${studySlug(bundle.topic.name)}.md`, mime: 'text/markdown', content: studyToMarkdown(bundle) }
})

ipcMain.handle('study:exportJson', async (_, topicId: number): Promise<ExportFile | null> => {
  const bundle = await getStudyBundle(topicId)
  if (!bundle) return null
  return { name: `${studySlug(bundle.topic.name)}.study.json`, mime: 'application/json', content: JSON.stringify(bundle, null, 2) }
})

ipcMain.handle('study:importBundle', async (_, bundle: StudyBundle) => {
  if (!bundle || !bundle.topic) return { ok: false, error: 'Arquivo inválido (sem tópico).' }
  try {
    const topicId = await importStudyBundle(bundle)
    return { ok: true, topicId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

/** Folder export (Obsidian): roadmap.json + one .md per node, inside `<slug>/`. */
ipcMain.handle('study:exportFolderFiles', async (_, topicId: number): Promise<{ folder: string; files: ExportFile[] } | null> => {
  const bundle = await getStudyBundle(topicId)
  if (!bundle) return null
  const files: ExportFile[] = [{ name: 'roadmap.json', mime: 'application/json', content: JSON.stringify(bundle, null, 2) }]
  const noteByNode = new Map<number | null, string>()
  for (const n of bundle.notes) noteByNode.set(n.nodeId, n.content)
  for (const node of bundle.nodes) {
    const note = noteByNode.get(node.id) ?? ''
    const body = `# ${node.title}\n\n${node.description ? node.description + '\n\n' : ''}${note}`
    files.push({ name: `${String(node.orderIndex).padStart(3, '0')}-${studySlug(node.title)}.md`, mime: 'text/markdown', content: body })
  }
  return { folder: studySlug(bundle.topic.name), files }
})

ipcMain.handle('skills:exportFile', async (_, id: string): Promise<ExportFile | null> => {
  const skill = (await getSkills()).find((s) => s.id === id)
  if (!skill) return null
  return { name: `${skill.name}.skill.json`, mime: 'application/json', content: JSON.stringify(skill, null, 2) }
})
ipcMain.handle('skills:importData', async (_, obj: Partial<DbSkill> & { name?: string }) => {
  if (!obj || !obj.name) return null
  return importSkill(obj as Partial<DbSkill> & { name: string })
})

ipcMain.handle('agents:exportFile', async (_, id: string): Promise<ExportFile | null> => {
  const agent = (await getAgents()).find((a) => a.id === id)
  if (!agent) return null
  return { name: `${agent.name}.agent.json`, mime: 'application/json', content: JSON.stringify(agent, null, 2) }
})
ipcMain.handle('agents:importData', async (_, obj: Partial<DbAgent> & { name?: string }) => {
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

/** The project's local path (cwd for the CLI), if configured. */
async function resolveProjectCwd(projectId?: number | null): Promise<string | undefined> {
  if (projectId == null) return undefined
  const p = (await getProjects()).find((x) => x.id === projectId)
  return p?.localPath && p.localPath.trim() ? p.localPath.trim() : undefined
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
  const hasLocal = !!(p.localPath && p.localPath.trim() && fs.existsSync(p.localPath.trim()))
  const lines = ['### CONTEXTO DO PROJETO', `Projeto: ${p.name}`]
  if (p.description) lines.push(`Descrição: ${p.description}`)
  if (p.githubRepoUrl) lines.push(`Repositório GitHub: ${p.githubRepoUrl}`)
  if (hasLocal) {
    lines.push(
      `Diretório de trabalho: ${p.localPath!.trim()} (você já está rodando DENTRO desta pasta do projeto).`,
      'Use o repositório desta pasta normalmente (git/gh sem --repo, pois o remote já é o do projeto).'
    )
  } else if (slug) {
    lines.push(
      `Repositório de destino para git/gh: ${slug}`,
      `IMPORTANTE: sempre use --repo ${slug} nos comandos gh (ex.: gh issue create --repo ${slug} ...).`,
      'NÃO use o remote da pasta atual — o diretório de trabalho é o app RickOS, não este projeto.'
    )
  }
  return lines.join('\n') + '\n\n'
}

ipcMain.handle('ai:run', async (_, prompt: string, projectId?: number, model?: string, source?: string) => {
  return runClaude(prompt, await resolveClaudeCommand(projectId), {
    model: await resolveModel(model),
    usage: { source: source || 'outro', projectId: projectId ?? null }
  })
})

// Uso de tokens do Claude CLI no intervalo [from, to) (ISO).
ipcMain.handle('ai:usage', (_, from: string, to: string) => getAiUsage(from, to))

// ── Background AI runs (owned by main; survive renderer navigation) ────────────
interface AiRun {
  id: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  output: string
  error: string | null
  kill?: () => void
}
const aiRuns = new Map<string, AiRun>()


interface AiStartParams {
  prompt: string
  projectId?: number | null
  model?: string
  agentId?: string | null
  skillIds?: string
  userPrompt?: string
  save?: boolean // persist an execution in the AI history (default true)
  permission?: 'allowlist' | 'execute' // 'execute' = agentic (roda ferramentas)
  source?: string // módulo de origem, para a contabilidade de tokens
}

// Start a run in the background: returns runId immediately. Output accumulates in main,
// streams via 'ai:chunk', completes via 'ai:done', and the execution is persisted here —
// so it keeps running (and is saved) even if the user leaves the Prompt Runner.
ipcMain.handle('ai:start', async (_, params: AiStartParams) => {
  const runId = randomUUID()
  const run: AiRun = { id: runId, status: 'running', output: '', error: null }
  aiRuns.set(runId, run)
  const startedAt = Date.now()
  // Execuções longas (≥ 1 min) avisam ao terminar: o usuário provavelmente saiu da tela.
  const notifyIfLong = (title: string, body: string): void => {
    if (Date.now() - startedAt < 60 * 1000) return
    void notify({ title, body, source: 'ia', page: params.save !== false ? 'ai-history' : null })
  }
  const promptPreview = (params.userPrompt || params.prompt).replace(/\s+/g, ' ').trim().slice(0, 120)
  const command = await resolveClaudeCommand(params.projectId ?? undefined)
  const model = await resolveModel(params.model)
  const context = await buildProjectContext(params.projectId)
  const cwd = await resolveProjectCwd(params.projectId)
  const agentic = params.permission === 'execute'
  const extraArgs = agentic ? [] : await resolveAllowedToolsArgs()

  runClaude(context + params.prompt, command, {
    model,
    extraArgs, // libera gh/git/arquivos para o Claude executar (ex.: criar issue)
    cwd, // roda dentro do diretório do projeto, quando configurado
    timeoutMs: 0, // sem timeout: tarefas podem demorar
    streamJson: !agentic, // texto/pensamento ao vivo (modo seguro)
    agentic, // 'executar': roda ferramentas de verdade (bidirecional)
    usage: { source: params.source || 'outro', projectId: params.projectId ?? null },
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
      notifyIfLong('✅ Execução de IA concluída', promptPreview)
    })
    .catch((e) => {
      const cancelled = run.status === 'cancelled'
      run.status = cancelled ? 'cancelled' : 'error'
      run.error = cancelled ? 'Execução cancelada.' : e instanceof Error ? e.message : String(e)
      broadcast('ai:done', { runId, ok: false, output: run.output, error: run.error })
      if (!cancelled) notifyIfLong('⚠️ Execução de IA falhou', run.error ?? promptPreview)
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
ipcMain.handle('ai:runStream', async (_, prompt: string, projectId?: number, model?: string, runId?: string, source?: string) => {
  const command = await resolveClaudeCommand(projectId)
  const context = await buildProjectContext(projectId)
  const extraArgs = await resolveAllowedToolsArgs()
  const cwd = await resolveProjectCwd(projectId)
  return runClaude(context + prompt, command, {
    model: await resolveModel(model),
    extraArgs,
    cwd,
    streamJson: true, // stream-json carries the token usage at the end
    usage: { source: source || 'assistente', projectId: projectId ?? null },
    onChunk: (text) => {
      broadcast('ai:chunk', { runId, text })
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

// Download of the DB file itself is served by GET /api/export/db (see server/index.ts).
ipcMain.handle('app:exportDbToDrive', async (_, email?: string) => {
  try {
    await getDb()
    saveDb()
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
    const fileName = `timetracker_snapshot_${stamp}.sqlite`
    const r = await uploadFileToDrive(dbFilePath(), fileName, email)
    return { ok: true, target: 'drive', message: `Enviado ao Google Drive (${r.account}): ${r.name}`, link: r.link }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

/** Replace the whole DB with an uploaded SQLite file (base64). Clients reload after. */
ipcMain.handle('app:importDbData', async (_, base64: string) => {
  const bytes = Buffer.from(base64.includes(',') ? base64.split(',')[1] : base64, 'base64')
  // SQLite files start with "SQLite format 3\0"
  if (bytes.subarray(0, 15).toString('latin1') !== 'SQLite format 3') {
    return { ok: false, error: 'O arquivo não é um banco SQLite.' }
  }
  replaceDbFile(bytes)
  await getDb()
  broadcast('db:replaced', {})
  return { ok: true }
})

ipcMain.handle('app:snapshots', () => listSnapshots())
ipcMain.handle('app:restoreSnapshot', async (_, snapPath: string) => {
  const ok = restoreSnapshot(snapPath)
  if (ok) {
    await getDb()
    broadcast('db:replaced', {})
  }
  return ok
})
