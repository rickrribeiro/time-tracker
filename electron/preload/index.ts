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
    create: (name: string, description: string | null, githubRepoUrl: string | null, color: string) =>
      ipcRenderer.invoke('projects:create', name, description, githubRepoUrl, color),
    update: (
      id: number,
      name: string,
      description: string | null,
      githubRepoUrl: string | null,
      color: string,
      archived: number
    ) => ipcRenderer.invoke('projects:update', id, name, description, githubRepoUrl, color, archived),
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id)
  },
  // Habits
  habits: {
    getAll: () => ipcRenderer.invoke('habits:getAll'),
    create: (name: string, frequency: string, target: number) =>
      ipcRenderer.invoke('habits:create', name, frequency, target),
    delete: (id: number) => ipcRenderer.invoke('habits:delete', id),
    getEntries: (date: string) => ipcRenderer.invoke('habits:getEntries', date),
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
    sync: () => ipcRenderer.invoke('github:sync')
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
