import { contextBridge, ipcRenderer } from 'electron';
const api = {
    // Tags
    tags: {
        getAll: () => ipcRenderer.invoke('tags:getAll'),
        create: (name, color, isProductive) => ipcRenderer.invoke('tags:create', name, color, isProductive),
        update: (id, name, color, isProductive) => ipcRenderer.invoke('tags:update', id, name, color, isProductive),
        delete: (id) => ipcRenderer.invoke('tags:delete', id)
    },
    // Tasks
    tasks: {
        getAll: () => ipcRenderer.invoke('tasks:getAll'),
        getForRange: (startDate, endDate) => ipcRenderer.invoke('tasks:getForRange', startDate, endDate),
        getActive: () => ipcRenderer.invoke('tasks:getActive'),
        start: (title, tagId, secondaryTagId, startTime) => ipcRenderer.invoke('tasks:start', title, tagId, secondaryTagId, startTime || new Date().toISOString()),
        stop: (id, endTime) => ipcRenderer.invoke('tasks:stop', id, endTime),
        update: (id, title, tagId, secondaryTagId, startTime, endTime) => ipcRenderer.invoke('tasks:update', id, title, tagId, secondaryTagId, startTime, endTime),
        delete: (id) => ipcRenderer.invoke('tasks:delete', id),
        add: (title, tagId, secondaryTagId, startTime, endTime) => ipcRenderer.invoke('tasks:add', title, tagId, secondaryTagId, startTime, endTime),
        stopAll: (endTime) => ipcRenderer.invoke('tasks:stopAll', endTime),
        fillGaps: (date) => ipcRenderer.invoke('tasks:fillGaps', date)
    },
    stats: {
        daily: (startDate, endDate) => ipcRenderer.invoke('stats:daily', startDate, endDate),
        byTag: (startDate, endDate) => ipcRenderer.invoke('stats:byTag', startDate, endDate)
    },
    dayConfig: {
        update: (date, isWorkDay) => ipcRenderer.invoke('dayConfig:update', date, isWorkDay)
    },
    // Todos (Inbox + TODO)
    todos: {
        getAll: (status) => ipcRenderer.invoke('todos:getAll', status),
        create: (title, notes, status, source, priority = 0, dueDate = null, projectId = null) => ipcRenderer.invoke('todos:create', title, notes, status, source, priority, dueDate, projectId),
        update: (id, title, notes, status, priority, dueDate, projectId) => ipcRenderer.invoke('todos:update', id, title, notes, status, priority, dueDate, projectId),
        delete: (id) => ipcRenderer.invoke('todos:delete', id)
    },
    // Projects
    projects: {
        getAll: () => ipcRenderer.invoke('projects:getAll'),
        create: (name, description, githubRepoUrl, color) => ipcRenderer.invoke('projects:create', name, description, githubRepoUrl, color),
        update: (id, name, description, githubRepoUrl, color, archived) => ipcRenderer.invoke('projects:update', id, name, description, githubRepoUrl, color, archived),
        delete: (id) => ipcRenderer.invoke('projects:delete', id)
    },
    // Habits
    habits: {
        getAll: () => ipcRenderer.invoke('habits:getAll'),
        create: (name, frequency, target) => ipcRenderer.invoke('habits:create', name, frequency, target),
        delete: (id) => ipcRenderer.invoke('habits:delete', id),
        getEntries: (date) => ipcRenderer.invoke('habits:getEntries', date),
        toggleEntry: (habitId, date, completed) => ipcRenderer.invoke('habits:toggleEntry', habitId, date, completed)
    },
    // Settings (key-value)
    settings: {
        get: (key) => ipcRenderer.invoke('settings:get', key),
        set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
        getAll: () => ipcRenderer.invoke('settings:getAll')
    },
    // GitHub
    github: {
        getIssues: () => ipcRenderer.invoke('github:getIssues'),
        sync: () => ipcRenderer.invoke('github:sync')
    },
    // Events (main → renderer)
    on: {
        quickCapture: (cb) => {
            const listener = () => cb();
            ipcRenderer.on('quick-capture:open', listener);
            return () => ipcRenderer.removeListener('quick-capture:open', listener);
        }
    },
    // App
    app: {
        exportDb: () => ipcRenderer.invoke('app:exportDb'),
        importDb: () => ipcRenderer.invoke('app:importDb'),
        openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
    }
};
contextBridge.exposeInMainWorld('api', api);
