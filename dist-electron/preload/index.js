"use strict";
const electron = require("electron");
const api = {
  // Tags
  tags: {
    getAll: () => electron.ipcRenderer.invoke("tags:getAll"),
    create: (name, color, isProductive) => electron.ipcRenderer.invoke("tags:create", name, color, isProductive),
    update: (id, name, color, isProductive) => electron.ipcRenderer.invoke("tags:update", id, name, color, isProductive),
    delete: (id) => electron.ipcRenderer.invoke("tags:delete", id)
  },
  // Tasks
  tasks: {
    getAll: () => electron.ipcRenderer.invoke("tasks:getAll"),
    getForRange: (startDate, endDate) => electron.ipcRenderer.invoke("tasks:getForRange", startDate, endDate),
    getActive: () => electron.ipcRenderer.invoke("tasks:getActive"),
    start: (title, tagId, secondaryTagId, startTime) => electron.ipcRenderer.invoke("tasks:start", title, tagId, secondaryTagId, startTime || (/* @__PURE__ */ new Date()).toISOString()),
    stop: (id, endTime) => electron.ipcRenderer.invoke("tasks:stop", id, endTime),
    update: (id, title, tagId, secondaryTagId, startTime, endTime) => electron.ipcRenderer.invoke("tasks:update", id, title, tagId, secondaryTagId, startTime, endTime),
    delete: (id) => electron.ipcRenderer.invoke("tasks:delete", id),
    add: (title, tagId, secondaryTagId, startTime, endTime) => electron.ipcRenderer.invoke("tasks:add", title, tagId, secondaryTagId, startTime, endTime),
    stopAll: (endTime) => electron.ipcRenderer.invoke("tasks:stopAll", endTime),
    fillGaps: (date) => electron.ipcRenderer.invoke("tasks:fillGaps", date)
  },
  stats: {
    daily: (startDate, endDate) => electron.ipcRenderer.invoke("stats:daily", startDate, endDate),
    byTag: (startDate, endDate) => electron.ipcRenderer.invoke("stats:byTag", startDate, endDate)
  },
  dayConfig: {
    update: (date, isWorkDay) => electron.ipcRenderer.invoke("dayConfig:update", date, isWorkDay)
  },
  // Todos (Inbox + TODO)
  todos: {
    getAll: (status) => electron.ipcRenderer.invoke("todos:getAll", status),
    create: (title, notes, status, source, priority = 0, dueDate = null, projectId = null) => electron.ipcRenderer.invoke("todos:create", title, notes, status, source, priority, dueDate, projectId),
    update: (id, title, notes, status, priority, dueDate, projectId) => electron.ipcRenderer.invoke("todos:update", id, title, notes, status, priority, dueDate, projectId),
    delete: (id) => electron.ipcRenderer.invoke("todos:delete", id)
  },
  // Projects
  projects: {
    getAll: () => electron.ipcRenderer.invoke("projects:getAll"),
    create: (name, description, githubRepoUrl, color) => electron.ipcRenderer.invoke("projects:create", name, description, githubRepoUrl, color),
    update: (id, name, description, githubRepoUrl, color, archived) => electron.ipcRenderer.invoke("projects:update", id, name, description, githubRepoUrl, color, archived),
    delete: (id) => electron.ipcRenderer.invoke("projects:delete", id)
  },
  // Habits
  habits: {
    getAll: () => electron.ipcRenderer.invoke("habits:getAll"),
    create: (name, frequency, target) => electron.ipcRenderer.invoke("habits:create", name, frequency, target),
    delete: (id) => electron.ipcRenderer.invoke("habits:delete", id),
    getEntries: (date) => electron.ipcRenderer.invoke("habits:getEntries", date),
    toggleEntry: (habitId, date, completed) => electron.ipcRenderer.invoke("habits:toggleEntry", habitId, date, completed)
  },
  // Settings (key-value)
  settings: {
    get: (key) => electron.ipcRenderer.invoke("settings:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
    getAll: () => electron.ipcRenderer.invoke("settings:getAll")
  },
  // GitHub
  github: {
    getIssues: () => electron.ipcRenderer.invoke("github:getIssues"),
    sync: () => electron.ipcRenderer.invoke("github:sync")
  },
  // Events (main → renderer)
  on: {
    quickCapture: (cb) => {
      const listener = () => cb();
      electron.ipcRenderer.on("quick-capture:open", listener);
      return () => electron.ipcRenderer.removeListener("quick-capture:open", listener);
    }
  },
  // App
  app: {
    exportDb: () => electron.ipcRenderer.invoke("app:exportDb"),
    importDb: () => electron.ipcRenderer.invoke("app:importDb"),
    openExternal: (url) => electron.ipcRenderer.invoke("app:openExternal", url)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
