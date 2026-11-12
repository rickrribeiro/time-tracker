#!/usr/bin/env node
/**
 * Agente local da Central de Mensagens (rickOS ⇄ Beeper Desktop).
 *
 * Use quando o servidor do rickOS roda em outra máquina (VPS) e o Beeper Desktop no seu
 * Mac. O agente:
 *   • conversa com o Beeper SÓ em loopback (127.0.0.1) — a API do Beeper nunca é exposta;
 *   • abre conexões de SAÍDA autenticadas até o rickOS (long-poll HTTP), sem portas abertas;
 *   • executa apenas a lista fixa de rotas usadas pelo rickOS (não é um proxy aberto);
 *   • repassa os eventos em tempo real do WebSocket do Beeper (Node ≥ 22);
 *   • não registra tokens nem conteúdo de mensagens.
 *
 * Variáveis:
 *   RICKOS_URL        URL do rickOS (https://… ; http só para localhost/rede privada)
 *   RICKOS_TOKEN      token do rickOS (RICKOS_TOKEN do servidor), se houver
 *   RICKOS_AGENT_KEY  chave gerada em Configurações → Mensagens → Agente local
 *   BEEPER_TOKEN      token da Beeper Desktop API (Settings → Integrations)
 *   BEEPER_URL        padrão http://127.0.0.1:23373 (precisa ser loopback)
 *
 * Uso: node bin/rickos-chat-agent.mjs   (sem dependências; Node ≥ 18)
 */

const VERSION = '1.1.0'
const env = (k, d = '') => (process.env[k] ?? d).trim()
const RICKOS_URL = env('RICKOS_URL').replace(/\/+$/, '')
const RICKOS_TOKEN = env('RICKOS_TOKEN')
const AGENT_KEY = env('RICKOS_AGENT_KEY')
const BEEPER_TOKEN = env('BEEPER_TOKEN')
const BEEPER_URL = env('BEEPER_URL', 'http://127.0.0.1:23373').replace(/\/+$/, '')
const MAX_BODY = 25 * 1024 * 1024

// Mesma lista de server/chats/transport.ts (ALLOWED_ROUTES).
const ALLOWED = [
  ['GET', /^\/v1\/info$/],
  ['GET', /^\/v1\/accounts$/],
  ['GET', /^\/v1\/chats$/],
  ['GET', /^\/v1\/chats\/[^/]+$/],
  ['GET', /^\/v1\/chats\/[^/]+\/messages$/],
  ['POST', /^\/v1\/chats\/[^/]+\/messages$/],
  ['PUT', /^\/v1\/chats\/[^/]+\/messages\/[^/]+$/],
  ['DELETE', /^\/v1\/chats\/[^/]+\/messages\/[^/]+$/],
  ['POST', /^\/v1\/chats\/[^/]+\/read$/],
  ['POST', /^\/v1\/chats\/[^/]+\/unread$/],
  ['GET', /^\/v1\/messages\/search$/],
  ['GET', /^\/v1\/assets\/serve$/]
]
const allowed = (m, p) => ALLOWED.some(([am, re]) => am === m && re.test(p))

function log(...a) {
  console.log(`[rickos-agent ${new Date().toISOString().slice(11, 19)}]`, ...a)
}
function die(msg) {
  console.error(`[rickos-agent] ${msg}`)
  process.exit(2)
}

function isLocalOrPrivate(host) {
  const h = host.replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '::1' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h) || h.endsWith('.ts.net') || h.endsWith('.local')
}

// ── validação de configuração ──
if (!RICKOS_URL) die('Defina RICKOS_URL (ex.: https://rickos.seudominio.com).')
if (!AGENT_KEY) die('Defina RICKOS_AGENT_KEY (gere em Configurações → Mensagens → Agente local).')
if (!BEEPER_TOKEN) die('Defina BEEPER_TOKEN (Beeper Desktop → Settings → Integrations).')
let rUrl, bUrl
try {
  rUrl = new URL(RICKOS_URL)
  bUrl = new URL(BEEPER_URL)
} catch {
  die('RICKOS_URL ou BEEPER_URL inválida.')
}
if (rUrl.protocol !== 'https:' && !isLocalOrPrivate(rUrl.hostname)) die('Use https:// para o rickOS fora da rede local (os tokens trafegam nessa conexão).')
const bh = bUrl.hostname.replace(/^\[|\]$/g, '')
if (!(bh === 'localhost' || bh === '::1' || /^127\./.test(bh))) die('BEEPER_URL precisa ser loopback (127.0.0.1/localhost): o agente roda na mesma máquina do Beeper.')

const rickHeaders = { 'Content-Type': 'application/json', 'X-RickOS-Agent-Key': AGENT_KEY, ...(RICKOS_TOKEN ? { Authorization: `Bearer ${RICKOS_TOKEN}` } : {}) }
let beeperVersion = null
let stopping = false
let wsOn = false

async function rick(path, body, timeoutMs = 40_000) {
  const res = await fetch(`${RICKOS_URL}${path}`, { method: 'POST', headers: rickHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  if (res.status === 401) throw Object.assign(new Error('rickOS recusou as credenciais (token/chave do agente).'), { fatal: true })
  if (!res.ok) throw new Error(`rickOS respondeu ${res.status}`)
  return res.json()
}

function buildQuery(q) {
  if (!q) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)))
    else sp.append(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function execute(req) {
  if (!allowed(req.method, req.path)) return { id: req.id, status: 403, error: `Rota não permitida no agente: ${req.method} ${req.path}` }
  try {
    const res = await fetch(`${BEEPER_URL}${req.path}${buildQuery(req.query)}`, {
      method: req.method,
      headers: { Authorization: `Bearer ${BEEPER_TOKEN}`, Accept: req.binary ? '*/*' : 'application/json', ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(20_000)
    })
    const ver = res.headers.get('x-beeper-desktop-version')
    if (ver) beeperVersion = ver
    const headers = ver ? { 'x-beeper-desktop-version': ver } : {}
    const contentType = res.headers.get('content-type')
    if (req.binary && res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > MAX_BODY) return { id: req.id, status: 413, error: 'Anexo grande demais para o agente.' }
      return { id: req.id, status: res.status, base64: buf.toString('base64'), contentType, headers }
    }
    const text = await res.text()
    let json
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      json = { message: text.slice(0, 300) }
    }
    return { id: req.id, status: res.status, json, contentType, headers }
  } catch (e) {
    return { id: req.id, status: 503, error: `Beeper Desktop inacessível em ${BEEPER_URL} (aberto e com a Desktop API ativa?).` }
  }
}

async function pollLoop() {
  let fails = 0
  while (!stopping) {
    try {
      const r = await rick('/api/chats/agent/poll', { version: VERSION, beeper: beeperVersion, realtime: wsOn })
      if (fails) log('reconectado ao rickOS')
      fails = 0
      for (const req of r.requests ?? []) {
        void execute(req).then((out) => rick('/api/chats/agent/result', out).catch((e) => log('falha ao devolver resultado:', e.message)))
      }
    } catch (e) {
      if (e.fatal) die(e.message)
      fails++
      const wait = Math.min(60_000, 1000 * 2 ** Math.min(fails, 6))
      if (fails === 1 || fails % 10 === 0) log(`rickOS indisponível (${e.message}); tentando de novo em ${Math.round(wait / 1000)}s`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
}

// ── tempo real: WebSocket do Beeper → eventos para o rickOS ──
function realtime() {
  const WS = globalThis.WebSocket
  if (typeof WS !== 'function') {
    log('WebSocket indisponível neste Node (use Node ≥ 22 para tempo real); o rickOS usará polling.')
    return
  }
  let attempt = 0
  let queue = []
  let timer = null
  const flush = () => {
    timer = null
    const events = queue.splice(0, queue.length)
    if (events.length) rick('/api/chats/agent/events', { events }).catch(() => undefined)
  }
  const push = (e) => {
    queue.push(e)
    if (queue.length > 200) queue = queue.slice(-200)
    if (!timer) timer = setTimeout(flush, 800)
  }
  const connect = () => {
    if (stopping) return
    const ws = new WS(`${BEEPER_URL.replace(/^http/, 'ws')}/v1/ws`, { headers: { Authorization: `Bearer ${BEEPER_TOKEN}` } })
    ws.onopen = () => {
      attempt = 0
      wsOn = true
      ws.send(JSON.stringify({ type: 'subscriptions.set', requestID: 'rickos-agent', chatIDs: ['*'] }))
      log('tempo real conectado ao Beeper')
    }
    ws.onmessage = (ev) => {
      let m
      try {
        m = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (m.type === 'chat.upserted' || m.type === 'chat.deleted') push({ type: m.type, chatIds: m.ids ?? (m.chatID ? [m.chatID] : []) })
      else if ((m.type === 'message.upserted' || m.type === 'message.deleted') && m.chatID) push({ type: m.type, chatId: m.chatID, messageIds: m.ids ?? [] })
    }
    ws.onerror = () => undefined
    ws.onclose = () => {
      wsOn = false
      if (stopping) return
      attempt++
      const wait = Math.min(300_000, 2000 * 2 ** Math.min(attempt, 8))
      if (attempt === 1) log('tempo real desconectado; reconectando…')
      setTimeout(connect, wait)
    }
  }
  connect()
}

process.on('SIGINT', () => {
  stopping = true
  log('encerrando')
  process.exit(0)
})
process.on('SIGTERM', () => process.exit(0))

log(`agente ${VERSION}: rickOS ${rUrl.origin} ⇄ Beeper ${BEEPER_URL}`)
realtime()
void pollLoop()
