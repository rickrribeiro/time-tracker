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
    start: (title, tagId, secondaryTagId, startTime, studyNodeId) => electron.ipcRenderer.invoke("tasks:start", title, tagId, secondaryTagId, startTime || (/* @__PURE__ */ new Date()).toISOString(), studyNodeId ?? null),
    stop: (id, endTime) => electron.ipcRenderer.invoke("tasks:stop", id, endTime),
    update: (id, title, tagId, secondaryTagId, startTime, endTime) => electron.ipcRenderer.invoke("tasks:update", id, title, tagId, secondaryTagId, startTime, endTime),
    delete: (id) => electron.ipcRenderer.invoke("tasks:delete", id),
    add: (title, tagId, secondaryTagId, startTime, endTime, studyNodeId) => electron.ipcRenderer.invoke("tasks:add", title, tagId, secondaryTagId, startTime, endTime, studyNodeId ?? null),
    stopAll: (endTime) => electron.ipcRenderer.invoke("tasks:stopAll", endTime),
    studyHours: () => electron.ipcRenderer.invoke("tasks:studyHours")
  },
  stats: {
    daily: (startDate, endDate) => electron.ipcRenderer.invoke("stats:daily", startDate, endDate),
    byTag: (startDate, endDate) => electron.ipcRenderer.invoke("stats:byTag", startDate, endDate)
  },
  dayConfig: {
    update: (date, isWorkDay) => electron.ipcRenderer.invoke("dayConfig:update", date, isWorkDay)
  },
  // Todos (Inbox + TODO)
  inbox: {
    ocr: (base64, ext) => electron.ipcRenderer.invoke("inbox:ocr", base64, ext)
  },
  stays: {
    favorites: () => electron.ipcRenderer.invoke("stays:favorites"),
    addFavorite: (f) => electron.ipcRenderer.invoke("stays:addFavorite", f),
    removeFavorite: (id) => electron.ipcRenderer.invoke("stays:removeFavorite", id),
    watches: () => electron.ipcRenderer.invoke("stays:watches"),
    addWatch: (w) => electron.ipcRenderer.invoke("stays:addWatch", w),
    updateWatchPrice: (id, current, best, at) => electron.ipcRenderer.invoke("stays:updateWatchPrice", id, current, best, at),
    removeWatch: (id) => electron.ipcRenderer.invoke("stays:removeWatch", id),
    priceHistory: (watchId) => electron.ipcRenderer.invoke("stays:priceHistory", watchId),
    addPricePoint: (p) => electron.ipcRenderer.invoke("stays:addPricePoint", p),
    searchHistory: () => electron.ipcRenderer.invoke("stays:searchHistory"),
    addSearchHistory: (filters) => electron.ipcRenderer.invoke("stays:addSearchHistory", filters)
  },
  contacts: {
    getAll: () => electron.ipcRenderer.invoke("contacts:getAll"),
    create: (name, location, birthday, interests, context, nextFollowUp) => electron.ipcRenderer.invoke("contacts:create", name, location, birthday, interests, context, nextFollowUp),
    update: (id, name, location, birthday, interests, context, lastContactAt, nextFollowUp) => electron.ipcRenderer.invoke("contacts:update", id, name, location, birthday, interests, context, lastContactAt, nextFollowUp),
    log: (id) => electron.ipcRenderer.invoke("contacts:log", id),
    delete: (id) => electron.ipcRenderer.invoke("contacts:delete", id)
  },
  rules: {
    getAll: () => electron.ipcRenderer.invoke("rules:getAll"),
    create: (type, params) => electron.ipcRenderer.invoke("rules:create", type, params),
    update: (id, enabled, params) => electron.ipcRenderer.invoke("rules:update", id, enabled, params),
    delete: (id) => electron.ipcRenderer.invoke("rules:delete", id)
  },
  jobs: {
    getAll: () => electron.ipcRenderer.invoke("jobs:getAll"),
    create: (name, prompt, hour) => electron.ipcRenderer.invoke("jobs:create", name, prompt, hour),
    update: (id, name, prompt, hour, enabled) => electron.ipcRenderer.invoke("jobs:update", id, name, prompt, hour, enabled),
    delete: (id) => electron.ipcRenderer.invoke("jobs:delete", id)
  },
  goals: {
    getForMonth: (month) => electron.ipcRenderer.invoke("goals:getForMonth", month),
    create: (month, title, kind, refId, target, unit) => electron.ipcRenderer.invoke("goals:create", month, title, kind, refId, target, unit),
    update: (id, title, target, current, unit, done) => electron.ipcRenderer.invoke("goals:update", id, title, target, current, unit, done),
    delete: (id) => electron.ipcRenderer.invoke("goals:delete", id)
  },
  todos: {
    getAll: (status) => electron.ipcRenderer.invoke("todos:getAll", status),
    create: (title, notes, status, source, priority = 0, dueDate = null, projectId = null, aiGenerated = 0, recurrence = null, type = "projeto") => electron.ipcRenderer.invoke("todos:create", title, notes, status, source, priority, dueDate, projectId, aiGenerated, recurrence, type),
    update: (id, title, notes, status, priority, dueDate, projectId, recurrence, type) => electron.ipcRenderer.invoke("todos:update", id, title, notes, status, priority, dueDate, projectId, recurrence, type),
    delete: (id) => electron.ipcRenderer.invoke("todos:delete", id)
  },
  // Projects
  projects: {
    getAll: () => electron.ipcRenderer.invoke("projects:getAll"),
    create: (name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience) => electron.ipcRenderer.invoke("projects:create", name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience),
    update: (id, name, description, githubRepoUrl, color, archived, claudeCommand, localPath, stage, businessModel, pricing, audience) => electron.ipcRenderer.invoke("projects:update", id, name, description, githubRepoUrl, color, archived, claudeCommand, localPath, stage, businessModel, pricing, audience),
    setStage: (id, stage) => electron.ipcRenderer.invoke("projects:setStage", id, stage),
    delete: (id) => electron.ipcRenderer.invoke("projects:delete", id)
  },
  milestones: {
    getAll: () => electron.ipcRenderer.invoke("milestones:getAll"),
    create: (projectId, title, targetDate) => electron.ipcRenderer.invoke("milestones:create", projectId, title, targetDate),
    toggle: (id, done) => electron.ipcRenderer.invoke("milestones:toggle", id, done),
    delete: (id) => electron.ipcRenderer.invoke("milestones:delete", id)
  },
  // Habits
  habits: {
    getAll: () => electron.ipcRenderer.invoke("habits:getAll"),
    create: (name, frequency, target) => electron.ipcRenderer.invoke("habits:create", name, frequency, target),
    update: (id, name, frequency, target, active) => electron.ipcRenderer.invoke("habits:update", id, name, frequency, target, active),
    delete: (id) => electron.ipcRenderer.invoke("habits:delete", id),
    getEntries: (date) => electron.ipcRenderer.invoke("habits:getEntries", date),
    getEntriesRange: (startDate, endDate) => electron.ipcRenderer.invoke("habits:getEntriesRange", startDate, endDate),
    toggleEntry: (habitId, date, completed) => electron.ipcRenderer.invoke("habits:toggleEntry", habitId, date, completed),
    completionsForDate: (date) => electron.ipcRenderer.invoke("habits:completionsForDate", date)
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
    sync: () => electron.ipcRenderer.invoke("github:sync"),
    createLocal: (repo, title, body) => electron.ipcRenderer.invoke("github:createLocal", repo, title, body),
    deleteIssue: (id) => electron.ipcRenderer.invoke("github:deleteIssue", id),
    createOnGithub: (id) => electron.ipcRenderer.invoke("github:createOnGithub", id)
  },
  // Calendar
  calendar: {
    upcoming: (fromISO, limit) => electron.ipcRenderer.invoke("calendar:upcoming", fromISO, limit),
    range: (startISO, endISO) => electron.ipcRenderer.invoke("calendar:range", startISO, endISO),
    create: (title, startTime, endTime, location) => electron.ipcRenderer.invoke("calendar:create", title, startTime, endTime, location),
    delete: (id) => electron.ipcRenderer.invoke("calendar:delete", id)
  },
  // Google Calendar (OAuth)
  google: {
    connect: () => electron.ipcRenderer.invoke("google:connect"),
    status: () => electron.ipcRenderer.invoke("google:status"),
    accounts: () => electron.ipcRenderer.invoke("google:accounts"),
    disconnect: () => electron.ipcRenderer.invoke("google:disconnect"),
    disconnectAccount: (email) => electron.ipcRenderer.invoke("google:disconnectAccount", email),
    sync: () => electron.ipcRenderer.invoke("google:sync")
  },
  // Finance
  accounts: {
    getAll: () => electron.ipcRenderer.invoke("accounts:getAll"),
    create: (name, currency, balance) => electron.ipcRenderer.invoke("accounts:create", name, currency, balance),
    update: (id, name, currency, balance) => electron.ipcRenderer.invoke("accounts:update", id, name, currency, balance),
    delete: (id) => electron.ipcRenderer.invoke("accounts:delete", id)
  },
  categories: {
    getAll: () => electron.ipcRenderer.invoke("categories:getAll"),
    create: (name, type, color) => electron.ipcRenderer.invoke("categories:create", name, type, color),
    delete: (id) => electron.ipcRenderer.invoke("categories:delete", id)
  },
  transactions: {
    getAll: (month) => electron.ipcRenderer.invoke("transactions:getAll", month),
    create: (accountId, categoryId, amount, currency, type, description, date) => electron.ipcRenderer.invoke("transactions:create", accountId, categoryId, amount, currency, type, description, date),
    update: (id, accountId, categoryId, amount, currency, type, description, date) => electron.ipcRenderer.invoke("transactions:update", id, accountId, categoryId, amount, currency, type, description, date),
    delete: (id) => electron.ipcRenderer.invoke("transactions:delete", id),
    bulk: (rows) => electron.ipcRenderer.invoke("transactions:bulk", rows)
  },
  budgets: {
    getForMonth: (month) => electron.ipcRenderer.invoke("budgets:getForMonth", month),
    set: (categoryId, month, amount) => electron.ipcRenderer.invoke("budgets:set", categoryId, month, amount)
  },
  investments: {
    getAll: () => electron.ipcRenderer.invoke("investments:getAll"),
    history: () => electron.ipcRenderer.invoke("investments:history"),
    create: (name, type, amount, currency) => electron.ipcRenderer.invoke("investments:create", name, type, amount, currency),
    setValue: (investmentId, month, amount) => electron.ipcRenderer.invoke("investments:setValue", investmentId, month, amount),
    delete: (id) => electron.ipcRenderer.invoke("investments:delete", id)
  },
  pluggy: {
    sync: () => electron.ipcRenderer.invoke("pluggy:sync"),
    status: () => electron.ipcRenderer.invoke("pluggy:status"),
    connectToken: () => electron.ipcRenderer.invoke("pluggy:connectToken")
  },
  trips: {
    getAll: () => electron.ipcRenderer.invoke("trips:getAll"),
    create: (origin, destination, startDate, endDate, budget, currency, status) => electron.ipcRenderer.invoke("trips:create", origin, destination, startDate, endDate, budget, currency, status),
    update: (id, origin, destination, startDate, endDate, budget, currency, status) => electron.ipcRenderer.invoke("trips:update", id, origin, destination, startDate, endDate, budget, currency, status),
    delete: (id) => electron.ipcRenderer.invoke("trips:delete", id)
  },
  flights: {
    getAll: () => electron.ipcRenderer.invoke("flights:getAll"),
    create: (tripId, origin, destination, price, currency) => electron.ipcRenderer.invoke("flights:create", tripId, origin, destination, price, currency),
    delete: (id) => electron.ipcRenderer.invoke("flights:delete", id),
    search: (origin, destination, currency, date) => electron.ipcRenderer.invoke("flights:search", origin, destination, currency, date),
    refreshWatch: (id) => electron.ipcRenderer.invoke("flights:refreshWatch", id)
  },
  tripDocs: {
    get: (tripId) => electron.ipcRenderer.invoke("tripDocs:get", tripId),
    set: (tripId, item, checked) => electron.ipcRenderer.invoke("tripDocs:set", tripId, item, checked)
  },
  // IA library
  skills: {
    getAll: () => electron.ipcRenderer.invoke("skills:getAll"),
    create: (name, description, category, tags, content) => electron.ipcRenderer.invoke("skills:create", name, description, category, tags, content),
    update: (id, name, description, category, tags, content) => electron.ipcRenderer.invoke("skills:update", id, name, description, category, tags, content),
    delete: (id) => electron.ipcRenderer.invoke("skills:delete", id),
    toggleFavorite: (id) => electron.ipcRenderer.invoke("skills:toggleFavorite", id),
    export: (id) => electron.ipcRenderer.invoke("skills:export", id),
    import: () => electron.ipcRenderer.invoke("skills:import")
  },
  agents: {
    getAll: () => electron.ipcRenderer.invoke("agents:getAll"),
    create: (name, description, role, systemPrompt, defaultSkillIds, tags) => electron.ipcRenderer.invoke("agents:create", name, description, role, systemPrompt, defaultSkillIds, tags),
    update: (id, name, description, role, systemPrompt, defaultSkillIds, tags) => electron.ipcRenderer.invoke("agents:update", id, name, description, role, systemPrompt, defaultSkillIds, tags),
    delete: (id) => electron.ipcRenderer.invoke("agents:delete", id),
    toggleFavorite: (id) => electron.ipcRenderer.invoke("agents:toggleFavorite", id),
    export: (id) => electron.ipcRenderer.invoke("agents:export", id),
    import: () => electron.ipcRenderer.invoke("agents:import")
  },
  executions: {
    getAll: () => electron.ipcRenderer.invoke("executions:getAll"),
    create: (agentId, skillIds, userPrompt, finalPrompt, response) => electron.ipcRenderer.invoke("executions:create", agentId, skillIds, userPrompt, finalPrompt, response),
    delete: (id) => electron.ipcRenderer.invoke("executions:delete", id)
  },
  links: {
    getAll: () => electron.ipcRenderer.invoke("links:getAll"),
    create: (title, url, tags) => electron.ipcRenderer.invoke("links:create", title, url, tags),
    update: (id, title, url, tags) => electron.ipcRenderer.invoke("links:update", id, title, url, tags),
    setChecked: (id, checked) => electron.ipcRenderer.invoke("links:setChecked", id, checked),
    markOpened: (id) => electron.ipcRenderer.invoke("links:markOpened", id),
    delete: (id) => electron.ipcRenderer.invoke("links:delete", id)
  },
  study: {
    topics: () => electron.ipcRenderer.invoke("study:topics"),
    createTopic: (name, category, status, targetDate, priority, color) => electron.ipcRenderer.invoke("study:createTopic", name, category, status, targetDate, priority, color),
    updateTopic: (id, name, category, status, targetDate, priority, color) => electron.ipcRenderer.invoke("study:updateTopic", id, name, category, status, targetDate, priority, color),
    deleteTopic: (id) => electron.ipcRenderer.invoke("study:deleteTopic", id),
    nodes: (topicId) => electron.ipcRenderer.invoke("study:nodes", topicId),
    allNodes: () => electron.ipcRenderer.invoke("study:allNodes"),
    allNotes: () => electron.ipcRenderer.invoke("study:allNotes"),
    createNode: (topicId, parentId, title, description, estimatedHours) => electron.ipcRenderer.invoke("study:createNode", topicId, parentId, title, description, estimatedHours),
    updateNode: (id, title, description, status, estimatedHours) => electron.ipcRenderer.invoke("study:updateNode", id, title, description, status, estimatedHours),
    deleteNode: (id) => electron.ipcRenderer.invoke("study:deleteNode", id),
    moveNode: (id, dir) => electron.ipcRenderer.invoke("study:moveNode", id, dir),
    reorderNode: (id, newParentId, newIndex) => electron.ipcRenderer.invoke("study:reorderNode", id, newParentId, newIndex),
    getNote: (topicId, nodeId) => electron.ipcRenderer.invoke("study:getNote", topicId, nodeId),
    saveNote: (topicId, nodeId, content) => electron.ipcRenderer.invoke("study:saveNote", topicId, nodeId, content),
    flashcards: (topicId) => electron.ipcRenderer.invoke("study:flashcards", topicId),
    due: (nowISO) => electron.ipcRenderer.invoke("study:due", nowISO),
    createFlashcard: (topicId, nodeId, front, back) => electron.ipcRenderer.invoke("study:createFlashcard", topicId, nodeId, front, back),
    updateFlashcard: (id, front, back) => electron.ipcRenderer.invoke("study:updateFlashcard", id, front, back),
    deleteFlashcard: (id) => electron.ipcRenderer.invoke("study:deleteFlashcard", id),
    reviewFlashcard: (id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt) => electron.ipcRenderer.invoke("study:reviewFlashcard", id, easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt),
    quizAttempts: (topicId) => electron.ipcRenderer.invoke("study:quizAttempts", topicId),
    saveQuizAttempt: (topicId, score, total, durationMs) => electron.ipcRenderer.invoke("study:saveQuizAttempt", topicId, score, total, durationMs),
    exportMarkdown: (topicId) => electron.ipcRenderer.invoke("study:exportMarkdown", topicId),
    exportJson: (topicId) => electron.ipcRenderer.invoke("study:exportJson", topicId),
    importJson: () => electron.ipcRenderer.invoke("study:importJson"),
    exportFolder: (topicId) => electron.ipcRenderer.invoke("study:exportFolder", topicId),
    importFolder: () => electron.ipcRenderer.invoke("study:importFolder")
  },
  // AI (Claude CLI)
  ai: {
    run: (prompt, projectId, model) => electron.ipcRenderer.invoke("ai:run", prompt, projectId, model),
    runStream: (prompt, projectId, model, runId) => electron.ipcRenderer.invoke("ai:runStream", prompt, projectId, model, runId),
    start: (params) => electron.ipcRenderer.invoke("ai:start", params),
    getRun: (runId) => electron.ipcRenderer.invoke("ai:getRun", runId),
    cancel: (runId) => electron.ipcRenderer.invoke("ai:cancel", runId),
    onChunk: (cb) => {
      const listener = (_e, payload) => cb(payload.runId, payload.text);
      electron.ipcRenderer.on("ai:chunk", listener);
      return () => electron.ipcRenderer.removeListener("ai:chunk", listener);
    },
    onDone: (cb) => {
      const listener = (_e, payload) => cb(payload);
      electron.ipcRenderer.on("ai:done", listener);
      return () => electron.ipcRenderer.removeListener("ai:done", listener);
    }
  },
  // Events (main → renderer)
  on: {
    quickCapture: (cb) => {
      const listener = () => cb();
      electron.ipcRenderer.on("quick-capture:open", listener);
      return () => electron.ipcRenderer.removeListener("quick-capture:open", listener);
    },
    calendarUpdated: (cb) => {
      const listener = () => cb();
      electron.ipcRenderer.on("calendar:updated", listener);
      return () => electron.ipcRenderer.removeListener("calendar:updated", listener);
    }
  },
  // App
  app: {
    exportDb: () => electron.ipcRenderer.invoke("app:exportDb"),
    importDb: () => electron.ipcRenderer.invoke("app:importDb"),
    snapshots: () => electron.ipcRenderer.invoke("app:snapshots"),
    restoreSnapshot: (snapPath) => electron.ipcRenderer.invoke("app:restoreSnapshot", snapPath),
    openExternal: (url) => electron.ipcRenderer.invoke("app:openExternal", url)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
