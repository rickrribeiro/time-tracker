import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Tags
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    create: (name: string, color: string, isProductive: boolean) =>
      ipcRenderer.invoke('tags:create', name, color, isProductive),
    update: (id: number, name: string, color: string, isProductive: boolean) =>
      ipcRenderer.invoke('tags:update', id, name, color, isProductive),
    delete: (id: number) => ipcRenderer.invoke('tags:delete', id)
  },
  // Tasks
  tasks: {
    getAll: () => ipcRenderer.invoke('tasks:getAll'),
    getForRange: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('tasks:getForRange', startDate, endDate),
    getActive: () => ipcRenderer.invoke('tasks:getActive'),
    start: (title: string, tagId: number | null, startTime?: string) =>
      ipcRenderer.invoke('tasks:start', title, tagId, startTime || new Date().toISOString()),
    stop: (id: number, endTime?: string) =>
      ipcRenderer.invoke('tasks:stop', id, endTime),
    update: (
      id: number,
      title: string,
      tagId: number | null,
      startTime: string,
      endTime: string | null
    ) => ipcRenderer.invoke('tasks:update', id, title, tagId, startTime, endTime),
    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),
    add: (title: string, tagId: number | null, startTime: string, endTime: string | null) =>
      ipcRenderer.invoke('tasks:add', title, tagId, startTime, endTime),
    stopAll: (endTime: string) => ipcRenderer.invoke('tasks:stopAll', endTime),
    fillGaps: (date: string) => ipcRenderer.invoke('tasks:fillGaps', date)
  },
  stats: {
    daily: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('stats:daily', startDate, endDate),
    byTag: (startDate: string, endDate: string) =>
      ipcRenderer.invoke('stats:byTag', startDate, endDate)
  },
  // App
  app: {
    exportDb: () => ipcRenderer.invoke('app:exportDb')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
