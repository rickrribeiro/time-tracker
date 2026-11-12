import type { ChatsStatus, ProviderState } from '../../shared/chats'
import { NO_CAPABILITIES } from '../../shared/chats'
import { broadcast } from '../events'
import { getSetting, setSetting } from '../database/queries'
import { notify } from '../services/notifications'
import { agentDetails, agentOnline } from './agentRelay'
import { K, loadConfig } from './config'
import * as repo from './repo'
import { activeProvider, changed, getSummary, invalidateMessages, scanChat } from './service'
import type { ChatProvider, ProviderEvent, RemoteChat } from './providers/types'
import { ProviderAuthError, ProviderUnavailableError } from './providers/types'

/**
 * Sincronização: eventos em tempo real quando disponíveis, polling como fallback.
 *  • incremental: lista conversas da mais recente para a mais antiga e para quando passa
 *    da última sincronização (margem de 10 min); a primeira vez vai até `initialLimit`;
 *  • só relê mensagens das conversas cuja atividade mudou (concorrência limitada);
 *  • lock de execução única, backoff exponencial em erro, reconexão automática;
 *  • nunca marca nada como lido.
 */
const SCAN_CONCURRENCY = 3
const SCAN_MAX_PER_RUN = 250
const MARGIN_MS = 10 * 60_000

const status: ChatsStatus = {
  enabled: false,
  providerId: 'beeper',
  providerLabel: 'Beeper Desktop API',
  demo: false,
  state: 'disabled',
  message: null,
  lastSyncAt: null,
  lastError: null,
  realtime: 'off',
  mode: 'direct',
  agentOnline: false,
  capabilities: NO_CAPABILITIES,
  progress: null
}

let running: Promise<void> | null = null
let rerun = false
let timer: NodeJS.Timeout | null = null
let failures = 0
let authBlocked = false
let unsubscribe: (() => void) | null = null
let realtimeProvider: ChatProvider | null = null
let lastSyncMs = 0
let started = false

export function getStatus(): ChatsStatus {
  status.agentOnline = agentOnline()
  // modo agente: o tempo real depende do WebSocket que o agente mantém com o Beeper
  if (status.mode === 'agent' && status.realtime !== 'off') {
    const a = agentDetails()
    return { ...status, realtime: a.online && a.realtime ? 'on' : 'off', state: status.state === 'connected' && !(a.online && a.realtime) ? 'idle' : status.state }
  }
  return { ...status }
}

function setState(state: ProviderState, message: string | null = null): void {
  status.state = state
  status.message = message
  broadcast('chats:status', getStatus())
}

export function startChatsEngine(): void {
  if (started) return
  started = true
  void reconfigure()
  // lembretes vencidos: checa a cada minuto
  setInterval(() => void checkReminders().catch(() => undefined), 60_000)
  setTimeout(() => void checkReminders().catch(() => undefined), 30_000)
}

/** Reaplica a configuração (chamado ao salvar Configurações → Mensagens). */
export async function reconfigure(): Promise<void> {
  const cfg = await loadConfig()
  stopRealtime()
  if (timer) clearTimeout(timer)
  timer = null
  failures = 0
  authBlocked = false
  const providerChanged = status.providerId !== cfg.providerId
  status.enabled = cfg.enabled
  status.providerId = cfg.providerId
  status.mode = cfg.providerId === 'beeper' ? cfg.beeperMode : cfg.providerId
  if (providerChanged || !lastSyncMs) {
    // após reinício, continua de onde parou (incremental); trocar de provedor recomeça do zero
    const saved = providerChanged && lastSyncMs ? null : await getSetting(K.lastSync)
    lastSyncMs = saved ? Date.parse(saved) || 0 : 0
  }
  status.lastSyncAt = lastSyncMs ? new Date(lastSyncMs).toISOString() : null
  const provider = await activeProvider(cfg)
  status.providerLabel = provider?.label ?? (cfg.providerId === 'mock' ? 'Demonstração' : 'Beeper Desktop API')
  status.demo = !!provider?.demo
  status.capabilities = provider?.capabilities() ?? NO_CAPABILITIES
  if (!cfg.enabled || !provider) {
    setState('disabled')
    return
  }
  if (cfg.providerId === 'beeper' && cfg.beeperMode === 'direct' && !cfg.hasBeeperToken) {
    setState('unconfigured', 'Informe o token da Beeper Desktop API.')
    return
  }
  setState('idle')
  if (cfg.realtime) startRealtime(provider)
  else status.realtime = provider.subscribe ? 'off' : 'unsupported'
  if (cfg.syncAuto) schedule(3000)
}

function schedule(ms: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void loop(), ms)
}

async function loop(): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg.enabled || !cfg.syncAuto || authBlocked) return
  await syncNow().catch(() => undefined)
  const base = cfg.syncIntervalSec * 1000
  // com tempo real ligado o polling vira só uma rede de segurança (mais espaçado)
  const interval = getStatus().realtime === 'on' ? Math.max(base, 10 * 60_000) : base
  const backoff = failures ? Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failures - 1, 5)) : interval
  schedule(failures ? backoff : interval)
}

/** Sincroniza agora (execução única; chamadas concorrentes esperam a corrente). */
export function syncNow(opts: { full?: boolean } = {}): Promise<void> {
  if (running) {
    rerun = true
    return running
  }
  running = doSync(!!opts.full).finally(() => {
    running = null
    if (rerun) {
      rerun = false
      void syncNow()
    }
  })
  return running
}

async function doSync(full: boolean): Promise<void> {
  const cfg = await loadConfig()
  const provider = await activeProvider(cfg)
  if (!cfg.enabled || !provider) {
    setState('disabled')
    return
  }
  setState('syncing')
  status.progress = { done: 0, total: null }
  try {
    const accounts = await provider.listAccounts()
    await repo.upsertAccounts(provider.id, accounts)
    const accRows = await repo.listAccounts(provider.id)
    const enabled = accRows.filter((a) => a.syncEnabled).map((a) => a.remoteId)
    if (!enabled.length) {
      status.progress = null
      await finishOk('Nenhuma conta selecionada para sincronizar.')
      return
    }
    const allEnabled = enabled.length === accRows.length
    const initial = full || !lastSyncMs
    const since = initial ? 0 : lastSyncMs - MARGIN_MS
    const changedIds: number[] = []
    let cursor: string | null = null
    let fetched = 0
    for (;;) {
      const page = await provider.listChats({ accountIds: allEnabled ? undefined : enabled, cursor, limit: 100 })
      const items = page.items.filter((c) => enabled.includes(c.accountId))
      const res = await repo.upsertChats(provider.id, items, cfg.storePreviews)
      changedIds.push(...res.changed)
      fetched += page.items.length
      status.progress = { done: fetched, total: null }
      broadcast('chats:status', getStatus())
      const oldest = page.items[page.items.length - 1]?.lastActivity
      const passed = !initial && oldest && Date.parse(oldest) < since
      if (!page.hasMore || !page.olderCursor || passed || fetched >= cfg.initialLimit) break
      cursor = page.olderCursor
    }
    await scanMany(provider, prioritizeScans(changedIds, await repo.allFullRows()))
    const moved = await repo.reconcile(provider.id)
    await repo.touchContactsFromOutbound()
    if (cfg.retentionDays > 0) await repo.clearCache({ olderThanDays: cfg.retentionDays })
    lastSyncMs = Date.now()
    status.progress = null
    await finishOk(moved ? `${moved} conversa(s) reconciliada(s) com o provedor anterior.` : null)
    changed(changedIds)
    void notifyImportant(changedIds).catch(() => undefined)
  } catch (e) {
    status.progress = null
    await finishErr(e)
    throw e
  }
}

async function finishOk(message: string | null): Promise<void> {
  failures = 0
  status.lastSyncAt = new Date().toISOString()
  status.lastError = null
  await setSetting(K.lastSync, status.lastSyncAt)
  await setSetting(K.lastError, '')
  setState(status.realtime === 'on' ? 'connected' : 'idle', message)
}

async function finishErr(e: unknown): Promise<void> {
  failures++
  const msg = e instanceof Error ? e.message : String(e)
  status.lastError = msg
  await setSetting(K.lastError, `${new Date().toISOString()}|${msg}`)
  if (e instanceof ProviderAuthError) {
    authBlocked = true // não insiste com token inválido: espera nova configuração
    setState('error', msg)
  } else if (e instanceof ProviderUnavailableError) {
    setState('offline', `${msg} Mostrando dados locais (podem estar desatualizados).`)
  } else {
    setState('error', msg)
  }
}

/** Conversas novas/alteradas primeiro: não lidas e recebidas recentes; limita por execução. */
function prioritizeScans(ids: number[], rows: repo.FullChatRow[]): number[] {
  const set = new Set(ids)
  return rows
    .filter((r) => set.has(r.id))
    .sort((a, b) => {
      const pa = (a.unreadCount ?? 0) > 0 || a.lastMessageFromMe === 0 ? 1 : 0
      const pb = (b.unreadCount ?? 0) > 0 || b.lastMessageFromMe === 0 ? 1 : 0
      return pb - pa || (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')
    })
    .slice(0, SCAN_MAX_PER_RUN)
    .map((r) => r.id)
}

async function scanMany(provider: ChatProvider, ids: number[]): Promise<void> {
  const results: { id: number; scan: repo.ScanResult }[] = []
  let i = 0
  const worker = async (): Promise<void> => {
    while (i < ids.length) {
      const id = ids[i++]
      try {
        const scan = await scanChat(provider, id)
        if (scan) results.push({ id, scan })
      } catch (e) {
        if (e instanceof ProviderUnavailableError || e instanceof ProviderAuthError) throw e
        // uma conversa com erro não derruba a sincronização
      }
      if (results.length >= 25) await repo.applyScans(results.splice(0, results.length))
    }
  }
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, ids.length) }, worker))
  await repo.applyScans(results)
}

// ── Tempo real ────────────────────────────────────────────────────────────────

const pendingChats = new Set<string>()
let eventTimer: NodeJS.Timeout | null = null

function startRealtime(provider: ChatProvider): void {
  if (!provider.subscribe) {
    status.realtime = 'unsupported'
    return
  }
  realtimeProvider = provider
  unsubscribe = provider.subscribe(onEvent, (s, err) => {
    const before = status.realtime
    status.realtime = s
    if (s === 'on' && before !== 'on') {
      // reconectou: recupera o que passou enquanto estava offline
      void syncNow().catch(() => undefined)
    }
    if (err && s === 'off' && status.state !== 'error') status.message = err
    broadcast('chats:status', getStatus())
  })
}

function stopRealtime(): void {
  try {
    unsubscribe?.()
  } catch {
    // ignore
  }
  unsubscribe = null
  realtimeProvider = null
  status.realtime = 'off'
}

function onEvent(e: ProviderEvent): void {
  if (e.type === 'chat.deleted') {
    void repo.deleteChatsByRemote(realtimeProvider?.id ?? '', e.chatIds).then(() => changed())
    return
  }
  if (e.type === 'chat.upserted') e.chatIds.forEach((c) => pendingChats.add(c))
  else pendingChats.add(e.chatId)
  if (eventTimer) return
  eventTimer = setTimeout(() => void flushEvents().catch(() => undefined), 1200)
}

async function flushEvents(): Promise<void> {
  eventTimer = null
  const provider = realtimeProvider
  if (!provider) return
  const ids = [...pendingChats]
  pendingChats.clear()
  const cfg = await loadConfig()
  const enabled = new Set((await repo.listAccounts(provider.id)).filter((a) => a.syncEnabled).map((a) => a.remoteId))
  const chats: RemoteChat[] = []
  for (const id of ids.slice(0, 50)) {
    try {
      const c = await provider.getChat(id)
      if (c && enabled.has(c.accountId)) chats.push(c)
    } catch {
      // será pego pela próxima sincronização
    }
  }
  if (ids.length > 50) void syncNow()
  const res = await repo.upsertChats(provider.id, chats, cfg.storePreviews)
  const local = await repo.chatIdsByRemote(provider.id, ids)
  local.forEach((id) => invalidateMessages(id))
  await scanMany(provider, local)
  await repo.touchContactsFromOutbound()
  changed(local)
  void notifyImportant(res.changed).catch(() => undefined)
}

// ── Notificações ──────────────────────────────────────────────────────────────

const notified = new Map<number, string>()

async function notifyImportant(ids: number[]): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg.notifyVipWaiting && !cfg.notifyMentions) return
  for (const id of ids.slice(0, 50)) {
    const s = await getSummary(id)
    if (!s || s.stale) continue
    const stamp = s.lastInboundAt ?? ''
    if (notified.get(id) === stamp) continue
    const vip = s.contactVip || s.contactPriority === 'alta' || s.priority === 'alta'
    if (cfg.notifyVipWaiting && vip && s.replyState === 'needs_reply' && !s.lastMessageFromMe) {
      notified.set(id, stamp)
      await notify({ title: `💬 ${s.contactName ?? s.title} mandou mensagem`, body: 'Pessoa importante esperando resposta.', source: 'mensagens', page: 'chats' })
    } else if (cfg.notifyMentions && s.type === 'group' && (s.unreadMentions ?? 0) > 0 && !s.mentionsReviewed) {
      notified.set(id, stamp)
      await notify({ title: `@ Mencionaram você em ${s.title}`, body: `${s.unreadMentions} menção(ões)${s.mentionsEstimated ? ' (estimativa)' : ''}.`, source: 'mensagens', page: 'chats' })
    }
  }
}

async function checkReminders(): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg.enabled) return
  const now = new Date().toISOString()
  const due = await repo.dueReminders(now)
  if (!due.length) return
  for (const r of due) {
    if (cfg.notifyReminders) {
      await notify({ title: `⏰ Responder: ${r.title}`, body: r.reminderNote || 'Lembrete da Central de Mensagens.', source: 'mensagens', page: 'chats' })
    }
  }
  await repo.patchOrg(
    due.map((d) => d.chatId),
    { reminderNotifiedAt: now }
  )
  changed(due.map((d) => d.chatId))
}

/** Testes: zera o estado do motor. */
export function resetEngineForTests(): void {
  stopRealtime()
  if (timer) clearTimeout(timer)
  timer = null
  lastSyncMs = 0
  failures = 0
  authBlocked = false
  running = null
}
