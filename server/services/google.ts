import http from 'http'
import crypto from 'crypto'
import fs from 'fs'
import { getSetting, setSetting, replaceGoogleEvents } from '../database/queries'
import { decodeSecret, encodeSecret } from './secrets'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
// calendar (read) + drive.file (upload app-created backups only)
const SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function creds(): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = (await getSetting('google_client_id')) ?? ''
  const clientSecret = decodeSecret(await getSetting('google_client_secret')) ?? ''
  if (!clientId || !clientSecret) {
    throw new Error('Configure o Client ID e o Client Secret do Google em Configurações.')
  }
  return { clientId, clientSecret }
}

// ── Multi-account storage ─────────────────────────────────────────────────────
// Accounts are stored as an (encrypted) JSON list; the OAuth app (client id/secret)
// is shared. A legacy single `google_refresh_token` is folded in transparently.
interface GoogleAccount {
  email: string
  refreshToken: string
}

async function getAccounts(): Promise<GoogleAccount[]> {
  const raw = decodeSecret(await getSetting('google_accounts'))
  let list: GoogleAccount[] = []
  if (raw) {
    try {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) list = v.filter((a) => a && a.refreshToken)
    } catch {
      // corrupt → treat as empty
    }
  }
  const legacy = decodeSecret(await getSetting('google_refresh_token'))
  if (legacy && !list.some((a) => a.refreshToken === legacy)) {
    list = [{ email: 'Conta principal', refreshToken: legacy }, ...list]
  }
  return list
}

async function saveAccounts(list: GoogleAccount[]): Promise<void> {
  await setSetting('google_accounts', encodeSecret('google_accounts', JSON.stringify(list)))
  await setSetting('google_refresh_token', '') // legacy token now lives in the list
}

async function addAccount(email: string, refreshToken: string): Promise<void> {
  const list = (await getAccounts()).filter((a) => a.email !== email) // replace on re-connect
  list.push({ email, refreshToken })
  await saveAccounts(list)
}

/** Emails of the connected Google accounts (for the settings UI). */
export async function listGoogleAccounts(): Promise<string[]> {
  return (await getAccounts()).map((a) => a.email)
}

/**
 * Upload a local file to Google Drive (multipart) using a connected account.
 * Requires the drive.file scope — accounts connected before it was added must
 * reconnect. Returns the created file's name + shareable link.
 */
export async function uploadFileToDrive(
  filePath: string,
  fileName: string,
  email?: string
): Promise<{ name: string; link: string | null; account: string }> {
  const accounts = await getAccounts()
  if (!accounts.length) throw new Error('Nenhuma conta Google conectada.')
  const acc = (email && accounts.find((a) => a.email === email)) || accounts[0]
  const token = await accessTokenFor(acc.refreshToken)

  const bytes = fs.readFileSync(filePath)
  const boundary = 'rickos_' + crypto.randomBytes(8).toString('hex')
  const meta = JSON.stringify({ name: fileName, mimeType: 'application/x-sqlite3' })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    }
  )
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    if (res.status === 403 || /insufficient|scope/i.test(t)) {
      throw new Error('Sem permissão de Drive nesta conta. Reconecte-a em Configurações (escopo drive.file).')
    }
    throw new Error(`Upload ao Drive falhou (${res.status}). ${t.slice(0, 120)}`)
  }
  const j = (await res.json()) as { name?: string; webViewLink?: string }
  return { name: j.name || fileName, link: j.webViewLink ?? null, account: acc.email }
}

// ── OAuth 2.0 (PKCE) ──────────────────────────────────────────────────────────
// Two redirect modes:
//  - loopback (default): a temporary server on 127.0.0.1:<random> catches the redirect.
//    Works with a "Desktop app" OAuth client while the browser runs on the same machine.
//  - public callback: when RICKOS_PUBLIC_URL is set, Google redirects to
//    <PUBLIC_URL>/api/google/callback (register it in a "Web application" OAuth client).
// The client opens the returned URL itself (window.open / openExternal) and then
// waits on awaitGoogleConnect().

interface PendingAuth {
  state: string
  verifier: string
  redirectUri: string
  promise: Promise<boolean>
  resolve: (v: boolean) => void
  reject: (e: Error) => void
  cleanup: () => void
}
let pending: PendingAuth | null = null

function resultPage(msg: string): string {
  return `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:system-ui,sans-serif;background:#18181b;color:#f4f4f5;padding:40px"><h2>${msg}</h2><p>Pode fechar esta aba e voltar ao RickOS.</p></body></html>`
}

/** Handle the OAuth redirect (loopback or public route). Returns the HTML to show. */
export async function finishGoogleConnect(params: URLSearchParams): Promise<string> {
  const p = pending
  if (!p) return resultPage('Nenhuma conexão pendente. Comece de novo pelo RickOS.')
  const done = (ok: boolean, err?: Error): void => {
    p.cleanup()
    if (pending === p) pending = null
    if (err) p.reject(err)
    else p.resolve(ok)
  }
  const err = params.get('error')
  if (err) {
    done(false, new Error(`Google negou: ${err}`))
    return resultPage('Autorização cancelada.')
  }
  if (params.get('state') !== p.state) {
    done(false, new Error('state inválido no callback do Google.'))
    return resultPage('Falha de segurança (state).')
  }
  try {
    const { clientId, clientSecret } = await creds()
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: params.get('code') || '',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: p.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: p.verifier
      })
    })
    const json = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; error?: string }
    if (!tokenRes.ok || !json.refresh_token) {
      done(false, new Error(json.error || 'Sem refresh_token (revogue o acesso e tente de novo).'))
      return resultPage('Falha ao trocar o código.')
    }
    // identify the account by its primary calendar id (= the account email)
    let email = 'conta google'
    if (json.access_token) {
      const resolved = await fetchPrimaryEmail(json.access_token)
      if (resolved) email = resolved
    }
    await addAccount(email, json.refresh_token)
    done(true)
    return resultPage(`✅ Conectado: ${email}`)
  } catch (e) {
    done(false, e instanceof Error ? e : new Error(String(e)))
    return resultPage('Erro ao conectar.')
  }
}

/** Start the OAuth flow and return the URL the client must open. */
export async function beginGoogleConnect(publicUrl: string): Promise<{ authUrl: string }> {
  const { clientId } = await creds()
  if (pending) {
    pending.cleanup()
    pending.reject(new Error('Substituída por uma nova tentativa de conexão.'))
    pending = null
  }
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64url(crypto.randomBytes(16))

  let redirectUri: string
  let closeServer = (): void => {}
  if (publicUrl) {
    redirectUri = `${publicUrl}/api/google/callback`
  } else {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '', 'http://127.0.0.1')
      if (!url.searchParams.get('code') && !url.searchParams.get('error')) {
        res.end('OK')
        return
      }
      const html = await finishGoogleConnect(url.searchParams)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    redirectUri = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    closeServer = () => server.close()
  }

  let resolve!: (v: boolean) => void
  let reject!: (e: Error) => void
  const promise = new Promise<boolean>((res, rej) => {
    resolve = res
    reject = rej
  })
  promise.catch(() => {}) // avoid unhandled rejection if nobody awaits
  const timer = setTimeout(() => {
    if (pending?.state === state) {
      pending.cleanup()
      pending = null
      reject(new Error('Tempo esgotado aguardando a autorização do Google.'))
    }
  }, 300_000)
  pending = {
    state,
    verifier,
    redirectUri,
    promise,
    resolve,
    reject,
    cleanup: () => {
      clearTimeout(timer)
      closeServer()
    }
  }

  const authUrl =
    `${AUTH_ENDPOINT}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    }).toString()
  return { authUrl }
}

/** Wait for the pending OAuth flow to finish (true = account connected). */
export async function awaitGoogleConnect(): Promise<boolean> {
  if (!pending) return false
  return pending.promise
}

/** Whether at least one Google account is connected. */
export async function googleConnected(): Promise<boolean> {
  return (await getAccounts()).length > 0
}

/** Disconnect all accounts. */
export async function disconnectGoogle(): Promise<void> {
  await setSetting('google_accounts', '')
  await setSetting('google_refresh_token', '')
}

/** Disconnect a single account by email. */
export async function disconnectGoogleAccount(email: string): Promise<void> {
  const list = (await getAccounts()).filter((a) => a.email !== email)
  await saveAccounts(list)
}

async function accessTokenFor(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = await creds()
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  const json = (await res.json()) as { access_token?: string; error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error || 'Falha ao renovar o token do Google.')
  return json.access_token
}

/** The primary calendar id equals the account's email. */
async function fetchPrimaryEmail(token: string): Promise<string | null> {
  try {
    const r = await fetch(`${CALENDAR_API}/calendars/primary`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return null
    const j = (await r.json()) as { id?: string }
    return j.id ?? null
  } catch {
    return null
  }
}

interface GCalEvent {
  summary?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}
interface EventRow {
  title: string
  startTime: string
  endTime: string | null
  location: string | null
}

async function fetchEventsFor(token: string, timeMin: Date, timeMax: Date): Promise<EventRow[]> {
  const url =
    `${CALENDAR_API}/calendars/primary/events?` +
    new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50'
    }).toString()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Calendar falhou (${res.status}). ${body.slice(0, 120)}`)
  }
  const data = (await res.json()) as { items?: GCalEvent[] }
  return (data.items ?? [])
    .map((e) => ({
      title: e.summary || '(sem título)',
      startTime: e.start?.dateTime || (e.start?.date ? `${e.start.date}T00:00:00.000Z` : null),
      endTime: e.end?.dateTime || (e.end?.date ? `${e.end.date}T00:00:00.000Z` : null),
      location: e.location || null
    }))
    .filter((e): e is EventRow => !!e.startTime)
}

/**
 * Pull the next 7 days from every connected account's primary calendar and
 * aggregate them into calendar_events (source='google'). Best-effort per account:
 * a failing account is skipped; if all fail, the last error is thrown.
 */
export async function syncGoogleCalendar(): Promise<number> {
  const accounts = await getAccounts()
  if (!accounts.length) throw new Error('Google não conectado. Clique em Conectar em Configurações.')

  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400000)
  const all: EventRow[] = []
  let okCount = 0
  let emailsChanged = false
  let lastErr: Error | null = null

  for (const acc of accounts) {
    try {
      const token = await accessTokenFor(acc.refreshToken)
      // migrate/label: resolve the real email if we only have a placeholder
      if (!acc.email.includes('@')) {
        const email = await fetchPrimaryEmail(token)
        if (email) {
          acc.email = email
          emailsChanged = true
        }
      }
      all.push(...(await fetchEventsFor(token, now, in7)))
      okCount++
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }

  if (emailsChanged) await saveAccounts(accounts)
  if (okCount === 0 && lastErr) throw lastErr
  await replaceGoogleEvents(all)
  return all.length
}
