/**
 * HTTP transport to the rickOS server — the same on desktop (Electron) and web.
 *  - desktop: the preload exposes `window.desktop.serverUrl` (the embedded server)
 *  - web: same origin (the server serves the front; Vite proxies /api in dev)
 */

const TOKEN_KEY = 'rickos-token'

export function serverBase(): string {
  return window.desktop?.serverUrl ?? ''
}

export function getToken(): string {
  if (window.desktop?.token) return window.desktop.token
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable (private mode) — token lives only for this session
  }
}

/** Fired when the server rejects the token, so the app can show the login screen. */
export const UNAUTHORIZED_EVENT = 'rickos:unauthorized'

function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  // JSON can't carry `undefined` (some handlers treat undefined as "keep" and null as
  // "clear"), so send the indices of undefined args and let the server restore them.
  const undef: number[] = []
  args.forEach((a, i) => {
    if (a === undefined) undef.push(i)
  })
  const res = await fetch(`${serverBase()}/api/rpc/${encodeURIComponent(channel)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ args, undef })
  })
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw new Error('Não autorizado: informe o token do rickOS.')
  }
  const json = (await res.json()) as { ok: boolean; result?: T; error?: string }
  if (!json.ok) throw new Error(json.error || `Falha em ${channel}`)
  return json.result as T
}

/** Check the token against the server (used by the login screen). */
export async function checkAuth(): Promise<boolean> {
  try {
    const res = await fetch(`${serverBase()}/api/rpc/settings:get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ args: ['__auth_check__'] })
    })
    return res.status !== 401
  } catch {
    return true // server down is not an auth problem
  }
}

// ── Push events (SSE) ─────────────────────────────────────────────────────────
type Listener = (payload: unknown) => void
const listeners = new Map<string, Set<Listener>>()
let source: EventSource | null = null

function ensureSource(): void {
  if (source) return
  const t = getToken()
  source = new EventSource(`${serverBase()}/api/events${t ? `?token=${encodeURIComponent(t)}` : ''}`)
  source.onmessage = (ev) => {
    try {
      const { channel, payload } = JSON.parse(ev.data) as { channel: string; payload: unknown }
      listeners.get(channel)?.forEach((fn) => fn(payload))
    } catch {
      // malformed event — ignore
    }
  }
}

export function subscribe(channel: string, fn: Listener): () => void {
  ensureSource()
  let set = listeners.get(channel)
  if (!set) {
    set = new Set()
    listeners.set(channel, set)
  }
  set.add(fn)
  return () => {
    set?.delete(fn)
  }
}

/** Download URL for endpoints that stream files (token goes in the query string). */
export function downloadUrl(pathname: string): string {
  const t = getToken()
  return `${serverBase()}${pathname}${t ? `?token=${encodeURIComponent(t)}` : ''}`
}
