import http from 'http'
import crypto from 'crypto'
import { shell } from 'electron'
import { getSetting, setSetting, replaceGoogleEvents } from '../database/queries'
import { decodeSecret, encodeSecret } from './secrets'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

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
 * OAuth 2.0 "installed app" flow with a loopback redirect + PKCE.
 * Opens the system browser, catches the redirect on a temporary local server,
 * exchanges the code for tokens and stores the refresh token (encrypted).
 */
export async function connectGoogle(): Promise<boolean> {
  const { clientId, clientSecret } = await creds()
  const verifier = base64url(crypto.randomBytes(32))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  const state = base64url(crypto.randomBytes(16))

  return new Promise<boolean>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '', `http://127.0.0.1`)
        if (!url.searchParams.get('code') && !url.searchParams.get('error')) {
          res.end('OK')
          return
        }
        const respond = (msg: string): void => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<html><body style="font-family:sans-serif;background:#0f172a;color:#f1f5f9;padding:40px"><h2>${msg}</h2><p>Pode fechar esta aba e voltar ao RickOS.</p></body></html>`)
        }
        const err = url.searchParams.get('error')
        if (err) {
          respond('Autorização cancelada.')
          cleanup()
          reject(new Error(`Google negou: ${err}`))
          return
        }
        if (url.searchParams.get('state') !== state) {
          respond('Falha de segurança (state).')
          cleanup()
          reject(new Error('state inválido no callback do Google.'))
          return
        }
        const code = url.searchParams.get('code') as string
        const redirectUri = `http://127.0.0.1:${port}`
        const body = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier
        })
        const tokenRes = await fetch(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        })
        const json = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; error?: string }
        if (!tokenRes.ok || !json.refresh_token) {
          respond('Falha ao trocar o código.')
          cleanup()
          reject(new Error(json.error || 'Sem refresh_token (revogue o acesso e tente de novo).'))
          return
        }
        // identify the account by its primary calendar id (= the account email)
        let email = 'conta google'
        if (json.access_token) {
          const resolved = await fetchPrimaryEmail(json.access_token)
          if (resolved) email = resolved
        }
        await addAccount(email, json.refresh_token)
        respond(`✅ Conectado: ${email}`)
        cleanup()
        resolve(true)
      } catch (e) {
        cleanup()
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })

    let port = 0
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Tempo esgotado aguardando a autorização do Google.'))
    }, 180_000)

    function cleanup(): void {
      clearTimeout(timer)
      server.close()
    }

    server.listen(0, '127.0.0.1', () => {
      port = (server.address() as { port: number }).port
      const redirectUri = `http://127.0.0.1:${port}`
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
      shell.openExternal(authUrl)
    })
  })
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
