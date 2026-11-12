import type {
  AiSuggestRequest,
  AiSuggestResult,
  AiSummary,
  ChatAccount,
  ChatCounts,
  ChatFilter,
  ChatLabel,
  ChatListPage,
  ChatMessage,
  ChatPreset,
  ChatPriority,
  ChatsConfig,
  ChatsStatus,
  ChatSummary,
  ChatTemplate,
  ContactChatLink,
  ContactSuggestion,
  ManualReplyState,
  MessagePage,
  RadarView
} from '../../../shared/chats'

export interface AgentDetails {
  online: boolean
  lastSeen: string | null
  version: string | null
  beeper: string | null
}

export interface ChatsConfigPatch extends Partial<ChatsConfig> {
  beeperToken?: string
}

export interface ContactLite {
  id: number
  name: string
  priority: string | null
  vip: number | null
  context: string | null
  interests: string | null
  lastContactAt: string | null
}

export interface SearchHit {
  chat: ChatSummary | null
  chatKey: string
  message: ChatMessage
}

/** `window.api.chats` — canais `chats:*` (server/chats/rpc.ts). */
export interface ChatsApi {
  status: () => Promise<ChatsStatus>
  config: () => Promise<{ config: ChatsConfig; agent: AgentDetails }>
  saveConfig: (patch: ChatsConfigPatch) => Promise<{ config: ChatsConfig; status: ChatsStatus }>
  test: () => Promise<{ ok: boolean; message: string; version?: string | null }>
  agentKey: () => Promise<{ key: string }>
  agentStatus: () => Promise<AgentDetails>
  syncNow: (full?: boolean) => Promise<ChatsStatus>
  accounts: () => Promise<ChatAccount[]>
  setAccountSync: (key: string, enabled: boolean) => Promise<void>
  clearCache: () => Promise<{ removed: number; kept: number }>
  disconnect: () => Promise<ChatsStatus>
  list: (filter: ChatFilter, offset?: number, limit?: number) => Promise<ChatListPage>
  counts: () => Promise<ChatCounts>
  get: (id: number) => Promise<ChatSummary | null>
  radar: () => Promise<RadarView>
  networks: () => Promise<{ id: string; label: string; icon: string; color: string; chats: number; unread: number }[]>
  messages: (id: number, cursor?: string | null) => Promise<MessagePage>
  send: (id: number, text: string, replyToId?: string | null) => Promise<{ ok: true; pendingId: string | null }>
  markRead: (id: number, read: boolean) => Promise<void>
  search: (query: string, chatId?: number | null) => Promise<{ results: SearchHit[]; partial: boolean; supported: boolean }>
  pendingMessages: (id: number) => Promise<ChatMessage[]>
  setState: (ids: number[], state: ManualReplyState | 'auto') => Promise<void>
  snooze: (ids: number[], until: string | null, note?: string | null, reopenOnMessage?: boolean) => Promise<void>
  setPriority: (ids: number[], priority: ChatPriority | null) => Promise<void>
  setNotes: (id: number, notes: string | null) => Promise<void>
  reviewMentions: (ids: number[]) => Promise<void>
  suggestContacts: (id: number) => Promise<ContactSuggestion[]>
  link: (ids: number[], contactId: number | null) => Promise<void>
  createContact: (id: number, name: string) => Promise<{ contactId: number }>
  contactChats: (contactId: number) => Promise<ContactChatLink[]>
  contactNetworks: () => Promise<Record<number, { network: string; chatId: number; pending: boolean }[]>>
  contacts: () => Promise<ContactLite[]>
  setContactPriority: (contactId: number, priority: ChatPriority, vip: boolean) => Promise<void>
  labels: () => Promise<ChatLabel[]>
  saveLabel: (id: number | null, name: string, color: string) => Promise<ChatLabel>
  deleteLabel: (id: number) => Promise<void>
  setLabels: (entity: 'chat' | 'contact', ids: number[], add: number[], remove: number[]) => Promise<void>
  contactLabels: (contactId: number) => Promise<ChatLabel[]>
  createTodo: (id: number, title: string, dueDate: string | null, messageId: string | null) => Promise<{ todoId: number }>
  todos: (id: number) => Promise<{ id: number; title: string; status: string; dueDate: string | null }[]>
  presets: () => Promise<ChatPreset[]>
  savePreset: (name: string, filter: ChatFilter) => Promise<void>
  deletePreset: (id: string) => Promise<void>
  templates: () => Promise<ChatTemplate[]>
  saveTemplate: (id: number | null, title: string, body: string) => Promise<void>
  deleteTemplate: (id: number) => Promise<void>
  aiSuggest: (req: AiSuggestRequest) => Promise<AiSuggestResult>
  aiBatch: (reqs: AiSuggestRequest[]) => Promise<AiSuggestResult[]>
  aiSummarize: (id: number, messageIds: string[], includeNotes?: boolean) => Promise<AiSummary>
}

/** Nomes dos métodos → canal `chats:<método>`. */
export const CHATS_METHODS: (keyof ChatsApi)[] = [
  'status', 'config', 'saveConfig', 'test', 'agentKey', 'agentStatus', 'syncNow', 'accounts', 'setAccountSync', 'clearCache', 'disconnect',
  'list', 'counts', 'get', 'radar', 'networks', 'messages', 'send', 'markRead', 'search', 'pendingMessages', 'setState', 'snooze',
  'setPriority', 'setNotes', 'reviewMentions', 'suggestContacts', 'link', 'createContact', 'contactChats', 'contactNetworks', 'contacts',
  'setContactPriority', 'labels', 'saveLabel', 'deleteLabel', 'setLabels', 'contactLabels', 'createTodo', 'todos', 'presets', 'savePreset',
  'deletePreset', 'templates', 'saveTemplate', 'deleteTemplate', 'aiSuggest', 'aiBatch', 'aiSummarize'
]
