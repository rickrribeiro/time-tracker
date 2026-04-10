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
    start: (title, tagId, startTime) => electron.ipcRenderer.invoke("tasks:start", title, tagId, startTime || (/* @__PURE__ */ new Date()).toISOString()),
    stop: (id, endTime) => electron.ipcRenderer.invoke("tasks:stop", id, endTime),
    update: (id, title, tagId, startTime, endTime) => electron.ipcRenderer.invoke("tasks:update", id, title, tagId, startTime, endTime),
    delete: (id) => electron.ipcRenderer.invoke("tasks:delete", id),
    add: (title, tagId, startTime, endTime) => electron.ipcRenderer.invoke("tasks:add", title, tagId, startTime, endTime),
    stopAll: (endTime) => electron.ipcRenderer.invoke("tasks:stopAll", endTime),
    fillGaps: (date) => electron.ipcRenderer.invoke("tasks:fillGaps", date)
  },
  stats: {
    daily: (startDate, endDate) => electron.ipcRenderer.invoke("stats:daily", startDate, endDate),
    byTag: (startDate, endDate) => electron.ipcRenderer.invoke("stats:byTag", startDate, endDate)
  },
  // App
  app: {
    exportDb: () => electron.ipcRenderer.invoke("app:exportDb")
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
