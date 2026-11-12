import type { ChatProviderCapabilities } from '../../../shared/chats'
import type { ChatProvider, Page, ProviderEvent, RealtimeState, RemoteAccount, RemoteChat, RemoteMessage } from './types'
import { ProviderAuthError, ProviderUnavailableError } from './types'

/**
 * Provedor de DEMONSTRAÇÃO (dados fictícios, determinísticos). Serve para desenvolver a
 * interface e para os testes sem o Beeper. A UI mostra um aviso permanente quando ativo.
 *
 * `MockControl` permite simular falhas (offline, token inválido), mensagens novas e
 * duplicadas nos testes.
 */
export interface MockControl {
  offline: boolean
  authError: boolean
  /** Força páginas pequenas para testar paginação. */
  pageSize: number
  /** Provedor sem dado de menções (testa estimativa). */
  noMentions: boolean
  sent: { chatId: string; text: string; replyTo: string | null }[]
  edited: { chatId: string; messageId: string; text: string }[]
  deleted: { chatId: string; messageId: string; forEveryone: boolean }[]
  /** Contas que o provedor "esqueceu" (desconectadas). */
  hiddenAccounts: string[]
  emit: ((e: ProviderEvent) => void) | null
}

const SELF = { wa: 'me-wa', ig1: 'me-ig1', ig2: 'me-ig2', li: 'me-li' }
const SELF_NAME = 'Rick'

interface MockChatDef {
  id: string
  account: string
  network: string
  title: string
  type: 'single' | 'group'
  handle: string | null
  participants: number
  muted?: boolean
  unread: number
  mentions: number | null
  /** [minutosAtrás, deMim, texto, mencionaMe?] — da mais antiga para a mais recente. */
  msgs: [number, boolean, string, boolean?][]
}

const H = 60
const D = 24 * H

function defs(): MockChatDef[] {
  const base: MockChatDef[] = [
    { id: 'wa-joao', account: 'wa', network: 'WhatsApp', title: 'João Silva', type: 'single', handle: '+5511990000001', participants: 2, unread: 2, mentions: 0,
      msgs: [[10 * D, true, 'Fala João! Bora marcar aquele café?'], [9 * D, false, 'Bora sim'], [8 * D + 30, false, 'Você consegue quinta à tarde?'], [8 * D, false, 'Ou sexta de manhã, se for melhor']] },
    { id: 'wa-maria', account: 'wa', network: 'WhatsApp', title: 'Maria (mãe)', type: 'single', handle: '+5511990000002', participants: 2, unread: 1, mentions: 0,
      msgs: [[2 * D, true, 'Oi mãe, cheguei bem!'], [2 * D - 20, false, 'Que bom filho, se cuida'], [3 * H, false, 'Vai vir no aniversário da vó dia 20?']] },
    { id: 'wa-pedro', account: 'wa', network: 'WhatsApp', title: 'Pedro Alves', type: 'single', handle: '+5511990000003', participants: 2, unread: 0, mentions: 0,
      msgs: [[5 * D, false, 'Me manda o link do projeto?'], [5 * D - 10, true, 'Mando sim, segue: github.com/exemplo'], [5 * D - 5, false, 'Valeu! 👍']] },
    { id: 'wa-ana', account: 'wa', network: 'WhatsApp', title: 'Ana Costa', type: 'single', handle: '+5511990000004', participants: 2, unread: 0, mentions: 0,
      msgs: [[3 * D, false, 'Oi Rick, tudo bem?'], [2 * D, true, 'Tudo ótimo! E aí, conseguiu ver a proposta que te mandei?']] },
    { id: 'wa-familia', account: 'wa', network: 'WhatsApp', title: 'Família ❤️', type: 'group', handle: null, participants: 12, unread: 47, mentions: 2,
      msgs: [[6 * H, false, 'Gente, almoço domingo?'], [5 * H, false, '@Rick você vem?', true], [4 * H, false, 'Leva a sobremesa'], [2 * H, false, 'Rick, confirma pra gente', true], [H, false, 'kkkkk']] },
    { id: 'wa-condominio', account: 'wa', network: 'WhatsApp', title: 'Condomínio Bloco B', type: 'group', handle: null, participants: 140, muted: true, unread: 120, mentions: 0,
      msgs: [[2 * D, false, 'Alguém sabe da obra do elevador?'], [D, false, 'Reunião na terça'], [30, false, 'Achei uma chave no hall']] },
    { id: 'wa-devs', account: 'wa', network: 'WhatsApp', title: 'Devs Floripa', type: 'group', handle: null, participants: 85, unread: 230, mentions: 1,
      msgs: [[3 * D, true, 'Alguém já usou sql.js em produção?'], [3 * D - 30, false, 'Já! Funciona bem pra single-user'], [D, false, '@Rick você ainda tá procurando freela?', true], [10 * H, false, 'Meetup sexta, quem vai?']] },
    { id: 'ig-lucas', account: 'ig1', network: 'Instagram', title: 'lucas.viaja', type: 'single', handle: 'lucas.viaja', participants: 2, unread: 3, mentions: null,
      msgs: [[40 * D, false, 'Mano que foto incrível dessa praia!'], [40 * D - 5, false, 'Onde é isso?'], [39 * D, false, 'Me passa as dicas depois']] },
    { id: 'ig-carol', account: 'ig1', network: 'Instagram', title: 'carol.design', type: 'single', handle: 'carol.design', participants: 2, unread: 1, mentions: null,
      msgs: [[20 * D, true, 'Oi Carol, adorei seu portfólio'], [12 * D, false, 'Obrigada!! Você faria um freela de front comigo?']] },
    { id: 'ig-bia', account: 'ig1', network: 'Instagram', title: 'bia_runner', type: 'single', handle: 'bia_runner', participants: 2, unread: 0, mentions: null,
      msgs: [[7 * D, false, 'kkkkkk'], [7 * D - 2, true, 'hahaha demais']] },
    { id: 'ig-trilha', account: 'ig1', network: 'Instagram', title: 'Trilha do fim de semana', type: 'group', handle: null, participants: 6, unread: 18, mentions: null,
      msgs: [[2 * D, false, 'Sábado 7h no ponto de encontro'], [D, false, 'Rick vai levar o carro?'], [20 * H, false, 'Alguém tem barraca extra?']] },
    { id: 'ig2-loja', account: 'ig2', network: 'Instagram', title: 'cliente.camila', type: 'single', handle: 'cliente.camila', participants: 2, unread: 1, mentions: null,
      msgs: [[4 * D, false, 'Oi! Vocês fazem site para restaurante?']] },
    { id: 'li-recruiter', account: 'li', network: 'LinkedIn', title: 'Fernanda Rocha (Tech Recruiter)', type: 'single', handle: 'fernanda-rocha-tr', participants: 2, unread: 1, mentions: 0,
      msgs: [[6 * D, false, 'Olá Ricardo! Tenho uma vaga de Senior Full Stack remota. Podemos conversar esta semana?']] },
    { id: 'li-ex', account: 'li', network: 'LinkedIn', title: 'Bruno Martins', type: 'single', handle: 'bruno-martins', participants: 2, unread: 0, mentions: 0,
      msgs: [[15 * D, false, 'Parabéns pelo novo projeto!'], [15 * D - 60, true, 'Valeu Bruno! Vamos tomar um café quando você estiver em SP?']] },
    { id: 'li-thanks', account: 'li', network: 'LinkedIn', title: 'Juliana Prado', type: 'single', handle: 'juliana-prado', participants: 2, unread: 0, mentions: 0,
      msgs: [[25 * D, true, 'Obrigado pela indicação, Ju!'], [25 * D - 30, false, 'Imagina! Sucesso 🙌']] }
  ]
  // Volume extra (backlog antigo do Instagram) para testar paginação e triagem em lote.
  for (let i = 1; i <= 24; i++) {
    base.push({
      id: `ig-old-${i}`, account: 'ig1', network: 'Instagram', title: `seguidor_${String(i).padStart(2, '0')}`, type: 'single', handle: `seguidor_${i}`,
      participants: 2, unread: 1 + (i % 3), mentions: null,
      msgs: [[(60 + i * 5) * D, false, i % 4 === 0 ? 'Oi! Você ainda faz consultoria?' : i % 4 === 1 ? 'Amei o conteúdo 🔥' : i % 4 === 2 ? 'Pode me indicar um curso de React?' : 'Valeu pela dica!']]
    })
  }
  return base
}

const iso = (minutesAgo: number, now: number): string => new Date(now - minutesAgo * 60_000).toISOString()

export function createMockControl(): MockControl {
  return { offline: false, authError: false, pageSize: 25, noMentions: false, sent: [], edited: [], deleted: [], hiddenAccounts: [], emit: null }
}

export type MockProvider = ChatProvider & {
  control: MockControl
  /** Testes/demonstração: injeta uma mensagem recebida (opcionalmente mencionando você). */
  receive: (chatId: string, text: string, mentionMe?: boolean, id?: string) => RemoteMessage
}

export function createMockProvider(control: MockControl = createMockControl()): MockProvider {
  const now = Date.now()
  const chats = defs()
  // mensagens em memória: chatId → mensagens (antiga → recente)
  const store = new Map<string, RemoteMessage[]>()
  const selfOf = (acc: string): string => SELF[acc as keyof typeof SELF] ?? 'me'
  for (const c of chats) {
    store.set(
      c.id,
      c.msgs.map(([ago, mine, text, mention], i) => ({
        id: `${c.id}-m${i + 1}`,
        chatId: c.id,
        senderId: mine ? selfOf(c.account) : `${c.id}-p${(i % 3) + 1}`,
        senderName: mine ? SELF_NAME : c.type === 'group' ? ['Tia Lu', 'Carlos', 'Dani'][i % 3] : c.title,
        isMine: mine,
        timestamp: iso(ago, now),
        sortKey: String(now - ago * 60_000).padStart(16, '0'),
        text,
        type: 'TEXT',
        attachments: [],
        mentions: c.mentions === null ? null : mention ? [selfOf(c.account)] : [],
        replyToId: null,
        edited: false,
        deleted: false,
        reactions: [],
        isUnread: !mine
      }))
    )
  }

  const guard = (): void => {
    if (control.offline) throw new ProviderUnavailableError('Demonstração: provedor simulado offline.')
    if (control.authError) throw new ProviderAuthError('Demonstração: token inválido (simulado).')
  }

  const toChat = (c: MockChatDef): RemoteChat => {
    const msgs = store.get(c.id) ?? []
    const last = msgs[msgs.length - 1] ?? null
    return {
      remoteId: c.id,
      accountId: c.account,
      network: c.network,
      title: c.title,
      type: c.type,
      imgUrl: null,
      participantCount: c.participants,
      participants: [],
      peerHandle: c.handle,
      unreadCount: c.unread,
      unreadMentions: control.noMentions ? null : c.mentions,
      lastActivity: last?.timestamp ?? null,
      preview: last,
      isMuted: !!c.muted,
      isArchived: false,
      capabilities: {}
    }
  }

  const sorted = (): MockChatDef[] =>
    [...chats].sort((a, b) => {
      const la = store.get(a.id)?.slice(-1)[0]?.timestamp ?? ''
      const lb = store.get(b.id)?.slice(-1)[0]?.timestamp ?? ''
      return lb.localeCompare(la)
    })

  const caps: ChatProviderCapabilities = {
    readMessages: true,
    sendMessages: true,
    markAsRead: true,
    markAsUnread: true,
    mentions: true,
    attachments: false,
    realtimeEvents: true,
    search: true,
    reactions: false,
    replyTo: true,
    editMessages: true,
    deleteMessages: true
  }

  return {
    id: 'mock',
    label: 'Demonstração (dados fictícios)',
    demo: true,
    control,
    capabilities: () => ({ ...caps, mentions: !control.noMentions }),
    async test() {
      if (control.offline) return { ok: false, message: 'Demonstração: provedor simulado offline.' }
      if (control.authError) return { ok: false, message: 'Demonstração: token inválido (simulado).' }
      return { ok: true, message: 'Provedor de demonstração ativo (dados fictícios).', version: 'mock' }
    },
    async listAccounts(): Promise<RemoteAccount[]> {
      guard()
      const all: RemoteAccount[] = [
        { remoteId: 'wa', network: 'WhatsApp', displayName: 'WhatsApp pessoal', selfId: SELF.wa, selfName: SELF_NAME, status: 'connected' },
        { remoteId: 'ig1', network: 'Instagram', displayName: '@rick.pessoal', selfId: SELF.ig1, selfName: SELF_NAME, status: 'connected' },
        { remoteId: 'ig2', network: 'Instagram', displayName: '@rick.studio', selfId: SELF.ig2, selfName: SELF_NAME, status: 'connected' },
        { remoteId: 'li', network: 'LinkedIn', displayName: 'Ricardo (LinkedIn)', selfId: SELF.li, selfName: 'Ricardo', status: 'connected' }
      ]
      return all.filter((a) => !control.hiddenAccounts.includes(a.remoteId))
    },
    async listChats({ accountIds, cursor, limit }): Promise<Page<RemoteChat>> {
      guard()
      const size = Math.min(limit ?? control.pageSize, control.pageSize)
      const list = sorted().filter((c) => !accountIds?.length || accountIds.includes(c.account))
      const start = cursor ? Number(cursor) : 0
      const slice = list.slice(start, start + size)
      const next = start + size
      return { items: slice.map(toChat), hasMore: next < list.length, olderCursor: next < list.length ? String(next) : null }
    },
    async getChat(remoteId) {
      guard()
      const c = chats.find((x) => x.id === remoteId)
      return c ? toChat(c) : null
    },
    async listMessages(remoteChatId, { cursor }): Promise<Page<RemoteMessage>> {
      guard()
      const all = store.get(remoteChatId) ?? []
      const end = cursor ? Number(cursor) : all.length
      const start = Math.max(0, end - 20)
      return { items: all.slice(start, end), hasMore: start > 0, olderCursor: start > 0 ? String(start) : null }
    },
    async sendMessage(remoteChatId, text, replyToId) {
      guard()
      const list = store.get(remoteChatId)
      const c = chats.find((x) => x.id === remoteChatId)
      if (!list || !c) throw new Error('Conversa não encontrada.')
      const ts = Date.now()
      const msg: RemoteMessage = {
        id: `${remoteChatId}-s${list.length + 1}`,
        chatId: remoteChatId,
        senderId: selfOf(c.account),
        senderName: SELF_NAME,
        isMine: true,
        timestamp: new Date(ts).toISOString(),
        sortKey: String(ts).padStart(16, '0'),
        text,
        type: 'TEXT',
        attachments: [],
        mentions: [],
        replyToId: replyToId ?? null,
        edited: false,
        deleted: false,
        reactions: [],
        isUnread: false
      }
      list.push(msg)
      c.unread = 0
      c.mentions = c.mentions === null ? null : 0
      control.sent.push({ chatId: remoteChatId, text, replyTo: replyToId ?? null })
      control.emit?.({ type: 'message.upserted', chatId: remoteChatId, messageIds: [msg.id] })
      return { pendingId: msg.id }
    },
    async editMessage(remoteChatId, messageId, text) {
      guard()
      const m = store.get(remoteChatId)?.find((x) => x.id === messageId)
      if (!m) throw new Error('Mensagem não encontrada.')
      if (!m.isMine) throw new Error('Só dá para editar mensagens suas.')
      m.text = text
      m.edited = true
      control.edited.push({ chatId: remoteChatId, messageId, text })
      control.emit?.({ type: 'message.upserted', chatId: remoteChatId, messageIds: [messageId] })
    },
    async deleteMessage(remoteChatId, messageId, forEveryone) {
      guard()
      const list = store.get(remoteChatId)
      const i = list?.findIndex((x) => x.id === messageId) ?? -1
      if (!list || i < 0) throw new Error('Mensagem não encontrada.')
      if (!list[i].isMine) throw new Error('Só dá para apagar mensagens suas.')
      // "para todos" deixa o marcador "mensagem apagada"; "só para mim" some da conversa
      if (forEveryone) list[i] = { ...list[i], text: '', deleted: true, attachments: [] }
      else list.splice(i, 1)
      control.deleted.push({ chatId: remoteChatId, messageId, forEveryone })
      control.emit?.({ type: 'message.deleted', chatId: remoteChatId, messageIds: [messageId] })
    },
    async markRead(remoteChatId) {
      guard()
      const c = chats.find((x) => x.id === remoteChatId)
      if (c) {
        c.unread = 0
        if (c.mentions !== null) c.mentions = 0
      }
    },
    async markUnread(remoteChatId) {
      guard()
      const c = chats.find((x) => x.id === remoteChatId)
      if (c && c.unread === 0) c.unread = 1
    },
    async searchMessages(query, { chatIds, limit }) {
      guard()
      const q = query.toLowerCase()
      const out: RemoteMessage[] = []
      for (const [cid, msgs] of store) {
        if (chatIds?.length && !chatIds.includes(cid)) continue
        for (const m of msgs) if (m.text.toLowerCase().includes(q)) out.push(m)
      }
      return out.sort((a, b) => b.sortKey.localeCompare(a.sortKey)).slice(0, limit ?? 20)
    },
    receive(chatId: string, text: string, mentionMe = false, id?: string): RemoteMessage {
      const list = store.get(chatId)
      const c = chats.find((x) => x.id === chatId)
      if (!list || !c) throw new Error('Conversa não encontrada.')
      const ts = Date.now()
      const msg: RemoteMessage = {
        id: id ?? `${chatId}-r${list.length + 1}`,
        chatId,
        senderId: `${chatId}-p1`,
        senderName: c.type === 'group' ? 'Tia Lu' : c.title,
        isMine: false,
        timestamp: new Date(ts).toISOString(),
        sortKey: String(ts).padStart(16, '0'),
        text,
        type: 'TEXT',
        attachments: [],
        mentions: c.mentions === null ? null : mentionMe ? [selfOf(c.account)] : [],
        replyToId: null,
        edited: false,
        deleted: false,
        reactions: [],
        isUnread: true
      }
      // duplicada (mesmo id) substitui em vez de acrescentar — como um provedor real
      const dup = list.findIndex((m) => m.id === msg.id)
      if (dup >= 0) list[dup] = msg
      else list.push(msg)
      if (dup < 0) {
        c.unread += 1
        if (mentionMe && c.mentions !== null) c.mentions += 1
      }
      control.emit?.({ type: 'message.upserted', chatId, messageIds: [msg.id] })
      return msg
    },
    subscribe(onEvent: (e: ProviderEvent) => void, onState: (s: RealtimeState) => void) {
      control.emit = onEvent
      onState('on')
      return () => {
        control.emit = null
        onState('off')
      }
    }
  }
}
