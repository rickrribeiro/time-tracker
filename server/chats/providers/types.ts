import type { ChatProviderCapabilities } from '../../../shared/chats'

/**
 * Contrato de um provedor de mensagens. Tudo aqui é "remoto": identificadores e formatos
 * do provedor normalizados para o mínimo que o rickOS precisa. Nenhum serviço ou tela
 * importa nada específico do Beeper; para trocar de provedor basta outra implementação.
 *
 * Contagens que o provedor não informa vêm como `null` (desconhecido), nunca 0.
 */
export interface RemoteAccount {
  remoteId: string
  network: string
  displayName: string
  selfId: string | null
  selfName: string | null
  status: string
}

export interface RemoteParticipant {
  id: string
  name: string
  handle: string | null
  isSelf: boolean
}

export interface RemoteMessage {
  id: string
  chatId: string
  senderId: string
  senderName: string | null
  isMine: boolean
  timestamp: string
  sortKey: string
  text: string
  type: string
  attachments: RemoteAttachment[]
  /** IDs mencionados (null = provedor não informa menções). */
  mentions: string[] | null
  replyToId: string | null
  edited: boolean
  deleted: boolean
  reactions: { emoji: string; participantId: string }[]
  isUnread: boolean | null
}

export interface RemoteAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'unknown'
  fileName: string | null
  mimeType: string | null
  size: number | null
  /** Referência opaca para `fetchAttachment` (nunca enviada crua ao front). */
  ref: string | null
  width: number | null
  height: number | null
}

export interface RemoteChat {
  remoteId: string
  accountId: string
  network: string
  title: string
  type: 'single' | 'group'
  imgUrl: string | null
  participantCount: number | null
  participants: RemoteParticipant[]
  /** Identificador estável do outro lado em conversas individuais (telefone E.164, @usuário…). */
  peerHandle: string | null
  unreadCount: number | null
  unreadMentions: number | null
  lastActivity: string | null
  preview: RemoteMessage | null
  isMuted: boolean
  isArchived: boolean
  capabilities: Partial<ChatProviderCapabilities>
}

export interface Page<T> {
  items: T[]
  hasMore: boolean
  /** Cursor para a página MAIS ANTIGA seguinte (null = fim). */
  olderCursor: string | null
}

export interface ProviderTestResult {
  ok: boolean
  message: string
  version?: string | null
}

export type ProviderEvent =
  | { type: 'chat.upserted'; chatIds: string[] }
  | { type: 'chat.deleted'; chatIds: string[] }
  | { type: 'message.upserted'; chatId: string; messageIds: string[] }
  | { type: 'message.deleted'; chatId: string; messageIds: string[] }

export type RealtimeState = 'connecting' | 'on' | 'off'

export interface ChatProvider {
  readonly id: string
  readonly label: string
  readonly demo: boolean
  capabilities(): ChatProviderCapabilities
  test(): Promise<ProviderTestResult>
  listAccounts(): Promise<RemoteAccount[]>
  /** Conversas da mais recente para a mais antiga. */
  listChats(opts: { accountIds?: string[]; cursor?: string | null; limit?: number }): Promise<Page<RemoteChat>>
  getChat(remoteId: string): Promise<RemoteChat | null>
  /** Mensagens (a ordem do retorno é livre; o serviço ordena por sortKey). */
  listMessages(remoteChatId: string, opts: { cursor?: string | null }): Promise<Page<RemoteMessage>>
  sendMessage(remoteChatId: string, text: string, replyToId?: string | null): Promise<{ pendingId: string | null }>
  markRead?(remoteChatId: string, upToMessageId?: string | null): Promise<void>
  markUnread?(remoteChatId: string): Promise<void>
  searchMessages?(query: string, opts: { accountIds?: string[]; chatIds?: string[]; limit?: number }): Promise<RemoteMessage[]>
  fetchAttachment?(ref: string): Promise<{ contentType: string; body: Buffer }>
  /** Eventos em tempo real; devolve a função para encerrar. */
  subscribe?(onEvent: (e: ProviderEvent) => void, onState: (s: RealtimeState, err?: string) => void): () => void
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderUnavailableError'
  }
}

export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderAuthError'
  }
}
