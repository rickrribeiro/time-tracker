import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Tags
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    create: (name: string, color: string, isProductive: number) =>
      ipcRenderer.invoke('tags:create', name, color, isProductive),
    update: (id: number, name: string, color: string, isProductive: number) =>
      ipcRenderer.invoke('tags:update', id, name, color, isProductive),
    delete: (id: number) => ipcRenderer.invoke('tags:delete', id)
  },
  // Tasks
  tasks: {
    getAll: () => ipcRenderer.invoke('tasks:getAll'),
    getForRange: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('tasks:getForRange', startDate, endDate),
    getActive: () => ipcRenderer.invoke('tasks:getActive'),
    start: (title: string, tagId: number | null, secondaryTagId: number | null, startTime?: string, studyNodeId?: number | null) =>
      ipcRenderer.invoke('tasks:start', title, tagId, secondaryTagId, startTime || new Date().toISOString(), studyNodeId ?? null),
    stop: (id: number, endTime?: string) =>
      ipcRenderer.invoke('tasks:stop', id, endTime),
    update: (
      id: number,
      title: string,
      tagId: number | null,
      secondaryTagId: number | null,
      startTime: string,
      endTime: string | null
    ) => ipcRenderer.invoke('tasks:update', id, title, tagId, secondaryTagId, startTime, endTime),
    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),
    add: (title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null, studyNodeId?: number | null) =>
      ipcRenderer.invoke('tasks:add', title, tagId, secondaryTagId, startTime, endTime, studyNodeId ?? null),
    stopAll: (endTime: string) => ipcRenderer.invoke('tasks:stopAll', endTime),
    fillGaps: (date: string) => ipcRenderer.invoke('tasks:fillGaps', date),
    studyHours: () => ipcRenderer.invoke('tasks:studyHours')
  },
  stats: {
    daily: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('stats:daily', startDate, endDate),
    byTag: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('stats:byTag', startDate, endDate)
  },
  dayConfig: {
    update: (date: string, isWorkDay: number) =>
      ipcRenderer.invoke('dayConfig:update', date, isWorkDay)
  },
  // Todos (Inbox + TODO)
  inbox: {
    ocr: (base64: string, ext: string) => ipcRenderer.invoke('inbox:ocr', base64, ext)
  },
  contacts: {
    getAll: () => ipcRenderer.invoke('contacts:getAll'),
    create: (name: string, location: string | null, birthday: string | null, interests: string | null, context: string | null, nextFollowUp: string | null) =>
      ipcRenderer.invoke('contacts:create', name, location, birthday, interests, context, nextFollowUp),
    update: (id: number, name: string, location: string | null, birthday: string | null, interests: string | null, context: string | null, lastContactAt: string | null, nextFollowUp: string | null) =>
      ipcRenderer.invoke('contacts:update', id, name, location, birthday, interests, context, lastContactAt, nextFollowUp),
    log: (id: number) => ipcRenderer.invoke('contacts:log', id),
    delete: (id: number) => ipcRenderer.invoke('contacts:delete', id)
  },
  rules: {
    getAll: () => ipcRenderer.invoke('rules:getAll'),
    create: (type: string, params: string) => ipcRenderer.invoke('rules:create', type, params),
    update: (id: number, enabled: number, params: string) => ipcRenderer.invoke('rules:update', id, enabled, params),
    delete: (id: number) => ipcRenderer.invoke('rules:delete', id)
  },
  jobs: {
    getAll: () => ipcRenderer.invoke('jobs:getAll'),
    create: (name: string, prompt: string, hour: number) => ipcRenderer.invoke('jobs:create', name, prompt, hour),
    update: (id: number, name: string, prompt: string, hour: number, enabled: number) => ipcRenderer.invoke('jobs:update', id, name, prompt, hour, enabled),
    delete: (id: number) => ipcRenderer.invoke('jobs:delete', id)
  },
  goals: {
    getForMonth: (month: string) => ipcRenderer.invoke('goals:getForMonth', month),
    create: (month: string, title: string, kind: string, refId: number | null, target: number, unit: string | null) =>
      ipcRenderer.invoke('goals:create', month, title, kind, refId, target, unit),
    update: (id: number, title: string, target: number, current: number, unit: string | null, done: number) =>
      ipcRenderer.invoke('goals:update', id, title, target, current, unit, done),
    delete: (id: number) => ipcRenderer.invoke('goals:delete', id)
  },
  todos: {
    getAll: (status?: string) => ipcRenderer.invoke('todos:getAll', status),
    create: (
      title: string,
      notes: string | null,
      status: string,
      source: string,
      priority = 0,
      dueDate: string | null = null,
      projectId: number | null = null,
      aiGenerated = 0,
      recurrence: string | null = null
    ) => ipcRenderer.invoke('todos:create', title, notes, status, source, priority, dueDate, projectId, aiGenerated, recurrence),
    update: (
      id: number,
      title: string,
      notes: string | null,
      status: string,
      priority: number,
      dueDate: string | null,
      projectId: number | null,
      recurrence?: string | null
    ) => ipcRenderer.invoke('todos:update', id, title, notes, status, priority, dueDate, projectId, recurrence),
    delete: (id: number) => ipcRenderer.invoke('todos:delete', id)
  },
  // Projects
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    create: (name: string, description: string | null, githubRepoUrl: string | null, color: string, claudeCommand: string | null) =>
      ipcRenderer.invoke('projects:create', name, description, githubRepoUrl, color, claudeCommand),
    update: (
      id: number,
      name: string,
      description: string | null,
      githubRepoUrl: string | null,
      color: string,
      archived: number,
      claudeCommand: string | null
    ) => ipcRenderer.invoke('projects:update', id, name, description, githubRepoUrl, color, archived, claudeCommand),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id)
  },
  // Habits
  habits: {
    getAll: () => ipcRenderer.invoke('habits:getAll'),
    create: (name: string, frequency: string, target: number) =>
      ipcRenderer.invoke('habits:create', name, frequency, target),
    update: (id: number, name: string, frequency: string, target: number, active: number) =>
      ipcRenderer.invoke('habits:update', id, name, frequency, target, active),
    delete: (id: number) => ipcRenderer.invoke('habits:delete', id),
    getEntries: (date: string) => ipcRenderer.invoke('habits:getEntries', date),
    getEntriesRange: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('habits:getEntriesRange', startDate, endDate),
    toggleEntry: (habitId: number, date: string, completed: number) =>
      ipcRenderer.invoke('habits:toggleEntry', habitId, date, completed),
    completionsForDate: (date: string) => ipcRenderer.invoke('habits:completionsForDate', date)
  },
  // Settings (key-value)
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },
  // GitHub
  github: {
    getIssues: () => ipcRenderer.invoke('github:getIssues'),
    sync: () => ipcRenderer.invoke('github:sync'),
    createLocal: (repo: string, title: string, body: string | null) =>
      ipcRenderer.invoke('github:createLocal', repo, title, body),
    deleteIssue: (id: number) => ipcRenderer.invoke('github:deleteIssue', id),
    createOnGithub: (id: number) => ipcRenderer.invoke('github:createOnGithub', id)
  },
  // Calendar
  calendar: {
    upcoming: (fromISO: string, limit: number) => ipcRenderer.invoke('calendar:upcoming', fromISO, limit),
    range: (startISO: string, endISO: string) => ipcRenderer.invoke('calendar:range', startISO, endISO),
    create: (title: string, startTime: string, endTime: string | null, location: string | null) =>
      ipcRenderer.invoke('calendar:create', title, startTime, endTime, location),
    delete: (id: number) => ipcRenderer.invoke('calendar:delete', id)
  },
  // Google Calendar (OAuth)
  google: {
    connect: () => ipcRenderer.invoke('google:connect'),
    status: () => ipcRenderer.invoke('google:status'),
    accounts: () => ipcRenderer.invoke('google:accounts'),
    disconnect: () => ipcRenderer.invoke('google:disconnect'),
    disconnectAccount: (email: string) => ipcRenderer.invoke('google:disconnectAccount', email),
    sync: () => ipcRenderer.invoke('google:sync')
  },
  // Finance
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:getAll'),
    create: (name: string, currency: string, balance: number) => ipcRenderer.invoke('accounts:create', name, currency, balance),
    update: (id: number, name: string, currency: string, balance: number) => ipcRenderer.invoke('accounts:update', id, name, currency, balance),
    delete: (id: number) => ipcRenderer.invoke('accounts:delete', id)
  },
  categories: {
    getAll: () => ipcRenderer.invoke('categories:getAll'),
    create: (name: string, type: string, color: string) => ipcRenderer.invoke('categories:create', name, type, color),
    delete: (id: number) => ipcRenderer.invoke('categories:delete', id)
  },
  transactions: {
    getAll: (month?: string) => ipcRenderer.invoke('transactions:getAll', month),
    create: (accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) =>
      ipcRenderer.invoke('transactions:create', accountId, categoryId, amount, currency, type, description, date),
    update: (id: number, accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) =>
      ipcRenderer.invoke('transactions:update', id, accountId, categoryId, amount, currency, type, description, date),
    delete: (id: number) => ipcRenderer.invoke('transactions:delete', id),
    bulk: (rows: unknown[]) => ipcRenderer.invoke('transactions:bulk', rows)
  },
  budgets: {
    getForMonth: (month: string) => ipcRenderer.invoke('budgets:getForMonth', month),
    set: (categoryId: number, month: string, amount: number) => ipcRenderer.invoke('budgets:set', categoryId, month, amount)
  },
  investments: {
    getAll: () => ipcRenderer.invoke('investments:getAll'),
    history: () => ipcRenderer.invoke('investments:history'),
    create: (name: string, type: string | null, amount: number, currency: string) => ipcRenderer.invoke('investments:create', name, type, amount, currency),
    setValue: (investmentId: number, month: string, amount: number) => ipcRenderer.invoke('investments:setValue', investmentId, month, amount),
    delete: (id: number) => ipcRenderer.invoke('investments:delete', id)
  },
  pluggy: {
    sync: () => ipcRenderer.invoke('pluggy:sync'),
    status: () => ipcRenderer.invoke('pluggy:status'),
    connectToken: () => ipcRenderer.invoke('pluggy:connectToken')
  },
  trips: {
    getAll: () => ipcRenderer.invoke('trips:getAll'),
    create: (origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) =>
      ipcRenderer.invoke('trips:create', origin, destination, startDate, endDate, budget, currency, status),
    update: (id: number, origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) =>
      ipcRenderer.invoke('trips:update', id, origin, destination, startDate, endDate, budget, currency, status),
    delete: (id: number) => ipcRenderer.invoke('trips:delete', id)
  },
  flights: {
    getAll: () => ipcRenderer.invoke('flights:getAll'),
    create: (tripId: number | null, origin: string | null, destination: string | null, price: number | null, currency: string) =>
      ipcRenderer.invoke('flights:create', tripId, origin, destination, price, currency),
    delete: (id: number) => ipcRenderer.invoke('flights:delete', id),
    search: (origin: string, destination: string, currency: string, date?: string | null) =>
      ipcRenderer.invoke('flights:search', origin, destination, currency, date),
    refreshWatch: (id: number) => ipcRenderer.invoke('flights:refreshWatch', id)
  },
  tripDocs: {
    get: (tripId: number) => ipcRenderer.invoke('tripDocs:get', tripId),
    set: (tripId: number, item: string, checked: number) => ipcRenderer.invoke('tripDocs:set', tripId, item, checked)
  },
  // IA library
  skills: {
    getAll: () => ipcRenderer.invoke('skills:getAll'),
    create: (name: string, description: string | null, category: string | null, tags: string, content: string) =>
      ipcRenderer.invoke('skills:create', name, description, category, tags, content),
    update: (id: string, name: string, description: string | null, category: string | null, tags: string, content: string) =>
      ipcRenderer.invoke('skills:update', id, name, description, category, tags, content),
    delete: (id: string) => ipcRenderer.invoke('skills:delete', id),
    toggleFavorite: (id: string) => ipcRenderer.invoke('skills:toggleFavorite', id),
    export: (id: string) => ipcRenderer.invoke('skills:export', id),
    import: () => ipcRenderer.invoke('skills:import')
  },
  agents: {
    getAll: () => ipcRenderer.invoke('agents:getAll'),
    create: (name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) =>
      ipcRenderer.invoke('agents:create', name, description, role, systemPrompt, defaultSkillIds, tags),
    update: (id: string, name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) =>
      ipcRenderer.invoke('agents:update', id, name, description, role, systemPrompt, defaultSkillIds, tags),
    delete: (id: string) => ipcRenderer.invoke('agents:delete', id),
    toggleFavorite: (id: string) => ipcRenderer.invoke('agents:toggleFavorite', id),
    export: (id: string) => ipcRenderer.invoke('agents:export', id),
    import: () => ipcRenderer.invoke('agents:import')
  },
  executions: {
    getAll: () => ipcRenderer.invoke('executions:getAll'),
    create: (agentId: string | null, skillIds: string, userPrompt: string, finalPrompt: string, response: string | null) =>
      ipcRenderer.invoke('executions:create', agentId, skillIds, userPrompt, finalPrompt, response),
    delete: (id: string) => ipcRenderer.invoke('executions:delete', id)
  },
  links: {
    getAll: () => ipcRenderer.invoke('links:getAll'),
    create: (title: string, url: string, tags?: string) => ipcRenderer.invoke('links:create', title, url, tags),
    update: (id: number, title: string, url: string, tags?: string) => ipcRenderer.invoke('links:update', id, title, url, tags),
    setChecked: (id: number, checked: number) => ipcRenderer.invoke('links:setChecked', id, checked),
    delete: (id: number) => ipcRenderer.invoke('links:delete', id)
  },
  study: {
    topics: () => ipcRenderer.invoke('study:topics'),
    createTopic: (name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) =>
      ipcRenderer.invoke('study:createTopic', name, category, status, targetDate, priority, color),
    updateTopic: (id: number, name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) =>
      ipcRenderer.invoke('study:updateTopic', id, name, category, status, targetDate, priority, color),
    deleteTopic: (id: number) => ipcRenderer.invoke('study:deleteTopic', id),
    nodes: (topicId: number) => ipcRenderer.invoke('study:nodes', topicId),
    allNodes: () => ipcRenderer.invoke('study:allNodes'),
    allNotes: () => ipcRenderer.invoke('study:allNotes'),
    createNode: (topicId: number, parentId: number | null, title: string, description: string | null, estimatedHours: number | null) =>
      ipcRenderer.invoke('study:createNode', topicId, parentId, title, description, estimatedHours),
    updateNode: (id: number, title: string, description: string | null, status: string, estimatedHours: number | null) =>
      ipcRenderer.invoke('study:updateNode', id, title, description, status, estimatedHours),
    deleteNode: (id: number) => ipcRenderer.invoke('study:deleteNode', id),
    moveNode: (id: number, dir: 'up' | 'down') => ipcRenderer.invoke('study:moveNode', id, dir),
    reorderNode: (id: number, newParentId: number | null, newIndex: number) => ipcRenderer.invoke('study:reorderNode', id, newParentId, newIndex),
    getNote: (topicId: number, nodeId: number | null) => ipcRenderer.invoke('study:getNote', topicId, nodeId),
    saveNote: (topicId: number, nodeId: number | null, content: string) => ipcRenderer.invoke('study:saveNote', topicId, nodeId, content),
    flashcards: (topicId?: number) => ipcRenderer.invoke('study:flashcards', topicId),
    due: (nowISO: string) => ipcRenderer.invoke('study:due', nowISO),
    createFlashcard: (topicId: number, nodeId: number | null, front: string, back: string) =>
      ipcRenderer.invoke('study:createFlashcard', topicId, nodeId, front, back),
    updateFlashcard: (id: number, front: string, back: string) => ipcRenderer.invoke('study:updateFlashcard', id, front, back),
    deleteFlashcard: (id: number) => ipcRenderer.invoke('study:deleteFlashcard', id),
    reviewFlashcard: (id: number, easeFactor: number, intervalDays: number, repetitions: number, nextReviewAt: string, lastReviewedAt: string) =>
      ipcRenderer.invoke('study:reviewFlashcard', id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt),
    quizAttempts: (topicId: number) => ipcRenderer.invoke('study:quizAttempts', topicId),
    saveQuizAttempt: (topicId: number, score: number, total: number, durationMs: number | null) =>
      ipcRenderer.invoke('study:saveQuizAttempt', topicId, score, total, durationMs),
    exportMarkdown: (topicId: number) => ipcRenderer.invoke('study:exportMarkdown', topicId),
    exportJson: (topicId: number) => ipcRenderer.invoke('study:exportJson', topicId),
    importJson: () => ipcRenderer.invoke('study:importJson'),
    exportFolder: (topicId: number) => ipcRenderer.invoke('study:exportFolder', topicId),
    importFolder: () => ipcRenderer.invoke('study:importFolder')
  },
  // AI (Claude CLI)
  ai: {
    run: (prompt: string, projectId?: number, model?: string) => ipcRenderer.invoke('ai:run', prompt, projectId, model),
    runStream: (prompt: string, projectId?: number, model?: string, runId?: string) =>
      ipcRenderer.invoke('ai:runStream', prompt, projectId, model, runId),
    start: (params: {
      save?: boolean
      prompt: string
      projectId?: number | null
      model?: string
      agentId?: string | null
      skillIds?: string
      userPrompt?: string
    }) => ipcRenderer.invoke('ai:start', params),
    getRun: (runId: string) => ipcRenderer.invoke('ai:getRun', runId),
    cancel: (runId: string) => ipcRenderer.invoke('ai:cancel', runId),
    onChunk: (cb: (runId: string | undefined, text: string) => void) => {
      const listener = (_e: unknown, payload: { runId?: string; text: string }): void => cb(payload.runId, payload.text)
      ipcRenderer.on('ai:chunk', listener)
      return () => ipcRenderer.removeListener('ai:chunk', listener)
    },
    onDone: (cb: (payload: { runId: string; ok: boolean; output: string; error: string | null }) => void) => {
      const listener = (_e: unknown, payload: { runId: string; ok: boolean; output: string; error: string | null }): void => cb(payload)
      ipcRenderer.on('ai:done', listener)
      return () => ipcRenderer.removeListener('ai:done', listener)
    }
  },
  // Events (main → renderer)
  on: {
    quickCapture: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('quick-capture:open', listener)
      return () => ipcRenderer.removeListener('quick-capture:open', listener)
    },
    calendarUpdated: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('calendar:updated', listener)
      return () => ipcRenderer.removeListener('calendar:updated', listener)
    }
  },
  // App
  app: {
    exportDb: () => ipcRenderer.invoke('app:exportDb'),
    importDb: () => ipcRenderer.invoke('app:importDb'),
    snapshots: () => ipcRenderer.invoke('app:snapshots'),
    restoreSnapshot: (snapPath: string) => ipcRenderer.invoke('app:restoreSnapshot', snapPath),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
