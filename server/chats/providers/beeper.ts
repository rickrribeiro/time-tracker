import type { ChatProviderCapabilities } from '../../../shared/chats'
import type { BeeperTransport, TransportRequest, TransportResponse } from '../transport'
import type { ChatProvider, Page, ProviderEvent, RealtimeState, RemoteAccount, RemoteAttachment, RemoteChat, RemoteMessage, RemoteParticipant } from './types'
import { ProviderUnavailableError } from './types'

/**
 * Provedor Beeper Desktop API (v1, validado contra o SDK oficial @beeper/desktop-api 6.0.0).
 *  GET  /v1/accounts                       contas conectadas
 *  GET  /v1/chats?accountIDs&cursor&direction&limit   conversas (mais recente primeiro)
 *  GET  /v1/chats/{id}                      uma conversa
 *  GET  /v1/chats/{id}/messages?cursor&direction       mensagens
 *  POST /v1/chats/{id}/messages {text, replyToMessageID}
 *  POST /v1/chats/{id}/read {messageID?} · POST /v1/chats/{id}/unread
 *  GET  /v1/messages/search?query&chatIDs&accountIDs&limit(≤20)
 *  GET  /v1/assets/serve?url=mxc://…        bytes do anexo
 *  WS   /v1/ws (experimental) → subscriptions.set {chatIDs:["*"]}; eventos chat.upserted,
 *       chat.deleted, message.upserted, message.deleted
 *
 * Diferenças por rede ficam em `chat.capabilities` (escala −2…2); nunca presumimos suporte.
 */

// Tipos mínimos do que a API devolve (só os campos usados).
interface BUser {
  id: string
  fullName?: string
  username?: string
  phoneNumber?: string
  email?: string
  isSelf?: boolean
}
interface BAttachment {
  type?: string
  id?: string
  fileName?: string
  fileSize?: number
  mimeType?: string
  srcURL?: string
  isSticker?: boolean
  isVoiceNote?: boolean
  isGif?: boolean
  size?: { width?: number; height?: number }
}
interface BMessage {
  id: string
  chatID: string
  accountID?: string
  senderID: string
  senderName?: string
  sortKey: string
  timestamp: string
  text?: string
  type?: string
  isSender?: boolean
  isUnread?: boolean
  isDeleted?: boolean
  isHidden?: boolean
  editedTimestamp?: string
  linkedMessageID?: string
  mentions?: string[] | null
  reactions?: { participantID: string; reactionKey: string; emoji?: boolean }[]
  attachments?: BAttachment[]
}
interface BChat {
  id: string
  accountID: string
  network: string
  title: string
  type: 'single' | 'group'
  imgURL?: string | null
  unreadCount: number
  unreadMentionsCount?: number
  isArchived?: boolean
  isMuted?: boolean
  lastActivity?: string
  preview?: BMessage
  participants?: { items?: BUser[]; total?: number; hasMore?: boolean }
  capabilities?: Record<string, unknown>
}
interface BAccount {
  accountID: string
  network?: string
  status?: string
  statusText?: string
  bridge?: { id?: string; type?: string; provider?: string }
  user?: BUser
}
interface BList<T> {
  items?: T[]
  hasMore?: boolean
  oldestCursor?: string | null
  newestCursor?: string | null
}

function ensureOk(r: TransportResponse, what: string): unknown {
  if (r.status >= 200 && r.status < 300) return r.json
  const msg = (r.json as { message?: string; error?: string } | undefined)?.message ?? (r.json as { error?: string } | undefined)?.error
  if (r.status === 404) throw new Error(`${what}: não encontrado.`)
  throw new Error(`${what}: Beeper respondeu ${r.status}${msg ? ` — ${String(msg).slice(0, 200)}` : ''}`)
}

const userName = (u: BUser): string => u.fullName || u.username || u.phoneNumber || u.email || u.id
const handleOf = (u: BUser): string | null => u.phoneNumber || u.username || u.email || null

function mapAttachment(a: BAttachment): RemoteAttachment {
  const t = a.isSticker ? 'sticker' : a.type === 'img' ? 'image' : a.type === 'video' ? 'video' : a.type === 'audio' ? 'audio' : a.type === 'unknown' || !a.type ? 'file' : 'unknown'
  return {
    type: t,
    fileName: a.fileName ?? null,
    mimeType: a.mimeType ?? null,
    size: a.fileSize ?? null,
    ref: a.srcURL && /^(mxc|localmxc):\/\//.test(a.srcURL) ? a.srcURL : null,
    width: a.size?.width ?? null,
    height: a.size?.height ?? null
  }
}

export function mapMessage(m: BMessage): RemoteMessage {
  return {
    id: m.id,
    chatId: m.chatID,
    senderId: m.senderID,
    senderName: m.senderName ?? null,
    isMine: !!m.isSender,
    timestamp: m.timestamp,
    sortKey: m.sortKey ?? m.timestamp,
    text: m.text ?? '',
    type: m.type ?? 'TEXT',
    attachments: (m.attachments ?? []).map(mapAttachment),
    mentions: Array.isArray(m.mentions) ? m.mentions : null,
    replyToId: m.linkedMessageID ?? null,
    edited: !!m.editedTimestamp,
    deleted: !!m.isDeleted,
    reactions: (m.reactions ?? []).filter((r) => r.emoji !== false).map((r) => ({ emoji: r.reactionKey, participantId: r.participantID })),
    isUnread: typeof m.isUnread === 'boolean' ? m.isUnread : null
  }
}

/** Escala de capacidade do Beeper: 1 (parcial) e 2 (total) contam como suportado. */
const capOk = (v: unknown): boolean => typeof v === 'number' ? v >= 1 : v === true

export function mapChat(c: BChat): RemoteChat {
  const items = c.participants?.items ?? []
  const others = items.filter((p) => !p.isSelf)
  const participants: RemoteParticipant[] = items.map((p) => ({ id: p.id, name: userName(p), handle: handleOf(p), isSelf: !!p.isSelf }))
  const caps = c.capabilities ?? {}
  return {
    remoteId: c.id,
    accountId: c.accountID,
    network: c.network,
    title: c.title || (others[0] ? userName(others[0]) : ''),
    type: c.type === 'group' ? 'group' : 'single',
    imgUrl: null, // imgURL costuma ser mxc:// ou file:// local; não é exibível no navegador
    participantCount: c.participants?.total ?? (items.length || null),
    participants,
    peerHandle: c.type === 'single' && others.length === 1 ? handleOf(others[0]) : null,
    unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : null,
    unreadMentions: typeof c.unreadMentionsCount === 'number' ? c.unreadMentionsCount : null,
    lastActivity: c.lastActivity ?? c.preview?.timestamp ?? null,
    preview: c.preview ? mapMessage(c.preview) : null,
    isMuted: !!c.isMuted,
    isArchived: !!c.isArchived,
    capabilities: {
      ...(caps.reply !== undefined ? { replyTo: capOk(caps.reply) } : {}),
      ...(caps.reaction !== undefined ? { reactions: capOk(caps.reaction) } : {}),
      ...(caps.markAsUnread !== undefined ? { markAsUnread: capOk(caps.markAsUnread) } : {}),
      ...(caps.edit !== undefined ? { editMessages: capOk(caps.edit) } : {}),
      ...(caps.delete !== undefined ? { deleteMessages: capOk(caps.delete) } : {})
    }
  }
}

interface WsLike {
  onopen: (() => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: ((ev: unknown) => void) | null
  send(data: string): void
  close(): void
}

export function createBeeperProvider(transport: BeeperTransport, opts: { onAgentEvents?: (fn: ((e: ProviderEvent) => void) | null) => void } = {}): ChatProvider {
  const call = async (req: TransportRequest, what: string): Promise<unknown> => ensureOk(await transport.request(req), what)
  let version: string | null = null

  const caps: ChatProviderCapabilities = {
    readMessages: true,
    sendMessages: true,
    markAsRead: true,
    markAsUnread: true,
    mentions: true,
    attachments: true,
    realtimeEvents: transport.mode === 'agent' || typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function',
    search: true,
    reactions: false, // leitura sim; reagir pelo rickOS ainda não
    replyTo: true,
    editMessages: true,
    deleteMessages: true
  }

  return {
    id: 'beeper',
    label: 'Beeper Desktop API',
    demo: false,
    capabilities: () => caps,

    async test() {
      try {
        const r = await transport.request({ method: 'GET', path: '/v1/accounts' })
        ensureOk(r, 'Contas')
        version = r.headers?.['x-beeper-desktop-version'] ?? version
        const n = Array.isArray(r.json) ? r.json.length : 0
        return { ok: true, message: `Conectado ao Beeper${version ? ` ${version}` : ''} (${transport.mode === 'agent' ? 'via agente local' : 'direto'}). ${n} conta(s).`, version }
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    },

    async listAccounts(): Promise<RemoteAccount[]> {
      const r = await transport.request({ method: 'GET', path: '/v1/accounts' })
      version = r.headers?.['x-beeper-desktop-version'] ?? version
      const list = (ensureOk(r, 'Contas') as BAccount[] | { items?: BAccount[] }) ?? []
      const items = Array.isArray(list) ? list : list.items ?? []
      return items.map((a) => ({
        remoteId: a.accountID,
        network: a.network || a.bridge?.type || a.bridge?.id || a.accountID,
        displayName: a.user ? `${a.network || a.bridge?.type || 'Conta'} · ${userName(a.user)}` : a.network || a.accountID,
        selfId: a.user?.id ?? null,
        selfName: a.user ? userName(a.user) : null,
        status: a.status || 'unknown'
      }))
    },

    async listChats({ accountIds, cursor, limit }): Promise<Page<RemoteChat>> {
      const body = (await call(
        {
          method: 'GET',
          path: '/v1/chats',
          query: { accountIDs: accountIds?.length ? accountIds : undefined, cursor: cursor ?? undefined, direction: cursor ? 'before' : undefined, limit: Math.min(200, Math.max(1, limit ?? 100)) }
        },
        'Conversas'
      )) as BList<BChat>
      const items = (body?.items ?? []).map(mapChat)
      return { items, hasMore: !!body?.hasMore, olderCursor: body?.hasMore ? body.oldestCursor ?? null : null }
    },

    async getChat(remoteId) {
      try {
        return mapChat((await call({ method: 'GET', path: `/v1/chats/${encodeURIComponent(remoteId)}`, query: { maxParticipantCount: 20 } }, 'Conversa')) as BChat)
      } catch (e) {
        if (e instanceof Error && /não encontrado/.test(e.message)) return null
        throw e
      }
    },

    async listMessages(remoteChatId, { cursor }): Promise<Page<RemoteMessage>> {
      const body = (await call(
        { method: 'GET', path: `/v1/chats/${encodeURIComponent(remoteChatId)}/messages`, query: { cursor: cursor ?? undefined, direction: cursor ? 'before' : undefined } },
        'Mensagens'
      )) as BList<BMessage>
      return { items: (body?.items ?? []).map(mapMessage), hasMore: !!body?.hasMore, olderCursor: body?.hasMore ? body.oldestCursor ?? null : null }
    },

    async sendMessage(remoteChatId, text, replyToId) {
      const body = (await call(
        { method: 'POST', path: `/v1/chats/${encodeURIComponent(remoteChatId)}/messages`, body: { text, ...(replyToId ? { replyToMessageID: replyToId } : {}) } },
        'Enviar'
      )) as { pendingMessageID?: string }
      return { pendingId: body?.pendingMessageID ?? null }
    },

    async editMessage(remoteChatId, messageId, text) {
      await call({ method: 'PUT', path: `/v1/chats/${encodeURIComponent(remoteChatId)}/messages/${encodeURIComponent(messageId)}`, body: { text } }, 'Editar')
    },

    async deleteMessage(remoteChatId, messageId, forEveryone) {
      await call({ method: 'DELETE', path: `/v1/chats/${encodeURIComponent(remoteChatId)}/messages/${encodeURIComponent(messageId)}`, query: { forEveryone } }, 'Apagar')
    },

    async markRead(remoteChatId, upTo) {
      await call({ method: 'POST', path: `/v1/chats/${encodeURIComponent(remoteChatId)}/read`, body: upTo ? { messageID: upTo } : {} }, 'Marcar como lida')
    },

    async markUnread(remoteChatId) {
      await call({ method: 'POST', path: `/v1/chats/${encodeURIComponent(remoteChatId)}/unread`, body: {} }, 'Marcar como não lida')
    },

    async searchMessages(query, { accountIds, chatIds, limit }) {
      const body = (await call(
        { method: 'GET', path: '/v1/messages/search', query: { query, accountIDs: accountIds?.length ? accountIds : undefined, chatIDs: chatIds?.length ? chatIds : undefined, limit: Math.min(20, limit ?? 20) } },
        'Busca'
      )) as BList<BMessage>
      return (body?.items ?? []).map(mapMessage)
    },

    async fetchAttachment(ref) {
      if (!/^(mxc|localmxc):\/\//.test(ref)) throw new Error('Anexo inválido.')
      const r = await transport.request({ method: 'GET', path: '/v1/assets/serve', query: { url: ref }, binary: true })
      if (r.status < 200 || r.status >= 300 || !r.buffer) throw new Error(`Anexo indisponível (${r.status}).`)
      return { contentType: r.contentType || 'application/octet-stream', body: r.buffer }
    },

    subscribe(onEvent, onState) {
      // Modo agente: o agente mantém o WebSocket no Mac e repassa os eventos.
      if (transport.mode === 'agent') {
        opts.onAgentEvents?.(onEvent)
        onState('on')
        return () => {
          opts.onAgentEvents?.(null)
          onState('off')
        }
      }
      const WS = (globalThis as { WebSocket?: new (url: string, init?: unknown) => WsLike }).WebSocket
      const url = transport.wsUrl()
      if (!WS || !url) {
        onState('off', 'WebSocket indisponível neste runtime: usando polling.')
        return () => undefined
      }
      let ws: WsLike | null = null
      let stopped = false
      let attempt = 0
      let timer: NodeJS.Timeout | null = null
      const connect = (): void => {
        if (stopped) return
        onState('connecting')
        try {
          ws = new WS(url, { headers: transport.authHeader() })
        } catch (e) {
          onState('off', e instanceof Error ? e.message : String(e))
          schedule()
          return
        }
        ws.onopen = () => {
          attempt = 0
          ws?.send(JSON.stringify({ type: 'subscriptions.set', requestID: 'rickos', chatIDs: ['*'] }))
        }
        ws.onmessage = (ev) => {
          let msg: { type?: string; chatID?: string; ids?: string[] }
          try {
            msg = JSON.parse(String(ev.data))
          } catch {
            return
          }
          switch (msg.type) {
            case 'subscriptions.updated':
              onState('on')
              break
            case 'chat.upserted':
              onEvent({ type: 'chat.upserted', chatIds: msg.ids ?? (msg.chatID ? [msg.chatID] : []) })
              break
            case 'chat.deleted':
              onEvent({ type: 'chat.deleted', chatIds: msg.ids ?? (msg.chatID ? [msg.chatID] : []) })
              break
            case 'message.upserted':
              if (msg.chatID) onEvent({ type: 'message.upserted', chatId: msg.chatID, messageIds: msg.ids ?? [] })
              break
            case 'message.deleted':
              if (msg.chatID) onEvent({ type: 'message.deleted', chatId: msg.chatID, messageIds: msg.ids ?? [] })
              break
            case 'error':
              onState('off', (msg as { message?: string }).message ?? 'erro no WebSocket')
              break
          }
        }
        ws.onerror = () => undefined
        ws.onclose = () => {
          ws = null
          if (stopped) return
          onState('off', 'WebSocket desconectado; reconectando…')
          schedule()
        }
      }
      const schedule = (): void => {
        if (stopped) return
        attempt++
        const delay = Math.min(5 * 60_000, 2000 * 2 ** Math.min(attempt, 8))
        timer = setTimeout(connect, delay)
      }
      connect()
      return () => {
        stopped = true
        if (timer) clearTimeout(timer)
        try {
          ws?.close()
        } catch {
          // já fechado
        }
        onState('off')
      }
    }
  }
}

export { ProviderUnavailableError }
