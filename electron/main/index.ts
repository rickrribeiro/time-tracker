import { app, BrowserWindow, ipcMain, shell, globalShortcut, Notification, safeStorage } from 'electron'
import { join } from 'path'
import { startServer, StartedServer } from '../../server/index'
import { migrateLegacySecrets } from '../../server/services/secrets'

/**
 * The desktop app is a client of the rickOS server — same as the web version.
 *  - RICKOS_SERVER_URL set  → use that (remote) server
 *  - a rickOS server already on the port (e.g. `npm run dev:web`) → reuse it
 *  - otherwise              → start the server inside this process
 * Only native things stay here: window, global shortcut, notifications, openExternal.
 */
const PORT = Number(process.env.RICKOS_PORT || 4318)
let serverUrl = process.env.RICKOS_SERVER_URL?.replace(/\/+$/, '') || ''
const serverToken = process.env.RICKOS_TOKEN || ''
let embedded: StartedServer | null = null

async function isRickosServer(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) })
    const j = (await r.json()) as { ok?: boolean; channels?: number }
    return !!j.ok && typeof j.channels === 'number'
  } catch {
    return false
  }
}

async function ensureServer(): Promise<void> {
  if (serverUrl) return
  const local = `http://127.0.0.1:${PORT}`
  if (await isRickosServer(local)) {
    serverUrl = local
    return
  }
  embedded = await startServer({ port: PORT, host: '127.0.0.1', token: '' })
  serverUrl = embedded.url
  // One-time: secrets encrypted by the old build with the OS keychain → AES (server-readable).
  if (safeStorage.isEncryptionAvailable()) {
    await migrateLegacySecrets((b64) => safeStorage.decryptString(Buffer.from(b64, 'base64'))).catch(() => 0)
  }
}

// Sync IPC used by the preload to learn where the server is (before the page runs).
ipcMain.on('desktop:serverUrl', (e) => {
  e.returnValue = serverUrl
})
ipcMain.on('desktop:token', (e) => {
  e.returnValue = serverToken
})
ipcMain.on('desktop:notify', (_e, title: string, body: string) => {
  try {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  } catch {
    // ignore
  }
})
ipcMain.on('desktop:openExternal', (_e, url: string) => {
  if (/^https?:\/\//i.test(url) || url.startsWith('mailto:')) void shell.openExternal(url)
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    await ensureServer()
  } catch (e) {
    console.error('[rickOS] não foi possível iniciar o servidor:', e)
  }
  createWindow()

  // Global quick-capture: focus the window and open the capture modal
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.send('quick-capture:open')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  // On macOS the app (and the embedded server, so the phone keeps working) stays alive.
  if (process.platform !== 'darwin') {
    void embedded?.close()
    app.quit()
  }
})

app.on('before-quit', () => {
  void embedded?.close()
})
