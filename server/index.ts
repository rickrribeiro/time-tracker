import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fastifyStatic from '@fastify/static'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getConfig, setConfig, isLocalHost, ServerConfig } from './config'
import { getDb, saveDb, closeDb, dbFilePath, snapshotDailyIfNeeded } from './database/db'
import { assistedBusy, stopAssisted } from './flights/assisted'
import { callRpc, handlers, startScheduler } from './rpc'
import { subscribe } from './events'
import { finishGoogleConnect } from './services/google'
import { registerChatAgentRoutes } from './chats/agentRelay'
import { fetchAsset } from './chats/service'

export interface StartedServer {
  app: FastifyInstance
  url: string
  close: () => Promise<void>
}

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/**
 * Start the rickOS HTTP server: the single owner of the database.
 *  POST /api/rpc/:channel   { args: [...] } → { ok, result } | { ok:false, error }
 *  GET  /api/events         SSE stream of push events
 *  GET  /api/export/db      download the SQLite file
 *  GET  /api/google/callback OAuth redirect (public-URL mode)
 *  GET  /api/health
 *  /*                       the built web front (when staticDir exists)
 */
export async function startServer(overrides: Partial<ServerConfig> = {}): Promise<StartedServer> {
  setConfig(overrides)
  const cfg = getConfig()
  if (!isLocalHost(cfg.host) && !cfg.token) {
    throw new Error(`RICKOS_TOKEN é obrigatório quando o servidor escuta em ${cfg.host} (fora do localhost).`)
  }

  await getDb()
  snapshotDailyIfNeeded()

  const app = Fastify({ bodyLimit: 200 * 1024 * 1024 })

  // CORS: the Electron renderer (dev server on another port / file://) and the web
  // dev server call the API cross-origin. Auth is the bearer token, not cookies.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', req.headers.origin || '*')
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    reply.header('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      reply.code(204).send()
      return reply
    }
  })

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!cfg.token) return
    const header = req.headers.authorization || ''
    const query = (req.query as Record<string, string> | undefined)?.token || ''
    const given = header.startsWith('Bearer ') ? header.slice(7) : query
    if (!given || !tokenMatches(given, cfg.token)) {
      reply.code(401).send({ ok: false, error: 'unauthorized' })
    }
  }

  app.get('/api/health', async () => ({ ok: true, auth: !!cfg.token, channels: handlers.size, busy: !!assistedBusy() }))

  app.post<{ Params: { channel: string }; Body: { args?: unknown[]; undef?: number[] } }>(
    '/api/rpc/:channel',
    { preHandler: requireAuth },
    async (req, reply) => {
      const args = Array.isArray(req.body?.args) ? [...req.body.args] : []
      // restore `undefined` args (JSON turns them into null) — see src/api/transport.ts
      for (const i of req.body?.undef ?? []) if (Number.isInteger(i) && i >= 0 && i < 64) args[i] = undefined
      try {
        const result = await callRpc(req.params.channel, args)
        return { ok: true, result: result === undefined ? null : result }
      } catch (e) {
        reply.code(handlers.has(req.params.channel) ? 500 : 404)
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  app.get('/api/events', { preHandler: requireAuth }, (req, reply) => {
    reply.hijack()
    const res = reply.raw
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': req.headers.origin || '*'
    })
    res.write('retry: 3000\n\n')
    const off = subscribe((channel, payload) => {
      res.write(`event: message\ndata: ${JSON.stringify({ channel, payload })}\n\n`)
    })
    const ping = setInterval(() => res.write(': ping\n\n'), 25000)
    req.raw.on('close', () => {
      clearInterval(ping)
      off()
    })
  })

  // Central de Mensagens: agente local do Beeper (conexão de saída do Mac) e anexos.
  registerChatAgentRoutes(app, requireAuth)
  app.get<{ Querystring: { t?: string } }>('/api/chats/asset', { preHandler: requireAuth }, async (req, reply) => {
    try {
      const a = await fetchAsset(String(req.query.t || ''))
      reply.header('Content-Type', a.contentType)
      reply.header('Cache-Control', 'private, max-age=3600')
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'")
      return reply.send(a.body)
    } catch (e) {
      return reply.code(404).send({ ok: false, error: e instanceof Error ? e.message : 'anexo indisponível' })
    }
  })

  app.get('/api/export/db', { preHandler: requireAuth }, async (_req, reply) => {
    await getDb()
    saveDb()
    const now = new Date()
    const pad = (n: number): string => String(n).padStart(2, '0')
    const name = `timetracker_snapshot_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.sqlite`
    reply.header('Content-Type', 'application/x-sqlite3')
    reply.header('Content-Disposition', `attachment; filename="${name}"`)
    return reply.send(fs.readFileSync(dbFilePath()))
  })

  app.get('/api/google/callback', async (req, reply) => {
    const params = new URLSearchParams(req.query as Record<string, string>)
    reply.header('Content-Type', 'text/html; charset=utf-8')
    return finishGoogleConnect(params)
  })

  const staticDir = path.resolve(cfg.staticDir || path.join(process.cwd(), 'dist'))
  if (fs.existsSync(path.join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: staticDir, prefix: '/' })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ ok: false, error: 'not found' })
      return reply.sendFile('index.html')
    })
  }

  startScheduler()

  await app.listen({ port: cfg.port, host: cfg.host })
  const url = `http://${cfg.host === '0.0.0.0' ? '127.0.0.1' : cfg.host}:${cfg.port}`
  return {
    app,
    url,
    close: async () => {
      // A conexão SSE do navegador nunca termina sozinha: sem fechá-la, o app.close() espera
      // para sempre e o processo fica vivo SEM a porta, gravando no mesmo banco que o próximo
      // servidor (dois escritores do sql.js = um apaga o que o outro gravou).
      stopAssisted()
      const closing = app.close()
      app.server.closeAllConnections?.()
      await Promise.race([closing, new Promise((r) => setTimeout(r, 3000))])
      closeDb()
    }
  }
}
