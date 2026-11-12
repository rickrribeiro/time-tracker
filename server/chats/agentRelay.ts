import crypto from 'crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getSetting, setSetting } from '../database/queries'
import { decodeSecret, encodeSecret } from '../services/secrets'
import type { BeeperTransport, TransportRequest, TransportResponse } from './transport'
import { routeAllowed } from './transport'
import { ProviderAuthError, ProviderUnavailableError } from './providers/types'
import type { ProviderEvent } from './providers/types'

/**
 * Relay do agente local (modo "Beeper no Mac, rickOS remoto").
 *
 *   agente (Mac) ──POST /api/chats/agent/poll──▶ rickOS   (long-poll: recebe pedidos)
 *   agente (Mac) ──POST /api/chats/agent/result─▶ rickOS  (devolve respostas)
 *   agente (Mac) ──POST /api/chats/agent/events─▶ rickOS  (eventos do WebSocket do Beeper)
 *
 * Só conexões de SAÍDA a partir do Mac; autenticação = token do rickOS (quando houver)
 * + chave do agente (`chats_agent_key`, criptografada). Pedidos fora de ALLOWED_ROUTES
 * são recusados aqui e no agente.
 */
export const AGENT_KEY = 'chats_agent_key'
const POLL_WAIT_MS = 25_000
const REQUEST_TIMEOUT_MS = 30_000
const ONLINE_GRACE_MS = 45_000

interface Pending {
  id: string
  req: TransportRequest
  resolve: (r: TransportResponse) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
  sent: boolean
}

const queue: Pending[] = []
const inflight = new Map<string, Pending>()
let waiter: ((items: Pending[]) => void) | null = null
let lastSeen = 0
let eventSink: ((e: ProviderEvent) => void) | null = null
let agentInfo: { version: string | null; beeper: string | null } = { version: null, beeper: null }

export function agentOnline(): boolean {
  return Date.now() - lastSeen < ONLINE_GRACE_MS
}
export function agentDetails(): { online: boolean; lastSeen: string | null; version: string | null; beeper: string | null } {
  return { online: agentOnline(), lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null, ...agentInfo }
}
export function setAgentEventSink(fn: ((e: ProviderEvent) => void) | null): void {
  eventSink = fn
}

function flush(): void {
  if (!waiter || !queue.length) return
  const items = queue.splice(0, queue.length)
  const w = waiter
  waiter = null
  for (const p of items) {
    p.sent = true
    inflight.set(p.id, p)
  }
  w(items)
}

export function agentTransport(): BeeperTransport {
  return {
    mode: 'agent',
    wsUrl: () => null,
    authHeader: () => ({}),
    request(req) {
      if (!routeAllowed(req.method, req.path)) return Promise.reject(new Error(`Rota não permitida: ${req.method} ${req.path}`))
      if (!agentOnline()) return Promise.reject(new ProviderUnavailableError('Agente local do Beeper offline (o Mac está ligado e com o agente rodando?).'))
      return new Promise<TransportResponse>((resolve, reject) => {
        const p: Pending = {
          id: crypto.randomUUID(),
          req,
          resolve,
          reject,
          sent: false,
          timer: setTimeout(() => {
            const qi = queue.indexOf(p)
            if (qi >= 0) queue.splice(qi, 1)
            inflight.delete(p.id)
            reject(new ProviderUnavailableError('O agente local não respondeu a tempo.'))
          }, REQUEST_TIMEOUT_MS)
        }
        queue.push(p)
        flush()
      })
    }
  }
}

async function expectedKey(): Promise<string> {
  return decodeSecret(await getSetting(AGENT_KEY)) || ''
}

/** Gera (ou troca) a chave do agente. Devolvida UMA vez para o usuário copiar. */
export async function rotateAgentKey(): Promise<string> {
  const key = `rka_${crypto.randomBytes(24).toString('base64url')}`
  await setSetting(AGENT_KEY, encodeSecret(AGENT_KEY, key))
  return key
}

function keyMatches(given: string, expected: string): boolean {
  if (!given || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

type Auth = (req: FastifyRequest, reply: FastifyReply) => Promise<void>

export function registerChatAgentRoutes(app: FastifyInstance, requireAuth: Auth): void {
  const agentAuth = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply)
    if (reply.sent) return
    const given = String(req.headers['x-rickos-agent-key'] || '')
    if (!keyMatches(given, await expectedKey())) {
      reply.code(401).send({ ok: false, error: 'agent key inválida' })
    }
  }

  app.post<{ Body: { version?: string; beeper?: string } }>('/api/chats/agent/poll', { preHandler: agentAuth }, async (req) => {
    lastSeen = Date.now()
    agentInfo = { version: req.body?.version ?? null, beeper: req.body?.beeper ?? null }
    // um único agente por vez: um poll novo encerra o anterior
    if (waiter) {
      const w = waiter
      waiter = null
      w([])
    }
    const items = await new Promise<Pending[]>((resolve) => {
      waiter = resolve
      flush()
      setTimeout(() => {
        if (waiter === resolve) {
          waiter = null
          resolve([])
        }
      }, POLL_WAIT_MS)
    })
    lastSeen = Date.now()
    return { ok: true, requests: items.map((p) => ({ id: p.id, ...p.req })) }
  })

  app.post<{ Body: { id: string; status: number; json?: unknown; base64?: string; contentType?: string; headers?: Record<string, string>; error?: string } }>(
    '/api/chats/agent/result',
    { preHandler: agentAuth, bodyLimit: 30 * 1024 * 1024 },
    async (req) => {
      lastSeen = Date.now()
      const b = req.body
      const p = inflight.get(b?.id)
      if (!p) return { ok: false }
      inflight.delete(p.id)
      clearTimeout(p.timer)
      if (b.error) {
        p.reject(b.status === 401 ? new ProviderAuthError(b.error) : new ProviderUnavailableError(b.error))
      } else if (b.status === 401 || b.status === 403) {
        p.reject(new ProviderAuthError('Token do Beeper (no agente) inválido.'))
      } else {
        p.resolve({ status: b.status, json: b.json, buffer: b.base64 ? Buffer.from(b.base64, 'base64') : undefined, contentType: b.contentType ?? null, headers: b.headers })
      }
      return { ok: true }
    }
  )

  app.post<{ Body: { events?: ProviderEvent[] } }>('/api/chats/agent/events', { preHandler: agentAuth }, async (req) => {
    lastSeen = Date.now()
    for (const e of req.body?.events ?? []) {
      if (e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string') eventSink?.(e)
    }
    return { ok: true }
  })
}
