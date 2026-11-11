import { invoke, subscribe, downloadUrl } from './transport'
import { ExportFile, downloadText, pickFile, pickFolderFiles, pickJson, fileToBase64, saveFolder } from './files'
import type { NextActionSize, ProjectPatch, ProjectStatus, ProjectStatusPayload } from '../types'

/** Open a URL outside the app: system browser on desktop, new tab on web. */
export function openExternal(url: string): void {
  if (window.desktop) window.desktop.openExternal(url)
  else window.open(url, '_blank', 'noopener')
}

async function exportFile(channel: string, id: string | number): Promise<boolean> {
  const f = await invoke<ExportFile | null>(channel, id)
  if (!f) return false
  downloadText(f)
  return true
}

/** Google OAuth: the server prepares the URL, we open it, then wait for the callback. */
async function connectGoogle(): Promise<boolean> {
  const { authUrl } = await invoke<{ authUrl: string }>('google:beginConnect')
  openExternal(authUrl)
  return invoke<boolean>('google:awaitConnect')
}

type ExportResult = { ok: boolean; target?: 'local' | 'drive'; message?: string; error?: string; link?: string | null }

/** Backup no dispositivo: diálogo "Salvar como" (escolhe pasta/nome) quando o navegador suporta, senão download comum. */
async function exportDbToDevice(): Promise<ExportResult> {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const name = `timetracker_snapshot_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.sqlite`
  const picker = (window as unknown as { showSaveFilePicker?: (o?: unknown) => Promise<SaveHandle> }).showSaveFilePicker
  if (picker) {
    // O diálogo precisa abrir ainda dentro do clique (gesto do usuário): só depois busca o arquivo.
    let handle: SaveHandle
    try {
      handle = await picker({
        suggestedName: name,
        types: [{ description: 'Banco SQLite', accept: { 'application/x-sqlite3': ['.sqlite'] } }]
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { ok: false } // cancelado
      throw e
    }
    try {
      const res = await fetch(downloadUrl('/api/export/db'))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const w = await handle.createWritable()
      await w.write(await res.blob())
      await w.close()
      return { ok: true, target: 'local', message: `Backup salvo em ${handle.name}.` }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  const a = document.createElement('a')
  a.href = downloadUrl('/api/export/db')
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  return { ok: true, target: 'local', message: 'Download do backup iniciado.' }
}

interface SaveHandle {
  name: string
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>
}

/**
 * Builds `window.api` — same shape the Electron preload used to expose, so stores
 * and pages are unchanged. Every call goes to the server via HTTP RPC.
 */
export function createApi() {
  const api = {
    // Tags
    tags: {
      getAll: () => invoke('tags:getAll'),
      create: (name: string, color: string, isProductive: number) =>
        invoke('tags:create', name, color, isProductive),
      update: (id: number, name: string, color: string, isProductive: number) =>
        invoke('tags:update', id, name, color, isProductive),
      delete: (id: number) => invoke('tags:delete', id)
    },
    // Tasks
    tasks: {
      getAll: () => invoke('tasks:getAll'),
      getForRange: (startDate: string, endDate: string) =>
        invoke('tasks:getForRange', startDate, endDate),
      getActive: () => invoke('tasks:getActive'),
      start: (title: string, tagId: number | null, secondaryTagId: number | null, startTime?: string, studyNodeId?: number | null, projectId?: number | null) =>
        invoke('tasks:start', title, tagId, secondaryTagId, startTime || new Date().toISOString(), studyNodeId ?? null, projectId ?? null),
      setProject: (taskId: number, projectId: number | null) => invoke('tasks:setProject', taskId, projectId),
      stop: (id: number, endTime?: string) =>
        invoke('tasks:stop', id, endTime),
      update: (
        id: number,
        title: string,
        tagId: number | null,
        secondaryTagId: number | null,
        startTime: string,
        endTime: string | null
      ) => invoke('tasks:update', id, title, tagId, secondaryTagId, startTime, endTime),
      delete: (id: number) => invoke('tasks:delete', id),
      add: (title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null, studyNodeId?: number | null) =>
        invoke('tasks:add', title, tagId, secondaryTagId, startTime, endTime, studyNodeId ?? null),
      stopAll: (endTime: string) => invoke('tasks:stopAll', endTime),
      studyHours: () => invoke('tasks:studyHours')
    },
    stats: {
      daily: (startDate: string, endDate: string) =>
        invoke('stats:daily', startDate, endDate),
      byTag: (startDate: string, endDate: string) =>
        invoke('stats:byTag', startDate, endDate)
    },
    dayConfig: {
      update: (date: string, isWorkDay: number) =>
        invoke('dayConfig:update', date, isWorkDay)
    },
    // Todos (Inbox + TODO)
    inbox: {
      ocr: (base64: string, ext: string) => invoke('inbox:ocr', base64, ext)
    },
    stays: {
      favorites: () => invoke('stays:favorites'),
      addFavorite: (f: unknown) => invoke('stays:addFavorite', f),
      removeFavorite: (id: string) => invoke('stays:removeFavorite', id),
      watches: () => invoke('stays:watches'),
      addWatch: (w: unknown) => invoke('stays:addWatch', w),
      updateWatchPrice: (id: string, current: number, best: number, at: string) => invoke('stays:updateWatchPrice', id, current, best, at),
      removeWatch: (id: string) => invoke('stays:removeWatch', id),
      priceHistory: (watchId: string) => invoke('stays:priceHistory', watchId),
      addPricePoint: (p: unknown) => invoke('stays:addPricePoint', p),
      searchHistory: () => invoke('stays:searchHistory'),
      addSearchHistory: (filters: string) => invoke('stays:addSearchHistory', filters)
    },
    contacts: {
      getAll: () => invoke('contacts:getAll'),
      create: (name: string, location: string | null, country: string | null, state: string | null, birthday: string | null, interests: string | null, context: string | null, nextFollowUp: string | null) =>
        invoke('contacts:create', name, location, country, state, birthday, interests, context, nextFollowUp),
      update: (id: number, name: string, location: string | null, country: string | null, state: string | null, birthday: string | null, interests: string | null, context: string | null, lastContactAt: string | null, nextFollowUp: string | null) =>
        invoke('contacts:update', id, name, location, country, state, birthday, interests, context, lastContactAt, nextFollowUp),
      log: (id: number) => invoke('contacts:log', id),
      delete: (id: number) => invoke('contacts:delete', id)
    },
    notifications: {
      list: (limit?: number) => invoke('notifications:list', limit),
      unreadCount: () => invoke('notifications:unreadCount'),
      create: (n: { title: string; body?: string; source?: string; page?: string | null }) => invoke('notifications:create', n),
      markRead: (id: number, read?: boolean) => invoke('notifications:markRead', id, read),
      markAllRead: () => invoke('notifications:markAllRead'),
      delete: (id: number) => invoke('notifications:delete', id),
      clear: (onlyRead?: boolean) => invoke('notifications:clear', onlyRead)
    },
    rules: {
      getAll: () => invoke('rules:getAll'),
      create: (type: string, params: string) => invoke('rules:create', type, params),
      update: (id: number, enabled: number, params: string) => invoke('rules:update', id, enabled, params),
      delete: (id: number) => invoke('rules:delete', id)
    },
    jobs: {
      getAll: () => invoke('jobs:getAll'),
      create: (name: string, prompt: string, hour: number) => invoke('jobs:create', name, prompt, hour),
      update: (id: number, name: string, prompt: string, hour: number, enabled: number) => invoke('jobs:update', id, name, prompt, hour, enabled),
      delete: (id: number) => invoke('jobs:delete', id)
    },
    goals: {
      getForMonth: (month: string) => invoke('goals:getForMonth', month),
      create: (month: string, title: string, kind: string, refId: number | null, target: number, unit: string | null) =>
        invoke('goals:create', month, title, kind, refId, target, unit),
      update: (id: number, title: string, target: number, current: number, unit: string | null, done: number) =>
        invoke('goals:update', id, title, target, current, unit, done),
      delete: (id: number) => invoke('goals:delete', id)
    },
    todos: {
      getAll: (status?: string) => invoke('todos:getAll', status),
      create: (
        title: string,
        notes: string | null,
        status: string,
        source: string,
        priority = 0,
        dueDate: string | null = null,
        projectId: number | null = null,
        aiGenerated = 0,
        recurrence: string | null = null,
        type = 'projeto'
      ) => invoke('todos:create', title, notes, status, source, priority, dueDate, projectId, aiGenerated, recurrence, type),
      update: (
        id: number,
        title: string,
        notes: string | null,
        status: string,
        priority: number,
        dueDate: string | null,
        projectId: number | null,
        recurrence?: string | null,
        type?: string
      ) => invoke('todos:update', id, title, notes, status, priority, dueDate, projectId, recurrence, type),
      delete: (id: number) => invoke('todos:delete', id)
    },
    // Projects
    projects: {
      getAll: () => invoke('projects:getAll'),
      suggestions: () => invoke('projects:suggestions'),
      ignoreSuggestion: (path: string) => invoke('projects:ignoreSuggestion', path),
      restoreSuggestions: () => invoke('projects:restoreSuggestions'),
      create: (name: string, description: string | null, githubRepoUrl: string | null, color: string, claudeCommand: string | null, localPath?: string | null, stage?: string, businessModel?: string | null, pricing?: string | null, audience?: string | null) =>
        invoke('projects:create', name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience),
      update: (
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
      ) => invoke('projects:update', id, name, description, githubRepoUrl, color, archived, claudeCommand, localPath, stage, businessModel, pricing, audience),
      setStage: (id: number, stage: string) => invoke('projects:setStage', id, stage),
      delete: (id: number) => invoke('projects:delete', id),
      get: (id: number) => invoke('projects:get', id),
      patch: (id: number, fields: ProjectPatch) => invoke('projects:patch', id, fields),
      setStatus: (id: number, status: ProjectStatus, payload?: ProjectStatusPayload) => invoke('projects:setStatus', id, status, payload ?? {}),
      completeNextAction: (id: number, next: string | null, size?: NextActionSize | null) => invoke('projects:completeNextAction', id, next, size ?? null),
      setSchedule: (projectId: number, days: number[], start: string | null, minutes: number | null, syncCalendar: boolean) =>
        invoke('projects:setSchedule', projectId, days, start, minutes, syncCalendar),
      hookStatus: () => invoke('projects:hookStatus'),
      hookInstall: () => invoke('projects:hookInstall'),
      hookUninstall: () => invoke('projects:hookUninstall'),
      hookConfig: (enabled: boolean, model: string | null) => invoke('projects:hookConfig', enabled, model),
      overview: () => invoke('projects:overview'),
      events: (projectId?: number | null, limit?: number) => invoke('projects:events', projectId ?? null, limit),
      addEvent: (projectId: number, kind: string, text: string | null) => invoke('projects:addEvent', projectId, kind, text),
      commits: (projectId: number, limit?: number) => invoke('projects:commits', projectId, limit),
      tasks: (projectId: number, limit?: number) => invoke('projects:tasks', projectId, limit),
      hours: (from: string, to: string) => invoke('projects:hours', from, to),
      unlinkedTags: () => invoke('projects:unlinkedTags'),
      linkTodos: (todoIds: number[], projectId: number | null, milestoneId?: number | null) => invoke('projects:linkTodos', todoIds, projectId, milestoneId ?? null),
      setTodoMilestone: (todoId: number, milestoneId: number | null) => invoke('projects:setTodoMilestone', todoId, milestoneId),
      linkTag: (tagId: number, projectId: number | null) => invoke('projects:linkTag', tagId, projectId),
      roadmap: (projectId: number) => invoke('projects:roadmap', projectId),
      roadmapSet: (projectId: number, line: number, expected: string, mark: ' ' | 'x' | '~' | '-') => invoke('projects:roadmapSet', projectId, line, expected, mark),
      roadmapCreate: (projectId: number) => invoke('projects:roadmapCreate', projectId),
      radarCheck: () => invoke('projects:radarCheck'),
      onChanged: (cb: () => void) => subscribe('projects:updated', () => cb())
    },
    milestones: {
      getAll: () => invoke('milestones:getAll'),
      create: (projectId: number, title: string, targetDate: string | null) => invoke('milestones:create', projectId, title, targetDate),
      toggle: (id: number, done: number) => invoke('milestones:toggle', id, done),
      delete: (id: number) => invoke('milestones:delete', id),
      update: (id: number, title: string, targetDate: string | null, cycleId: number | null, description: string | null) =>
        invoke('milestones:update', id, title, targetDate, cycleId, description)
    },
    cycles: {
      getAll: (projectId?: number | null) => invoke('cycles:getAll', projectId ?? null),
      create: (projectId: number, name: string, goal: string | null, startDate: string, dueDate: string | null) => invoke('cycles:create', projectId, name, goal, startDate, dueDate),
      update: (id: number, name: string, goal: string | null, dueDate: string | null) => invoke('cycles:update', id, name, goal, dueDate),
      extend: (id: number, newDueDate: string, reason: string | null) => invoke('cycles:extend', id, newDueDate, reason),
      close: (id: number, status: 'concluido' | 'cancelado', retrospective: string | null) => invoke('cycles:close', id, status, retrospective),
      delete: (id: number) => invoke('cycles:delete', id),
      changelog: (id: number, useAi: boolean) => invoke('cycles:changelog', id, useAi),
      commits: (id: number) => invoke('cycles:commits', id)
    },
    delegations: {
      getAll: (projectId?: number | null) => invoke('delegations:getAll', projectId ?? null),
      start: (projectId: number, action: string | null, instructions: string | null) => invoke('delegations:start', projectId, action, instructions),
      cancel: (id: number) => invoke('delegations:cancel', id),
      review: (id: number) => invoke('delegations:review', id),
      discard: (id: number) => invoke('delegations:discard', id),
      accept: (id: number) => invoke('delegations:accept', id),
      pr: (id: number) => invoke('delegations:pr', id)
    },
    projectNotes: {
      getAll: (projectId: number) => invoke('projectNotes:getAll', projectId),
      save: (note: { id?: number | null; projectId: number; kind: string; title: string; body: string | null; url: string | null; pinned?: number }) => invoke('projectNotes:save', note),
      delete: (id: number) => invoke('projectNotes:delete', id)
    },
    // Habits
    habits: {
      getAll: () => invoke('habits:getAll'),
      create: (name: string, frequency: string, target: number) =>
        invoke('habits:create', name, frequency, target),
      update: (id: number, name: string, frequency: string, target: number, active: number) =>
        invoke('habits:update', id, name, frequency, target, active),
      delete: (id: number) => invoke('habits:delete', id),
      getEntries: (date: string) => invoke('habits:getEntries', date),
      getEntriesRange: (startDate: string, endDate: string) =>
        invoke('habits:getEntriesRange', startDate, endDate),
      toggleEntry: (habitId: number, date: string, completed: number) =>
        invoke('habits:toggleEntry', habitId, date, completed),
      completionsForDate: (date: string) => invoke('habits:completionsForDate', date)
    },
    // Settings (key-value)
    settings: {
      get: (key: string) => invoke('settings:get', key),
      set: (key: string, value: string) => invoke('settings:set', key, value),
      getAll: () => invoke('settings:getAll')
    },
    // GitHub
    github: {
      getIssues: () => invoke('github:getIssues'),
      sync: () => invoke('github:sync'),
      createLocal: (repo: string, title: string, body: string | null) =>
        invoke('github:createLocal', repo, title, body),
      deleteIssue: (id: number) => invoke('github:deleteIssue', id),
      createOnGithub: (id: number) => invoke('github:createOnGithub', id)
    },
    // Git: worktrees & branches of local repos (runs on the server machine)
    git: {
      scan: (opts?: { prs?: boolean; refreshPrs?: boolean }) => invoke('git:scan', opts),
      summary: () => invoke('git:summary'),
      details: (repoPath: string, branch: string | null, worktreePath: string | null) =>
        invoke('git:details', repoPath, branch, worktreePath),
      prune: (repoPath: string) => invoke('git:prune', repoPath),
      fetch: (repoPath: string) => invoke('git:fetch', repoPath),
      deleteBranch: (repoPath: string, branch: string) => invoke('git:deleteBranch', repoPath, branch),
      createPr: (repoPath: string, branch: string) => invoke('git:createPr', repoPath, branch),
      openPath: (target: string, app: 'vscode' | 'finder' | 'terminal') => invoke('git:openPath', target, app)
    },
    // Calendar
    calendar: {
      upcoming: (fromISO: string, limit: number) => invoke('calendar:upcoming', fromISO, limit),
      range: (startISO: string, endISO: string) => invoke('calendar:range', startISO, endISO),
      create: (title: string, startTime: string, endTime: string | null, location: string | null) =>
        invoke('calendar:create', title, startTime, endTime, location),
      delete: (id: number) => invoke('calendar:delete', id)
    },
    // Google Calendar (OAuth)
    google: {
      connect: () => connectGoogle(),
      status: () => invoke('google:status'),
      accounts: () => invoke('google:accounts'),
      disconnect: () => invoke('google:disconnect'),
      disconnectAccount: (email: string) => invoke('google:disconnectAccount', email),
      sync: () => invoke('google:sync')
    },
    // Finance
    accounts: {
      getAll: () => invoke('accounts:getAll'),
      create: (name: string, currency: string, balance: number) => invoke('accounts:create', name, currency, balance),
      update: (id: number, name: string, currency: string, balance: number) => invoke('accounts:update', id, name, currency, balance),
      delete: (id: number) => invoke('accounts:delete', id)
    },
    categories: {
      getAll: () => invoke('categories:getAll'),
      create: (name: string, type: string, color: string) => invoke('categories:create', name, type, color),
      delete: (id: number) => invoke('categories:delete', id)
    },
    transactions: {
      getAll: (month?: string) => invoke('transactions:getAll', month),
      create: (accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) =>
        invoke('transactions:create', accountId, categoryId, amount, currency, type, description, date),
      update: (id: number, accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) =>
        invoke('transactions:update', id, accountId, categoryId, amount, currency, type, description, date),
      delete: (id: number) => invoke('transactions:delete', id),
      bulk: (rows: unknown[]) => invoke('transactions:bulk', rows)
    },
    budgets: {
      getForMonth: (month: string) => invoke('budgets:getForMonth', month),
      set: (categoryId: number, month: string, amount: number) => invoke('budgets:set', categoryId, month, amount)
    },
    investments: {
      getAll: () => invoke('investments:getAll'),
      history: () => invoke('investments:history'),
      create: (name: string, type: string | null, amount: number, currency: string) => invoke('investments:create', name, type, amount, currency),
      setValue: (investmentId: number, month: string, amount: number) => invoke('investments:setValue', investmentId, month, amount),
      delete: (id: number) => invoke('investments:delete', id)
    },
    pluggy: {
      sync: () => invoke('pluggy:sync'),
      status: () => invoke('pluggy:status'),
      connectToken: () => invoke('pluggy:connectToken')
    },
    trips: {
      getAll: () => invoke('trips:getAll'),
      create: (origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) =>
        invoke('trips:create', origin, destination, startDate, endDate, budget, currency, status),
      update: (id: number, origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) =>
        invoke('trips:update', id, origin, destination, startDate, endDate, budget, currency, status),
      delete: (id: number) => invoke('trips:delete', id)
    },
    // Monitoramento de passagens (server/flights/rpc.ts)
    flightMon: {
      list: () => invoke('flightMon:list'),
      get: (id: number) => invoke('flightMon:get', id),
      validate: (config: unknown) => invoke('flightMon:validate', config),
      create: (input: unknown) => invoke('flightMon:create', input),
      update: (id: number, input: unknown) => invoke('flightMon:update', id, input),
      setStatus: (id: number, status: string) => invoke('flightMon:setStatus', id, status),
      duplicate: (id: number) => invoke('flightMon:duplicate', id),
      delete: (id: number) => invoke('flightMon:delete', id),
      run: (id: number, opts?: { more?: number }) => invoke('flightMon:run', id, opts),
      cancel: (runId: number) => invoke('flightMon:cancel', runId),
      retryFailed: (id: number) => invoke('flightMon:retryFailed', id),
      offers: (id: number, q: unknown) => invoke('flightMon:offers', id, q),
      favorite: (offerId: number, fav: boolean) => invoke('flightMon:favorite', offerId, fav),
      calendar: (id: number) => invoke('flightMon:calendar', id),
      history: (id: number, days?: number) => invoke('flightMon:history', id, days),
      plan: (id: number) => invoke('flightMon:plan', id),
      alerts: (id: number) => invoke('flightMon:alerts', id),
      checkAlerts: (id: number) => invoke('flightMon:checkAlerts', id),
      places: (q: string) => invoke('flightMon:places', q),
      airport: (iata: string) => invoke('flightMon:airport', iata),
      nearby: (ref: unknown, radiusKm: number, withGround: boolean) => invoke('flightMon:nearby', ref, radiusKm, withGround),
      ground: (iata: string, to: unknown) => invoke('flightMon:ground', iata, to),
      aiDraft: (text: string, currency?: string) => invoke('flightMon:aiDraft', text, currency),
      insights: (id: number) => invoke('flightMon:insights', id),
      skyscanner: (id: number, picks: unknown[]) => invoke('flightMon:skyscanner', id, picks),
      skyscannerPreview: (id: number) => invoke('flightMon:skyscannerPreview', id),
      tracked: (id: number, days?: number) => invoke('flightMon:tracked', id, days),
      track: (id: number, picks: unknown[]) => invoke('flightMon:track', id, picks),
      untrack: (id: number, pick: unknown) => invoke('flightMon:untrack', id, pick),
      promos: (id: number, force?: boolean) => invoke('flightMon:promos', id, force),
      importPreview: (id: number, text: string, mode: 'structured' | 'ai', source?: string, observedAt?: string, assisted?: boolean) =>
        invoke('flightMon:importPreview', id, text, mode, source, observedAt, assisted),
      importCommit: (id: number, text: string, mode: 'structured' | 'ai', source?: string, observedAt?: string, assisted?: boolean) =>
        invoke('flightMon:importCommit', id, text, mode, source, observedAt, assisted),
      providers: () => invoke('flightMon:providers'),
      testProvider: (id: string) => invoke('flightMon:testProvider', id),
      onChanged: (cb: (p: { monitorId: number | null; runId: number | null }) => void) =>
        subscribe('flights:updated', (p) => cb(p as { monitorId: number | null; runId: number | null }))
    },
    tripDocs: {
      get: (tripId: number) => invoke('tripDocs:get', tripId),
      set: (tripId: number, item: string, checked: number) => invoke('tripDocs:set', tripId, item, checked)
    },
    // IA library
    skills: {
      getAll: () => invoke('skills:getAll'),
      create: (name: string, description: string | null, category: string | null, tags: string, content: string) =>
        invoke('skills:create', name, description, category, tags, content),
      update: (id: string, name: string, description: string | null, category: string | null, tags: string, content: string) =>
        invoke('skills:update', id, name, description, category, tags, content),
      delete: (id: string) => invoke('skills:delete', id),
      toggleFavorite: (id: string) => invoke('skills:toggleFavorite', id),
      export: (id: string) => exportFile('skills:exportFile', id),
      import: async () => {
        const obj = await pickJson<unknown>()
        return obj ? invoke('skills:importData', obj) : null
      }
    },
    agents: {
      getAll: () => invoke('agents:getAll'),
      create: (name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) =>
        invoke('agents:create', name, description, role, systemPrompt, defaultSkillIds, tags),
      update: (id: string, name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) =>
        invoke('agents:update', id, name, description, role, systemPrompt, defaultSkillIds, tags),
      delete: (id: string) => invoke('agents:delete', id),
      toggleFavorite: (id: string) => invoke('agents:toggleFavorite', id),
      export: (id: string) => exportFile('agents:exportFile', id),
      import: async () => {
        const obj = await pickJson<unknown>()
        return obj ? invoke('agents:importData', obj) : null
      }
    },
    executions: {
      getAll: () => invoke('executions:getAll'),
      create: (agentId: string | null, skillIds: string, userPrompt: string, finalPrompt: string, response: string | null) =>
        invoke('executions:create', agentId, skillIds, userPrompt, finalPrompt, response),
      delete: (id: string) => invoke('executions:delete', id)
    },
    links: {
      getAll: () => invoke('links:getAll'),
      create: (title: string, url: string, tags?: string) => invoke('links:create', title, url, tags),
      update: (id: number, title: string, url: string, tags?: string) => invoke('links:update', id, title, url, tags),
      setChecked: (id: number, checked: number) => invoke('links:setChecked', id, checked),
      markOpened: (id: number) => invoke('links:markOpened', id),
      delete: (id: number) => invoke('links:delete', id)
    },
    study: {
      topics: () => invoke('study:topics'),
      createTopic: (name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) =>
        invoke('study:createTopic', name, category, status, targetDate, priority, color),
      updateTopic: (id: number, name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) =>
        invoke('study:updateTopic', id, name, category, status, targetDate, priority, color),
      deleteTopic: (id: number) => invoke('study:deleteTopic', id),
      nodes: (topicId: number) => invoke('study:nodes', topicId),
      allNodes: () => invoke('study:allNodes'),
      allNotes: () => invoke('study:allNotes'),
      createNode: (topicId: number, parentId: number | null, title: string, description: string | null, estimatedHours: number | null) =>
        invoke('study:createNode', topicId, parentId, title, description, estimatedHours),
      updateNode: (id: number, title: string, description: string | null, status: string, estimatedHours: number | null) =>
        invoke('study:updateNode', id, title, description, status, estimatedHours),
      deleteNode: (id: number) => invoke('study:deleteNode', id),
      moveNode: (id: number, dir: 'up' | 'down') => invoke('study:moveNode', id, dir),
      reorderNode: (id: number, newParentId: number | null, newIndex: number) => invoke('study:reorderNode', id, newParentId, newIndex),
      getNote: (topicId: number, nodeId: number | null) => invoke('study:getNote', topicId, nodeId),
      saveNote: (topicId: number, nodeId: number | null, content: string) => invoke('study:saveNote', topicId, nodeId, content),
      flashcards: (topicId?: number) => invoke('study:flashcards', topicId),
      due: (nowISO: string) => invoke('study:due', nowISO),
      createFlashcard: (topicId: number, nodeId: number | null, front: string, back: string) =>
        invoke('study:createFlashcard', topicId, nodeId, front, back),
      updateFlashcard: (id: number, front: string, back: string) => invoke('study:updateFlashcard', id, front, back),
      deleteFlashcard: (id: number) => invoke('study:deleteFlashcard', id),
      reviewFlashcard: (id: number, easeFactor: number, intervalDays: number, repetitions: number, nextReviewAt: string, lastReviewedAt: string, rating?: string | null) =>
        invoke('study:reviewFlashcard', id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt, rating),
      reviewCountsByDay: (startISO: string, endISO: string) => invoke('study:reviewCountsByDay', startISO, endISO),
      quizAttempts: (topicId: number) => invoke('study:quizAttempts', topicId),
      saveQuizAttempt: (topicId: number, score: number, total: number, durationMs: number | null) =>
        invoke('study:saveQuizAttempt', topicId, score, total, durationMs),
      exportMarkdown: async (topicId: number) => {
        const f = await invoke<ExportFile | null>('study:exportMarkdown', topicId)
        if (!f) return { ok: false }
        downloadText(f)
        return { ok: true, message: `Caderno baixado: ${f.name}` }
      },
      exportJson: (topicId: number) => exportFile('study:exportJson', topicId),
      importJson: async () => {
        try {
          const bundle = await pickJson<unknown>()
          if (!bundle) return { ok: false }
          return invoke('study:importBundle', bundle)
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      },
      exportFolder: async (topicId: number) => {
        const r = await invoke<{ folder: string; files: ExportFile[] } | null>('study:exportFolderFiles', topicId)
        if (!r) return { ok: false }
        const message = await saveFolder(r.folder, r.files)
        return message ? { ok: true, message } : { ok: false }
      },
      importFolder: async () => {
        const files = await pickFolderFiles()
        if (!files.length) return { ok: false }
        const roadmap = files.find((f) => f.name === 'roadmap.json')
        if (!roadmap) return { ok: false, error: 'roadmap.json não encontrado na pasta.' }
        try {
          return invoke('study:importBundle', JSON.parse(await roadmap.text()))
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      }
    },
    // AI (Claude CLI)
    ai: {
      run: (prompt: string, projectId?: number, model?: string, source?: string) => invoke('ai:run', prompt, projectId, model, source),
      runStream: (prompt: string, projectId?: number, model?: string, runId?: string, source?: string) =>
        invoke('ai:runStream', prompt, projectId, model, runId, source),
      usage: (from: string, to: string) => invoke('ai:usage', from, to),
      start: (params: {
        save?: boolean
        prompt: string
        projectId?: number | null
        model?: string
        agentId?: string | null
        skillIds?: string
        userPrompt?: string
        permission?: 'allowlist' | 'execute'
        source?: string
      }) => invoke('ai:start', params),
      getRun: (runId: string) => invoke('ai:getRun', runId),
      cancel: (runId: string) => invoke('ai:cancel', runId),
      onChunk: (cb: (runId: string | undefined, text: string) => void) =>
        subscribe('ai:chunk', (p) => {
          const payload = p as { runId?: string; text: string }
          cb(payload.runId, payload.text)
        }),
      onDone: (cb: (payload: { runId: string; ok: boolean; output: string; error: string | null }) => void) =>
        subscribe('ai:done', (p) => cb(p as { runId: string; ok: boolean; output: string; error: string | null }))
    },
    // Events (main → renderer)
    on: {
      // Desktop: global shortcut (Cmd/Ctrl+Shift+Space) from the main process.
      // Web: the same keys inside the page (see QuickCapture).
      quickCapture: (cb: () => void) => window.desktop?.onQuickCapture(cb) ?? (() => {}),
      calendarUpdated: (cb: () => void) => subscribe('calendar:updated', () => cb())
    },
    app: {
      exportDbToDevice: () => exportDbToDevice(),
      exportDbToDrive: (email: string): Promise<ExportResult> =>
        invoke<ExportResult>('app:exportDbToDrive', email).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : String(e) })),
      importDb: async () => {
        const f = await pickFile('.sqlite,.db,application/x-sqlite3')
        if (!f) return false
        const r = await invoke<{ ok: boolean; error?: string }>('app:importDbData', await fileToBase64(f))
        if (!r.ok) {
          alert('Falha ao importar: ' + (r.error || 'erro desconhecido'))
          return false
        }
        window.location.reload()
        return true
      },
      snapshots: () => invoke('app:snapshots'),
      restoreSnapshot: async (snapPath: string) => {
        const ok = await invoke<boolean>('app:restoreSnapshot', snapPath)
        if (ok) window.location.reload()
        return ok
      },
      openExternal: async (url: string) => openExternal(url)
    }
  }
  return api
}

export type RickApi = ReturnType<typeof createApi>
