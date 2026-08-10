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
    start: (title: string, tagId: number | null, secondaryTagId: number | null, startTime?: string) =>
      ipcRenderer.invoke('tasks:start', title, tagId, secondaryTagId, startTime || new Date().toISOString()),
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
    add: (title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null) =>
      ipcRenderer.invoke('tasks:add', title, tagId, secondaryTagId, startTime, endTime),
    stopAll: (endTime: string) => ipcRenderer.invoke('tasks:stopAll', endTime),
    fillGaps: (date: string) => ipcRenderer.invoke('tasks:fillGaps', date)
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
  todos: {
    getAll: (status?: string) => ipcRenderer.invoke('todos:getAll', status),
    create: (
      title: string,
      notes: string | null,
      status: string,
      source: string,
      priority = 0,
      dueDate: string | null = null,
      projectId: number | null = null
    ) => ipcRenderer.invoke('todos:create', title, notes, status, source, priority, dueDate, projectId),
    update: (
      id: number,
      title: string,
      notes: string | null,
      status: string,
      priority: number,
      dueDate: string | null,
      projectId: number | null
    ) => ipcRenderer.invoke('todos:update', id, title, notes, status, priority, dueDate, projectId),
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
      ipcRenderer.invoke('habits:toggleEntry', habitId, date, completed)
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
    disconnect: () => ipcRenderer.invoke('google:disconnect'),
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
    create: (name: string, type: string | null, amount: number, currency: string) => ipcRenderer.invoke('investments:create', name, type, amount, currency),
    delete: (id: number) => ipcRenderer.invoke('investments:delete', id)
  },
  pluggy: {
    sync: () => ipcRenderer.invoke('pluggy:sync'),
    status: () => ipcRenderer.invoke('pluggy:status')
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
    create: (title: string, url: string) => ipcRenderer.invoke('links:create', title, url),
    update: (id: number, title: string, url: string) => ipcRenderer.invoke('links:update', id, title, url),
    setChecked: (id: number, checked: number) => ipcRenderer.invoke('links:setChecked', id, checked),
    delete: (id: number) => ipcRenderer.invoke('links:delete', id)
  },
  // AI (Claude CLI)
  ai: {
    run: (prompt: string, projectId?: number, model?: string) => ipcRenderer.invoke('ai:run', prompt, projectId, model),
    runStream: (prompt: string, projectId?: number, model?: string) => ipcRenderer.invoke('ai:runStream', prompt, projectId, model),
    onChunk: (cb: (text: string) => void) => {
      const listener = (_e: unknown, text: string): void => cb(text)
      ipcRenderer.on('ai:chunk', listener)
      return () => ipcRenderer.removeListener('ai:chunk', listener)
    }
  },
  // Events (main → renderer)
  on: {
    quickCapture: (cb: () => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('quick-capture:open', listener)
      return () => ipcRenderer.removeListener('quick-capture:open', listener)
    }
  },
  // App
  app: {
    exportDb: () => ipcRenderer.invoke('app:exportDb'),
    importDb: () => ipcRenderer.invoke('app:importDb'),
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
