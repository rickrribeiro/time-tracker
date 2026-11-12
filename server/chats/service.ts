import crypto from 'crypto'
import type {
  ChatCounts,
  ChatFilter,
  ChatLabel,
  ChatListPage,
  ChatMessage,
  ChatPriority,
  ChatSummary,
  ContactChatLink,
  ContactSuggestion,
  MessagePage,
  RadarItem,
  RadarView
} from '../../shared/chats'
import { networkInfo, NO_CAPABILITIES } from '../../shared/chats'
import { broadcast } from '../events'
import { computeReplyState, messageFlags, priorityScore, suggestedPriority, textMentions } from './classify'
import type { ServerChatsConfig } from './config'
import { loadConfig } from './config'
import * as repo from './repo'
import type { FullChatRow, ScanResult } from './repo'
import { agentOnline, agentTransport, setAgentEventSink } from './agentRelay'
import { createBeeperProvider } from './providers/beeper'
import { createMockProvider } from './providers/mock'
import type { ChatProvider, RemoteMessage } from './providers/types'
import { ProviderUnavailableError } from './providers/types'
import { directTransport } from './transport'

// ── Provedor ativo ────────────────────────────────────────────────────────────

let cached: { sig: string; provider: ChatProvider } | null = null
let override: ChatProvider | null = null

/** Testes: injeta um provedor (ex.: mock controlável). */
export function setProviderOverride(p: ChatProvider | null): void {
  override = p
  cached = null
}

export async function activeProvider(cfg?: ServerChatsConfig): Promise<ChatProvider | null> {
  if (override) return override
  const c = cfg ?? (await loadConfig())
  if (!c.enabled) return null
  const sig = [c.providerId, c.beeperMode, c.beeperUrl, c.beeperToken ? crypto.createHash('sha256').update(c.beeperToken).digest('hex').slice(0, 12) : ''].join('|')
  if (cached?.sig === sig) return cached.provider
  let provider: ChatProvider
  if (c.providerId === 'mock') provider = createMockProvider()
  else if (c.beeperMode === 'agent') provider = createBeeperProvider(agentTransport(), { onAgentEvents: setAgentEventSink })
  else provider = createBeeperProvider(directTransport(c.beeperUrl, c.beeperToken))
  cached = { sig, provider }
  return provider
}

export function providerOnlineHint(cfg: ServerChatsConfig): boolean {
  return cfg.providerId !== 'beeper' || cfg.beeperMode !== 'agent' || agentOnline()
}

// ── Resumo de conversa ────────────────────────────────────────────────────────

export interface SummaryCtx {
  now: number
  cfg: ServerChatsConfig
  activeProviderId: string
  chatLabels: Map<number, ChatLabel[]>
  contactLabels: Map<number, ChatLabel[]>
  professional: Set<string>
}

export async function summaryCtx(cfg?: ServerChatsConfig): Promise<SummaryCtx> {
  const c = cfg ?? (await loadConfig())
  const p = await activeProvider(c)
  return {
    now: Date.now(),
    cfg: c,
    activeProviderId: p?.id ?? c.providerId,
    chatLabels: await repo.labelMap('chat'),
    contactLabels: await repo.labelMap('contact'),
    professional: new Set(c.professionalLabels.map((x) => x.toLowerCase()))
  }
}

export function summarize(r: FullChatRow, ctx: SummaryCtx): ChatSummary {
  const labels = ctx.chatLabels.get(r.id) ?? []
  const personLabels = r.contactId ? ctx.contactLabels.get(r.contactId) ?? [] : []
  const reviewed = r.mentionsReviewedCount != null && (r.unreadMentions ?? 0) <= r.mentionsReviewedCount
  const pendingMentions = reviewed ? 0 : r.unreadMentions ?? 0
  const reply = computeReplyState({
    type: r.type,
    isMuted: !!r.isMuted,
    lastMessageFromMe: r.lastMessageFromMe == null ? null : !!r.lastMessageFromMe,
    lastInboundAt: r.lastInboundAt,
    lastOutboundAt: r.lastOutboundAt,
    lastInboundClosing: !!r.lastInboundClosing,
    lastInboundQuestion: !!r.lastInboundQuestion,
    lastOutboundQuestion: !!r.lastOutboundQuestion,
    lastInboundRepliesToMe: !!r.lastInboundRepliesToMe,
    pendingMentions,
    manualState: r.manualState,
    manualAt: r.manualAt,
    snoozeUntil: r.snoozeUntil,
    snoozedAt: r.snoozedAt,
    reopenOnMessage: r.reopenOnMessage == null ? true : !!r.reopenOnMessage,
    now: ctx.now
  })
  const reminderDue = !!r.snoozeUntil && Date.parse(r.snoozeUntil) <= ctx.now
  const professional = [...labels, ...personLabels].some((l) => ctx.professional.has(l.name.toLowerCase()))
  const contactPriority = (r.contactPriority as ChatPriority | null) ?? null
  const pendingSince = reply.state === 'needs_reply' ? r.pendingSince ?? r.lastInboundAt : null
  const score = priorityScore(
    {
      replyState: reply.state,
      type: r.type,
      participantCount: r.participantCount,
      isMuted: !!r.isMuted,
      pendingMentions,
      manualPriority: r.priority,
      contactPriority: r.contactId ? contactPriority : null,
      contactVip: !!r.contactVip,
      professional,
      question: !!r.lastInboundQuestion,
      pendingSince,
      lastActivity: r.lastActivity,
      unreadCount: r.unreadCount,
      reminderDue,
      now: ctx.now
    },
    ctx.cfg.priorityWeights
  )
  return {
    id: r.id,
    key: r.key,
    providerId: r.providerId,
    accountKey: r.accountKey,
    remoteId: r.remoteId,
    network: r.network,
    title: r.title,
    type: r.type,
    imgUrl: r.imgUrl,
    participantCount: r.participantCount,
    unreadCount: r.unreadCount,
    unreadMentions: r.unreadMentions,
    mentionsEstimated: !!r.mentionsEstimated,
    mentionsReviewed: reviewed && (r.unreadMentions ?? 0) > 0,
    lastActivity: r.lastActivity,
    lastMessagePreview: r.lastMessagePreview,
    lastMessageFromMe: r.lastMessageFromMe == null ? null : !!r.lastMessageFromMe,
    lastMessageSender: r.lastMessageSender,
    lastInboundAt: r.lastInboundAt,
    lastOutboundAt: r.lastOutboundAt,
    pendingSince,
    isMuted: !!r.isMuted,
    isArchivedRemote: !!r.isArchived,
    peerHandle: r.peerHandle,
    stale: r.providerId !== ctx.activeProviderId || r.accountSync === 0,
    contactId: r.contactId,
    contactName: r.contactName,
    contactPriority: r.contactId ? contactPriority : null,
    contactVip: !!r.contactVip,
    priority: r.priority,
    replyState: reply.state,
    replyStateSource: reply.source,
    replyReason: reply.reason,
    snoozeUntil: r.snoozeUntil,
    reminderNote: r.reminderNote,
    reminderDue,
    reopened: reply.reopened,
    notes: r.notes,
    labels,
    score,
    suggestedPriority: suggestedPriority(score),
    todoCount: r.todoCount ?? 0
  }
}

const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Visíveis: provedor ativo + contas sincronizadas; de outros provedores só se tiverem organização. */
function visible(s: ChatSummary, r: FullChatRow, ctx: SummaryCtx): boolean {
  if (r.providerId === ctx.activeProviderId && r.accountSync !== 0) return true
  return !!(r.contactId || r.priority || r.manualState || r.snoozeUntil || r.notes || s.labels.length)
}

export function matches(s: ChatSummary, f: ChatFilter, ctx: SummaryCtx): boolean {
  if (f.networks?.length && !f.networks.includes(s.network)) return false
  if (f.accountKeys?.length && !f.accountKeys.includes(s.accountKey)) return false
  if (!f.includeArchived && s.isArchivedRemote && s.replyState !== 'needs_reply') return false
  if (f.type && f.type !== 'all' && s.type !== f.type) return false
  const act = s.lastActivity ? Date.parse(s.lastActivity) : 0
  if (f.withinHours && (!act || ctx.now - act > f.withinHours * 3600_000)) return false
  if (f.from && (!s.lastActivity || s.lastActivity < f.from)) return false
  if (f.to && (!s.lastActivity || s.lastActivity > f.to)) return false
  if (f.pendingOlderThanDays) {
    const p = s.pendingSince ? Date.parse(s.pendingSince) : 0
    if (s.replyState !== 'needs_reply' || !p || ctx.now - p < f.pendingOlderThanDays * 86400_000) return false
  }
  if (f.person === 'linked' && !s.contactId) return false
  if (f.person === 'unlinked' && s.contactId) return false
  if (f.contactId && s.contactId !== f.contactId) return false
  if (f.labelIds?.length && !s.labels.some((l) => f.labelIds!.includes(l.id))) return false
  if (f.personLabelIds?.length) {
    const pl = s.contactId ? ctx.contactLabels.get(s.contactId) ?? [] : []
    if (!pl.some((l) => f.personLabelIds!.includes(l.id))) return false
  }
  switch (f.state ?? 'all') {
    case 'unread':
      if (!(s.unreadCount && s.unreadCount > 0)) return false
      break
    case 'needs_reply':
      if (s.replyState !== 'needs_reply') return false
      break
    case 'waiting':
      if (s.replyState !== 'waiting') return false
      break
    case 'mentions':
      if (!((s.unreadMentions ?? 0) > 0 && !s.mentionsReviewed)) return false
      break
    case 'reminders':
      if (!s.snoozeUntil) return false
      break
    case 'high':
      if (!(s.priority === 'alta' || s.contactVip || s.contactPriority === 'alta' || (!s.priority && s.suggestedPriority === 'alta'))) return false
      break
    case 'snoozed':
      if (s.replyState !== 'snoozed') return false
      break
    case 'resolved':
      if (s.replyState !== 'resolved') return false
      break
    case 'none':
      if (s.replyState !== 'none') return false
      break
  }
  const q = norm(f.search).trim()
  if (q) {
    const hay = norm([s.title, s.contactName, s.lastMessagePreview, s.peerHandle, s.notes, ...s.labels.map((l) => l.name)].join(' '))
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false
  }
  return true
}

function sortList(list: ChatSummary[], sort: ChatFilter['sort']): void {
  const t = (s: string | null): number => (s ? Date.parse(s) || 0 : 0)
  if (sort === 'recent') list.sort((a, b) => t(b.lastActivity) - t(a.lastActivity))
  else if (sort === 'oldest_pending') list.sort((a, b) => (t(a.pendingSince) || Infinity) - (t(b.pendingSince) || Infinity))
  else list.sort((a, b) => b.score - a.score || t(b.lastActivity) - t(a.lastActivity))
}

export async function allSummaries(ctx?: SummaryCtx): Promise<ChatSummary[]> {
  const c = ctx ?? (await summaryCtx())
  const rows = await repo.allFullRows()
  const out: ChatSummary[] = []
  for (const r of rows) {
    const s = summarize(r, c)
    if (visible(s, r, c)) out.push(s)
  }
  return out
}

export async function listChats(filter: ChatFilter, offset = 0, limit = 60): Promise<ChatListPage> {
  const ctx = await summaryCtx()
  const list = (await allSummaries(ctx)).filter((s) => matches(s, filter, ctx))
  sortList(list, filter.sort ?? 'priority')
  const lim = Math.min(200, Math.max(1, limit))
  return { items: list.slice(offset, offset + lim), total: list.length, offset, hasMore: offset + lim < list.length }
}

export async function counts(): Promise<ChatCounts> {
  const ctx = await summaryCtx()
  const list = (await allSummaries(ctx)).filter((s) => !s.isArchivedRemote || s.replyState === 'needs_reply')
  const c: ChatCounts = {
    unreadChats: 0,
    unreadMessages: 0,
    needsReply: 0,
    waiting: 0,
    mentionChats: 0,
    mentionCount: 0,
    mentionsEstimated: false,
    high: 0,
    snoozed: 0,
    remindersDue: 0,
    total: list.length,
    byNetwork: {}
  }
  for (const s of list) {
    const n = (c.byNetwork[s.network] ??= { chats: 0, unread: 0 })
    n.chats++
    if (s.unreadCount && s.unreadCount > 0) {
      c.unreadChats++
      c.unreadMessages += s.unreadCount
      n.unread++
    }
    if (s.replyState === 'needs_reply') c.needsReply++
    if (s.replyState === 'waiting') c.waiting++
    if (s.replyState === 'snoozed') c.snoozed++
    if (s.reminderDue) c.remindersDue++
    if ((s.unreadMentions ?? 0) > 0 && !s.mentionsReviewed) {
      c.mentionChats++
      c.mentionCount += s.unreadMentions ?? 0
      if (s.mentionsEstimated) c.mentionsEstimated = true
    }
    if (s.replyState !== 'resolved' && s.replyState !== 'none' && (s.priority === 'alta' || s.contactVip || s.contactPriority === 'alta' || (!s.priority && s.suggestedPriority === 'alta'))) c.high++
  }
  return c
}

export async function getSummary(id: number): Promise<ChatSummary | null> {
  const r = await repo.fullRow(id)
  return r ? summarize(r, await summaryCtx()) : null
}

// ── Mensagens (cache só em memória) ───────────────────────────────────────────

const msgCache = new Map<number, { items: RemoteMessage[]; hasMore: boolean; cursor: string | null; at: number }>()
const CACHE_MAX = 40

function cachePut(chatId: number, v: { items: RemoteMessage[]; hasMore: boolean; cursor: string | null }): void {
  msgCache.delete(chatId)
  msgCache.set(chatId, { ...v, at: Date.now() })
  while (msgCache.size > CACHE_MAX) msgCache.delete(msgCache.keys().next().value as number)
}
export function invalidateMessages(chatId?: number): void {
  if (chatId == null) msgCache.clear()
  else msgCache.delete(chatId)
}

async function selfInfo(accountKey: string): Promise<{ ids: Set<string>; names: string[] }> {
  const acc = (await repo.listAccounts()).find((a) => a.key === accountKey)
  const names = [acc?.selfName, acc?.selfName?.split(' ')[0]].filter((x): x is string => !!x)
  return { ids: new Set([acc?.selfId].filter((x): x is string => !!x)), names }
}

// Assinatura dos anexos: o front nunca recebe a URL interna (mxc://…) crua.
const assetKey = crypto.randomBytes(32)
export function signAsset(chatId: number, ref: string): string {
  const payload = Buffer.from(JSON.stringify([chatId, ref, Date.now() + 6 * 3600_000])).toString('base64url')
  const sig = crypto.createHmac('sha256', assetKey).update(payload).digest('base64url')
  return `${payload}.${sig}`
}
export function verifyAsset(token: string): { chatId: number; ref: string } | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expect = crypto.createHmac('sha256', assetKey).update(payload).digest('base64url')
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  try {
    const [chatId, ref, exp] = JSON.parse(Buffer.from(payload, 'base64url').toString()) as [number, string, number]
    if (Date.now() > exp) return null
    return { chatId, ref }
  } catch {
    return null
  }
}

function toChatMessage(chatId: number, m: RemoteMessage, self: { ids: Set<string>; names: string[] }, group: boolean, attachmentsOk: boolean): ChatMessage {
  const providerMention = m.mentions ? m.mentions.some((x) => self.ids.has(x) || x === '@room') : null
  const estimated = providerMention == null && group && !m.isMine && textMentions(m.text, self.names)
  const reactions = new Map<string, { emoji: string; count: number; mine: boolean }>()
  for (const r of m.reactions) {
    const cur = reactions.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
    cur.count++
    if (self.ids.has(r.participantId)) cur.mine = true
    reactions.set(r.emoji, cur)
  }
  return {
    id: m.id,
    chatId,
    senderId: m.senderId,
    senderName: m.isMine ? 'Você' : m.senderName || 'Desconhecido',
    isMine: m.isMine,
    timestamp: m.timestamp,
    text: m.deleted ? '' : m.text,
    type: m.type,
    attachments: m.attachments.map((a) => ({
      type: a.type,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      url: attachmentsOk && a.ref ? `/api/chats/asset?t=${encodeURIComponent(signAsset(chatId, a.ref))}` : null,
      width: a.width,
      height: a.height
    })),
    mentionsMe: providerMention ?? estimated,
    mentionEstimated: providerMention == null && estimated,
    replyToId: m.replyToId,
    edited: m.edited,
    deleted: m.deleted,
    reactions: [...reactions.values()],
    sortKey: m.sortKey
  }
}

const bySort = (a: RemoteMessage, b: RemoteMessage): number => (a.sortKey === b.sortKey ? a.timestamp.localeCompare(b.timestamp) : a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true }))

function dedupe(list: RemoteMessage[]): RemoteMessage[] {
  const m = new Map<string, RemoteMessage>()
  for (const x of list) m.set(x.id, x)
  return [...m.values()].sort(bySort)
}

/**
 * Mensagens de uma conversa (mais antigas → mais recentes). `cursor` = carregar mais antigas.
 * Sem provedor, devolve o que estiver no cache de memória, marcado como desatualizado.
 */
export async function getMessages(chatId: number, cursor?: string | null): Promise<MessagePage> {
  const chat = await repo.chatById(chatId)
  if (!chat) throw new Error('Conversa não encontrada.')
  const cfg = await loadConfig()
  const provider = await activeProvider(cfg)
  const self = await selfInfo(chat.accountKey)
  const attachmentsOk = !!provider?.capabilities().attachments && !!provider?.fetchAttachment
  const map = (items: RemoteMessage[]): ChatMessage[] => items.map((m) => toChatMessage(chatId, m, self, chat.type === 'group', attachmentsOk))
  const cachedPage = msgCache.get(chatId)
  if (!provider || provider.id !== chat.providerId) {
    return { items: map(cachedPage?.items ?? []), hasMore: false, cursor: null, partialHistory: true, fromCache: true }
  }
  try {
    const page = await provider.listMessages(chat.remoteId, { cursor: cursor ?? null })
    if (cursor && cachedPage) {
      const merged = dedupe([...page.items, ...cachedPage.items])
      cachePut(chatId, { items: merged, hasMore: page.hasMore, cursor: page.olderCursor })
      return { items: map(dedupe(page.items)), hasMore: page.hasMore, cursor: page.olderCursor, partialHistory: !page.hasMore, fromCache: false }
    }
    const items = dedupe(page.items)
    cachePut(chatId, { items, hasMore: page.hasMore, cursor: page.olderCursor })
    // aproveita a leitura para atualizar a classificação desta conversa
    void applyScanFrom(chatId, chat.type, chat.lastActivity, items, page.hasMore, self, provider.capabilities().mentions).catch(() => undefined)
    return { items: map(items), hasMore: page.hasMore, cursor: page.olderCursor, partialHistory: !page.hasMore, fromCache: false }
  } catch (e) {
    if (cachedPage) return { items: map(cachedPage.items), hasMore: false, cursor: null, partialHistory: true, fromCache: true }
    throw e
  }
}

/** Mensagens específicas já carregadas (para IA/TODO): nunca busca histórico extra. */
export function cachedMessages(chatId: number, ids: string[]): RemoteMessage[] {
  const c = msgCache.get(chatId)
  if (!c) return []
  const want = new Set(ids)
  return c.items.filter((m) => want.has(m.id))
}

export function computeScan(
  type: 'single' | 'group',
  lastActivity: string | null,
  items: RemoteMessage[],
  hasMore: boolean,
  self: { ids: Set<string>; names: string[] },
  providerMentions: boolean
): ScanResult {
  const real = items.filter((m) => !m.deleted && m.type !== 'REACTION' && m.type !== 'NOTICE')
  let lastIn: RemoteMessage | null = null
  let lastOut: RemoteMessage | null = null
  for (const m of real) {
    if (m.isMine) lastOut = m
    else lastIn = m
  }
  const myIds = new Set(real.filter((m) => m.isMine).map((m) => m.id))
  // primeira recebida depois da minha última (pendente desde)
  let pendingSince: string | null = null
  const outT = lastOut ? lastOut.sortKey : null
  for (const m of real) {
    if (!m.isMine && (outT == null || bySort(m, lastOut!) > 0)) {
      pendingSince = m.timestamp
      break
    }
  }
  if (outT == null && hasMore && pendingSince) {
    // a página não alcança minha última resposta: pendente há pelo menos isso
  }
  const inFlags = messageFlags(lastIn?.text)
  const outFlags = messageFlags(lastOut?.text)
  let estimatedMentions: number | null = null
  const mentionsKnown = providerMentions && real.some((m) => m.mentions !== null)
  if (type === 'group' && !mentionsKnown) {
    estimatedMentions = real.filter((m) => !m.isMine && (outT == null || bySort(m, lastOut!) > 0) && m.isUnread !== false && textMentions(m.text, self.names)).length
  }
  return {
    scannedActivity: lastActivity,
    lastInboundAt: lastIn?.timestamp ?? null,
    lastOutboundAt: lastOut?.timestamp ?? null,
    lastInboundClosing: !!lastIn && (inFlags.closing || (lastIn.attachments.length > 0 && !lastIn.text && lastIn.attachments[0].type === 'sticker')),
    lastInboundQuestion: inFlags.question,
    lastOutboundQuestion: outFlags.question,
    lastInboundRepliesToMe: !!lastIn?.replyToId && myIds.has(lastIn.replyToId),
    pendingSince,
    estimatedMentions
  }
}

async function applyScanFrom(
  chatId: number,
  type: 'single' | 'group',
  lastActivity: string | null,
  items: RemoteMessage[],
  hasMore: boolean,
  self: { ids: Set<string>; names: string[] },
  providerMentions: boolean
): Promise<void> {
  await repo.applyScans([{ id: chatId, scan: computeScan(type, lastActivity, items, hasMore, self, providerMentions) }])
}

/** Lê a primeira página de mensagens e atualiza a classificação (usado pela sincronização). */
export async function scanChat(provider: ChatProvider, chatId: number): Promise<ScanResult | null> {
  const chat = await repo.chatById(chatId)
  if (!chat || chat.providerId !== provider.id) return null
  const page = await provider.listMessages(chat.remoteId, {})
  const items = dedupe(page.items)
  if (msgCache.has(chatId)) cachePut(chatId, { items, hasMore: page.hasMore, cursor: page.olderCursor })
  return computeScan(chat.type, chat.lastActivity, items, page.hasMore, await selfInfo(chat.accountKey), provider.capabilities().mentions)
}

// ── Ações no provedor ─────────────────────────────────────────────────────────

async function requireProviderFor(chatId: number): Promise<{ provider: ChatProvider; chat: repo.ChatRow }> {
  const chat = await repo.chatById(chatId)
  if (!chat) throw new Error('Conversa não encontrada.')
  const provider = await activeProvider()
  if (!provider) throw new ProviderUnavailableError('Central de Mensagens desativada.')
  if (provider.id !== chat.providerId) throw new ProviderUnavailableError('Esta conversa é de um provedor que não está ativo: envio bloqueado.')
  return { provider, chat }
}

/** Envia texto. Só é chamado por ação explícita do usuário (nunca automaticamente). */
export async function sendMessage(chatId: number, text: string, replyToId: string | null): Promise<{ ok: true; pendingId: string | null }> {
  const body = text.trim()
  if (!body) throw new Error('Mensagem vazia.')
  if (body.length > 10_000) throw new Error('Mensagem longa demais.')
  const { provider, chat } = await requireProviderFor(chatId)
  if (!provider.capabilities().sendMessages) throw new Error('Este provedor não envia mensagens.')
  const r = await provider.sendMessage(chat.remoteId, body, replyToId)
  const now = new Date().toISOString()
  const cfg = await loadConfig()
  await repo.recordOutbound(chatId, now, messageFlags(body).question, repo.previewOf(body, cfg.storePreviews))
  // responder encerra o adiamento/lembrete e a marcação "preciso responder"
  const org = await repo.getOrg(chatId)
  if (org && (org.snoozeUntil || org.manualState === 'needs_reply')) {
    await repo.patchOrg([chatId], { snoozeUntil: null, snoozedAt: null, reminderNote: null, ...(org.manualState === 'needs_reply' ? { manualState: null, manualAt: null } : {}) })
  }
  await repo.touchContactsFromOutbound()
  invalidateMessages(chatId)
  changed([chatId])
  return { ok: true, pendingId: r.pendingId }
}

/** Confere no cache se a mensagem é sua (o provedor confere de novo; isto só dá um erro mais claro). */
function ownMessage(chatId: number, messageId: string): RemoteMessage | null {
  const m = msgCache.get(chatId)?.items.find((x) => x.id === messageId) ?? null
  if (m && !m.isMine) throw new Error('Só dá para alterar mensagens enviadas por você.')
  if (m?.deleted) throw new Error('Esta mensagem já foi apagada.')
  return m
}

/** Depois de editar/apagar: descarta o cache e reclassifica a conversa com o estado novo. */
async function refreshAfterChange(provider: ChatProvider, chatId: number): Promise<void> {
  invalidateMessages(chatId)
  try {
    const scan = await scanChat(provider, chatId)
    if (scan) {
      await repo.applyScans([{ id: chatId, scan }])
      await repo.applyLastFromScan(chatId, scan)
    }
  } catch {
    // a próxima sincronização corrige
  }
  changed([chatId])
}

/** Edita o texto de uma mensagem SUA. Ação explícita do usuário (nunca automática). */
export async function editMessage(chatId: number, messageId: string, text: string): Promise<{ ok: true }> {
  const body = text.trim()
  if (!messageId) throw new Error('Mensagem inválida.')
  if (!body) throw new Error('O texto não pode ficar vazio (para remover, apague a mensagem).')
  if (body.length > 10_000) throw new Error('Mensagem longa demais.')
  const { provider, chat } = await requireProviderFor(chatId)
  if (!provider.editMessage || !provider.capabilities().editMessages) throw new Error('Este provedor não permite editar mensagens.')
  const m = ownMessage(chatId, messageId)
  if (m?.attachments.length) throw new Error('Mensagens com anexo não podem ser editadas.')
  if (m && m.text === body) return { ok: true }
  await provider.editMessage(chat.remoteId, messageId, body)
  await refreshAfterChange(provider, chatId)
  return { ok: true }
}

/** Apaga uma mensagem SUA: para todos (quando a rede permite) ou só para você. */
export async function deleteMessage(chatId: number, messageId: string, forEveryone: boolean): Promise<{ ok: true }> {
  if (!messageId) throw new Error('Mensagem inválida.')
  const { provider, chat } = await requireProviderFor(chatId)
  if (!provider.deleteMessage || !provider.capabilities().deleteMessages) throw new Error('Este provedor não permite apagar mensagens.')
  ownMessage(chatId, messageId)
  await provider.deleteMessage(chat.remoteId, messageId, forEveryone)
  await refreshAfterChange(provider, chatId)
  return { ok: true }
}

export async function markRead(chatId: number, read: boolean): Promise<void> {
  const { provider, chat } = await requireProviderFor(chatId)
  if (read) {
    if (!provider.markRead) throw new Error('Este provedor não permite marcar como lida.')
    await provider.markRead(chat.remoteId, null)
    await repo.patchChatCounters(chatId, chat.unreadCount == null ? null : 0, chat.unreadMentions == null ? null : 0)
  } else {
    if (!provider.markUnread) throw new Error('Este provedor não permite marcar como não lida.')
    await provider.markUnread(chat.remoteId)
    await repo.patchChatCounters(chatId, Math.max(1, chat.unreadCount ?? 0), chat.unreadMentions)
  }
  changed([chatId])
}

export async function searchMessages(query: string, chatId?: number | null): Promise<{ results: { chat: ChatSummary | null; chatKey: string; message: ChatMessage }[]; partial: boolean; supported: boolean }> {
  const q = query.trim()
  if (q.length < 2) return { results: [], partial: false, supported: true }
  const provider = await activeProvider()
  if (!provider?.searchMessages || !provider.capabilities().search) return { results: [], partial: true, supported: false }
  let chatRemote: string[] | undefined
  if (chatId) {
    const c = await repo.chatById(chatId)
    if (c) chatRemote = [c.remoteId]
  }
  const found = await provider.searchMessages(q, { chatIds: chatRemote, limit: 20 })
  const ctx = await summaryCtx()
  const out: { chat: ChatSummary | null; chatKey: string; message: ChatMessage }[] = []
  for (const m of found) {
    const row = await repo.chatByKey(repo.chatKey(provider.id, m.chatId))
    const full = row ? await repo.fullRow(row.id) : null
    const self = row ? await selfInfo(row.accountKey) : { ids: new Set<string>(), names: [] }
    out.push({
      chat: full ? summarize(full, ctx) : null,
      chatKey: repo.chatKey(provider.id, m.chatId),
      message: toChatMessage(row?.id ?? 0, m, self, row?.type === 'group', false)
    })
  }
  return { results: out, partial: true, supported: true }
}

export async function fetchAsset(token: string): Promise<{ contentType: string; body: Buffer }> {
  const v = verifyAsset(token)
  if (!v) throw new Error('Link de anexo inválido ou expirado.')
  const { provider } = await requireProviderFor(v.chatId)
  if (!provider.fetchAttachment) throw new Error('Este provedor não fornece anexos.')
  return provider.fetchAttachment(v.ref)
}

// ── Pessoas ───────────────────────────────────────────────────────────────────

/** Sugestões de pessoa para uma conversa. Só sugere (confirmação é manual), nunca vincula sozinho. */
export async function suggestContacts(chatId: number): Promise<ContactSuggestion[]> {
  const chat = await repo.chatById(chatId)
  if (!chat) return []
  const contacts = await repo.contactsLite()
  const title = norm(chat.title).replace(/[^a-z0-9 ]/g, ' ')
  const handle = norm(chat.peerHandle).replace(/^@/, '')
  const tWords = title.split(/\s+/).filter((w) => w.length >= 3)
  const out: ContactSuggestion[] = []
  for (const c of contacts) {
    const name = norm(c.name)
    const nWords = name.split(/\s+/).filter((w) => w.length >= 3)
    let score = 0
    let reason = ''
    if (name && title === name) {
      score = 90
      reason = 'Mesmo nome'
    } else {
      const common = nWords.filter((w) => tWords.includes(w)).length
      if (common) {
        score = 40 + common * 20
        reason = `Nome parecido (${common} palavra${common > 1 ? 's' : ''} em comum)`
      }
    }
    const ctxText = norm(`${c.context ?? ''} ${c.interests ?? ''}`)
    if (handle && handle.length >= 4 && ctxText.includes(handle)) {
      score = Math.max(score, 95)
      reason = 'Identificador citado no contexto da pessoa'
    }
    if (score >= 50) out.push({ contactId: c.id, name: c.name, reason, score })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5)
}

export async function contactChats(contactId: number): Promise<ContactChatLink[]> {
  const ctx = await summaryCtx()
  return (await allSummaries(ctx))
    .filter((s) => s.contactId === contactId)
    .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
    .map((s) => ({ chatId: s.id, network: s.network, title: s.title, lastActivity: s.lastActivity, replyState: s.replyState, unreadCount: s.unreadCount }))
}

/** Todas as redes por pessoa (para a lista do CRM). */
export async function contactNetworks(): Promise<Record<number, { network: string; chatId: number; pending: boolean }[]>> {
  const ctx = await summaryCtx()
  const out: Record<number, { network: string; chatId: number; pending: boolean }[]> = {}
  for (const s of await allSummaries(ctx)) {
    if (!s.contactId) continue
    ;(out[s.contactId] ??= []).push({ network: s.network, chatId: s.id, pending: s.replyState === 'needs_reply' })
  }
  return out
}

// ── Radar ─────────────────────────────────────────────────────────────────────

const days = (iso: string | null, now: number): number => (iso ? Math.floor((now - Date.parse(iso)) / 86400_000) : 0)
const firstName = (s: ChatSummary): string => (s.contactName || s.title).split(' ')[0]

export async function radar(): Promise<RadarView> {
  const ctx = await summaryCtx()
  const now = ctx.now
  const list = await allSummaries(ctx)
  const items: RadarItem[] = []
  const vip = (s: ChatSummary): boolean => s.contactVip || s.contactPriority === 'alta' || s.priority === 'alta'

  for (const s of list) {
    if (s.reminderDue) {
      items.push({
        kind: 'reminder_due',
        text: s.reminderNote ? `Lembrete: ${s.reminderNote} — ${s.title}` : `Você marcou "${s.title}" para responder ${relDay(s.snoozeUntil, now)}.`,
        chatId: s.id,
        contactId: s.contactId,
        weight: 90
      })
      continue
    }
    if (s.reopened) {
      items.push({ kind: 'reopened', text: `${s.title} mandou mensagem nova numa conversa adiada.`, chatId: s.id, contactId: s.contactId, weight: 70 })
      continue
    }
    if (s.replyState === 'needs_reply' && vip(s)) {
      const d = days(s.pendingSince, now)
      items.push({ kind: 'vip_waiting', text: `${firstName(s)} está esperando resposta${d > 0 ? ` há ${d} dia${d > 1 ? 's' : ''}` : ''}.`, chatId: s.id, contactId: s.contactId, weight: 80 + Math.min(d, 15) })
    }
  }

  const mentionChats = list.filter((s) => s.type === 'group' && (s.unreadMentions ?? 0) > 0 && !s.mentionsReviewed)
  if (mentionChats.length) {
    const n = mentionChats.reduce((t, s) => t + (s.unreadMentions ?? 0), 0)
    const est = mentionChats.some((s) => s.mentionsEstimated)
    items.push({
      kind: 'mentions',
      text: `${est ? '~' : ''}${n} menç${n > 1 ? 'ões' : 'ão'} não lida${n > 1 ? 's' : ''} em ${mentionChats.length} grupo${mentionChats.length > 1 ? 's' : ''}${est ? ' (estimativa)' : ''}.`,
      chatId: mentionChats.length === 1 ? mentionChats[0].id : null,
      contactId: null,
      weight: 75
    })
  }

  const prof = list.filter((s) => s.replyState === 'needs_reply' && s.labels.concat(s.contactId ? ctx.contactLabels.get(s.contactId) ?? [] : []).some((l) => ctx.professional.has(l.name.toLowerCase())))
  if (prof.length) items.push({ kind: 'professional', text: `${prof.length} conversa${prof.length > 1 ? 's' : ''} profissional${prof.length > 1 ? 'is' : ''} pendente${prof.length > 1 ? 's' : ''} (recrutadores, clientes…).`, chatId: prof.length === 1 ? prof[0].id : null, contactId: null, weight: 65 })

  const forgotten = list
    .filter((s) => s.replyState === 'needs_reply' && !vip(s) && s.type === 'single' && days(s.pendingSince, now) >= 7)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  for (const s of forgotten) items.push({ kind: 'forgotten', text: `${firstName(s)} (${networkInfo(s.network).label}) espera resposta há ${days(s.pendingSince, now)} dias.`, chatId: s.id, contactId: s.contactId, weight: 50 + Math.min(days(s.pendingSince, now), 20) })

  const oldUnread = list.filter((s) => (s.unreadCount ?? 0) > 0 && !s.isMuted && s.replyState !== 'snoozed' && days(s.lastActivity, now) >= 7)
  if (oldUnread.length >= 3) items.push({ kind: 'old_unread', text: `${oldUnread.length} conversas com mensagens não lidas há mais de 7 dias.`, chatId: null, contactId: null, weight: 30 })

  // Pessoas importantes sem contato recente (não confundir com pendência).
  const pendingContacts = new Set(list.filter((s) => s.replyState === 'needs_reply' && s.contactId).map((s) => s.contactId))
  for (const c of await repo.contactsLite()) {
    if (!(c.vip || c.priority === 'alta') || pendingContacts.has(c.id)) continue
    const d = c.lastContactAt ? days(c.lastContactAt, now) : null
    if (d == null || d >= ctx.cfg.noContactDays) {
      items.push({ kind: 'no_contact', text: d == null ? `Sem conversa registrada com ${c.name}.` : `Faz ${d} dias que você não fala com ${c.name}.`, chatId: null, contactId: c.id, weight: 20 })
    }
  }

  items.sort((a, b) => b.weight - a.weight)
  const c = await counts()
  const summary: string[] = []
  if (c.needsReply) summary.push(`${c.needsReply} conversa${c.needsReply > 1 ? 's' : ''} possivelmente pendente${c.needsReply > 1 ? 's' : ''}`)
  if (c.waiting) summary.push(`${c.waiting} aguardando resposta de outra pessoa`)
  return { items: items.slice(0, 40), summary }
}

function relDay(iso: string | null, now: number): string {
  if (!iso) return ''
  const d = Math.round((now - Date.parse(iso)) / 86400_000)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  return `há ${d} dias`
}

// ── Eventos para os clientes ──────────────────────────────────────────────────

let pendingChanged = new Set<number>()
let changedTimer: NodeJS.Timeout | null = null
/** Avisa os clientes (SSE) com debounce: muitas mudanças viram um evento. */
export function changed(ids: number[] = []): void {
  ids.forEach((i) => pendingChanged.add(i))
  if (changedTimer) return
  changedTimer = setTimeout(() => {
    const list = [...pendingChanged]
    pendingChanged = new Set()
    changedTimer = null
    broadcast('chats:updated', { chatIds: list })
  }, 400)
}

export { NO_CAPABILITIES }
