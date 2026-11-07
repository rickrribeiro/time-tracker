import { contextBridge, ipcRenderer } from 'electron'

/**
 * Desktop-only bridge. All data goes through the rickOS server over HTTP
 * (src/api/createApi.ts) — the same path the web version uses. This exposes only
 * what a browser can't do: global shortcut, native notifications, system browser.
 */
const serverUrl = ipcRenderer.sendSync('desktop:serverUrl') as string
const token = ipcRenderer.sendSync('desktop:token') as string

const desktop = {
  serverUrl,
  token,
  onQuickCapture: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('quick-capture:open', listener)
    return () => {
      ipcRenderer.removeListener('quick-capture:open', listener)
    }
  },
  notify: (title: string, body: string) => ipcRenderer.send('desktop:notify', title, body),
  openExternal: (url: string) => ipcRenderer.send('desktop:openExternal', url)
}

contextBridge.exposeInMainWorld('desktop', desktop)

export type DesktopAPI = typeof desktop
