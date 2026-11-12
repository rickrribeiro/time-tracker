import { ProviderAuthError, ProviderUnavailableError } from './providers/types'

/**
 * Como o servidor fala com a API do Beeper:
 *  • direct — HTTP do servidor para o endpoint configurado (mesma máquina, ou rede
 *    privada/Tailscale). Endpoint validado contra SSRF (`validateBeeperUrl`).
 *  • agent  — o servidor está noutra máquina (VPS) e o Beeper no Mac: um agente local
 *    abre conexão de SAÍDA autenticada com o rickOS e executa só rotas permitidas.
 *    O token do Beeper fica no Mac; nada da API do Beeper é exposto à internet.
 */
export interface TransportRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  query?: Record<string, string | number | boolean | string[] | undefined | null>
  body?: unknown
  binary?: boolean
}

export interface TransportResponse {
  status: number
  json?: unknown
  buffer?: Buffer
  contentType?: string | null
  headers?: Record<string, string>
}

export interface BeeperTransport {
  readonly mode: 'direct' | 'agent'
  request(req: TransportRequest): Promise<TransportResponse>
  /** URL do WebSocket (só no modo direto; no agente os eventos chegam pelo próprio agente). */
  wsUrl(): string | null
  authHeader(): Record<string, string>
}

/**
 * Rotas que o rickOS usa da API do Beeper. O agente local aplica a MESMA lista: mesmo
 * que o servidor fosse comprometido, o agente não vira um proxy aberto para o Mac.
 */
export const ALLOWED_ROUTES: { method: string; re: RegExp }[] = [
  { method: 'GET', re: /^\/v1\/info$/ },
  { method: 'GET', re: /^\/v1\/accounts$/ },
  { method: 'GET', re: /^\/v1\/chats$/ },
  { method: 'GET', re: /^\/v1\/chats\/[^/]+$/ },
  { method: 'GET', re: /^\/v1\/chats\/[^/]+\/messages$/ },
  { method: 'POST', re: /^\/v1\/chats\/[^/]+\/messages$/ },
  { method: 'PUT', re: /^\/v1\/chats\/[^/]+\/messages\/[^/]+$/ },
  { method: 'DELETE', re: /^\/v1\/chats\/[^/]+\/messages\/[^/]+$/ },
  { method: 'POST', re: /^\/v1\/chats\/[^/]+\/read$/ },
  { method: 'POST', re: /^\/v1\/chats\/[^/]+\/unread$/ },
  { method: 'GET', re: /^\/v1\/messages\/search$/ },
  { method: 'GET', re: /^\/v1\/assets\/serve$/ }
]

export function routeAllowed(method: string, path: string): boolean {
  return ALLOWED_ROUTES.some((r) => r.method === method && r.re.test(path))
}

export function buildQuery(q: TransportRequest['query']): string {
  if (!q) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
    else sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

// ── Validação do endpoint (SSRF) ──────────────────────────────────────────────

function isPrivateIpv4(h: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return false
  const [a, b2] = [Number(m[1]), Number(m[2])]
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b2 >= 16 && b2 <= 31) return true
  if (a === 192 && b2 === 168) return true
  if (a === 100 && b2 >= 64 && b2 <= 127) return true // CGNAT / Tailscale
  return false
}

/**
 * Só aceita http(s) para loopback, rede privada, Tailscale (100.64/10, *.ts.net) ou
 * `.local`. Sem caminho, query, usuário/senha. Impede usar o servidor para alcançar
 * endereços arbitrários (incluindo metadados de nuvem 169.254.x).
 */
export function validateBeeperUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return { ok: false, error: 'URL inválida.' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Use http:// ou https://.' }
  if (u.username || u.password) return { ok: false, error: 'Não inclua usuário/senha na URL.' }
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return { ok: false, error: 'Informe só o endereço base (ex.: http://127.0.0.1:23373).' }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const ok =
    host === 'localhost' ||
    host === '::1' ||
    isPrivateIpv4(host) ||
    host.endsWith('.ts.net') ||
    host.endsWith('.local') ||
    /^f[cd][0-9a-f]{2}:/.test(host) // IPv6 ULA
  if (!ok) return { ok: false, error: 'Por segurança, só endereços locais, de rede privada ou Tailscale são aceitos.' }
  return { ok: true, url: `${u.protocol}//${u.host}` }
}

// ── Transporte direto ─────────────────────────────────────────────────────────

const TIMEOUT_MS = 20_000

export function directTransport(baseUrl: string, token: string): BeeperTransport {
  const v = validateBeeperUrl(baseUrl)
  return {
    mode: 'direct',
    authHeader: (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    wsUrl: () => (v.ok ? `${v.url.replace(/^http/, 'ws')}/v1/ws` : null),
    async request(req) {
      if (!v.ok) throw new ProviderUnavailableError(`Endpoint do Beeper inválido: ${v.error}`)
      if (!token) throw new ProviderAuthError('Token do Beeper não configurado.')
      const url = `${v.url}${req.path}${buildQuery(req.query)}`
      let res: Response
      try {
        res = await fetch(url, {
          method: req.method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: req.binary ? '*/*' : 'application/json',
            ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {})
          },
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS)
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new ProviderUnavailableError(
          /abort|timeout/i.test(msg)
            ? 'O Beeper não respondeu a tempo.'
            : `Beeper Desktop inacessível em ${v.url} (está aberto e com a Desktop API ativa?).`
        )
      }
      return readResponse(res, req.binary)
    }
  }
}

export async function readResponse(res: Response, binary?: boolean): Promise<TransportResponse> {
  if (res.status === 401 || res.status === 403) throw new ProviderAuthError('Token do Beeper inválido ou sem permissão.')
  const contentType = res.headers.get('content-type')
  const headers: Record<string, string> = {}
  const ver = res.headers.get('x-beeper-desktop-version')
  if (ver) headers['x-beeper-desktop-version'] = ver
  if (binary && res.ok) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), contentType, headers }
  const text = await res.text()
  let json: unknown = undefined
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { message: text.slice(0, 300) }
    }
  }
  return { status: res.status, json, contentType, headers }
}
