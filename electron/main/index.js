import { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } from 'electron';
import { join } from 'path';
import fs from 'fs';
import { closeDb, saveDb } from './database/db';
import { getAllTags, getAllTasks, createTag, updateTag, deleteTag, getTasksForRange, getActiveTask, createTask, updateTask, stopTask, deleteTask, stopAllActiveTasks, getDailyStats, getTagStats, fillGapsWithIdle, updateDayConfig, getTodos, createTodo, updateTodo, deleteTodo, getProjects, createProject, updateProject, deleteProject, getHabits, createHabit, deleteHabit, getHabitEntries, toggleHabitEntry, getSetting, setSetting, getAllSettings, getGithubIssues } from './database/queries';
import { syncGithubIssues } from './services/github';
function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    win.on('ready-to-show', () => win.show());
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    if (process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    }
    else {
        win.loadFile(join(__dirname, '../../dist/index.html'));
    }
}
app.whenReady().then(() => {
    createWindow();
    // Global quick-capture: focus the window and open the capture modal
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win)
            return;
        if (win.isMinimized())
            win.restore();
        win.show();
        win.focus();
        win.webContents.send('quick-capture:open');
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => {
    closeDb();
    if (process.platform !== 'darwin')
        app.quit();
});
// ── IPC: Tags ─────────────────────────────────────────────────────────────────
ipcMain.handle('tags:getAll', () => getAllTags());
ipcMain.handle('tags:create', (_, name, color, isProductive) => createTag(name, color, isProductive));
ipcMain.handle('tags:update', (_, id, name, color, isProductive) => updateTag(id, name, color, isProductive));
ipcMain.handle('tags:delete', (_, id) => deleteTag(id));
// ── IPC: Tasks ────────────────────────────────────────────────────────────────
ipcMain.handle('tasks:getAll', () => getAllTasks());
ipcMain.handle('tasks:getForRange', (_, startDate, endDate) => getTasksForRange(startDate, endDate));
ipcMain.handle('tasks:getActive', () => getActiveTask());
ipcMain.handle('tasks:start', async (_, title, tagId, secondaryTagId, startTime) => {
    const now = startTime || new Date().toISOString();
    await stopAllActiveTasks(now);
    return createTask(title, tagId, secondaryTagId, now);
});
ipcMain.handle('tasks:stop', async (_, id, endTime) => {
    const now = endTime || new Date().toISOString();
    await stopTask(id, now);
});
ipcMain.handle('tasks:update', (_, id, title, tagId, secondaryTagId, startTime, endTime) => updateTask(id, title, tagId, secondaryTagId, startTime, endTime));
ipcMain.handle('tasks:delete', (_, id) => deleteTask(id));
ipcMain.handle('tasks:add', (_, title, tagId, secondaryTagId, startTime, endTime) => createTask(title, tagId, secondaryTagId, startTime, endTime));
ipcMain.handle('tasks:stopAll', (_, endTime) => stopAllActiveTasks(endTime));
ipcMain.handle('tasks:fillGaps', (_, date) => fillGapsWithIdle(date));
// ── IPC: Stats ────────────────────────────────────────────────────────────────
ipcMain.handle('stats:daily', (_, startDate, endDate) => getDailyStats(startDate, endDate));
ipcMain.handle('stats:byTag', (_, startDate, endDate) => getTagStats(startDate, endDate));
ipcMain.handle('dayConfig:update', (_, date, isWorkDay) => updateDayConfig(date, isWorkDay));
// ── IPC: Todos (Inbox + TODO) ───────────────────────────────────────────────
ipcMain.handle('todos:getAll', (_, status) => getTodos(status));
ipcMain.handle('todos:create', (_, title, notes, status, source, priority, dueDate, projectId) => createTodo(title, notes, status, source, priority, dueDate, projectId));
ipcMain.handle('todos:update', (_, id, title, notes, status, priority, dueDate, projectId) => updateTodo(id, title, notes, status, priority, dueDate, projectId));
ipcMain.handle('todos:delete', (_, id) => deleteTodo(id));
// ── IPC: Projects ─────────────────────────────────────────────────────────────
ipcMain.handle('projects:getAll', () => getProjects());
ipcMain.handle('projects:create', (_, name, description, githubRepoUrl, color) => createProject(name, description, githubRepoUrl, color));
ipcMain.handle('projects:update', (_, id, name, description, githubRepoUrl, color, archived) => updateProject(id, name, description, githubRepoUrl, color, archived));
ipcMain.handle('projects:delete', (_, id) => deleteProject(id));
// ── IPC: Habits ───────────────────────────────────────────────────────────────
ipcMain.handle('habits:getAll', () => getHabits());
ipcMain.handle('habits:create', (_, name, frequency, target) => createHabit(name, frequency, target));
ipcMain.handle('habits:delete', (_, id) => deleteHabit(id));
ipcMain.handle('habits:getEntries', (_, date) => getHabitEntries(date));
ipcMain.handle('habits:toggleEntry', (_, habitId, date, completed) => toggleHabitEntry(habitId, date, completed));
// ── IPC: Settings ───────────────────────────────────────────────────────────
ipcMain.handle('settings:get', (_, key) => getSetting(key));
ipcMain.handle('settings:set', (_, key, value) => setSetting(key, value));
ipcMain.handle('settings:getAll', () => getAllSettings());
// ── IPC: GitHub ───────────────────────────────────────────────────────────────
ipcMain.handle('github:getIssues', () => getGithubIssues());
ipcMain.handle('github:sync', () => syncGithubIssues());
// ── IPC: App ──────────────────────────────────────────────────────────────────
ipcMain.handle('app:openExternal', (_, url) => shell.openExternal(url));
ipcMain.handle('app:exportDb', async () => {
    saveDb();
    const dbPath = join(app.getPath('userData'), 'timetracker.db');
    const options = {
        title: 'Export Database',
        defaultPath: 'timetracker_snapshot.sqlite',
        buttonLabel: 'Export',
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    };
    const result = await dialog.showSaveDialog(options);
    if (!result.canceled && result.filePath) {
        fs.copyFileSync(dbPath, result.filePath);
        return true;
    }
    return false;
});
ipcMain.handle('app:importDb', async (event) => {
    const result = await dialog.showOpenDialog({
        title: 'Import Database Snapshot',
        buttonLabel: 'Import',
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
        properties: ['openFile']
    });
    if (result.canceled || !result.filePaths[0])
        return false;
    const dbPath = join(app.getPath('userData'), 'timetracker.db');
    closeDb();
    fs.copyFileSync(result.filePaths[0], dbPath);
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.reload();
    return true;
});
