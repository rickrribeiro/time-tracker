/**
 * Central de Mensagens: tipos normalizados, independentes do provedor (Beeper, conector
 * próprio de WhatsApp, Matrix, Unipile…). UI e serviços só conhecem estes contratos.
 *
 * Identidade: uma conversa local tem `id` (inteiro do rickOS) e `key` = `<provedor>:<id remoto>`.
 * Os dados organizacionais (pessoa, tags, prioridade, triagem, lembretes, notas) ficam
 * presos ao `id` local; trocar de provedor só cria novas `key`, e a reconciliação move
 * a organização para a conversa nova quando o identificador do contato remoto bate.
 */

/** Rede normalizada (minúsculas). Desconhecidas viram o nome da rede do provedor normalizado. */
export type ChatNetwork = 'whatsapp' | 'instagram' | 'linkedin' | 'telegram' | 'signal' | 'messenger' | 'imessage' | 'sms' | 'discord' | 'slack' | 'x' | 'matrix' | 'demo' | string

export const NETWORK_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '🟢', color: '#25d366' },
  instagram: { label: 'Instagram', icon: '📸', color: '#e1306c' },
  linkedin: { label: 'LinkedIn', icon: '💼', color: '#0a66c2' },
  telegram: { label: 'Telegram', icon: '✈️', color: '#2aabee' },
  signal: { label: 'Signal', icon: '🔵', color: '#3a76f0' },
  messenger: { label: 'Messenger', icon: '💬', color: '#0084ff' },
  imessage: { label: 'iMessage', icon: '🍏', color: '#34c759' },
  sms: { label: 'SMS', icon: '📱', color: '#8e8e93' },
  discord: { label: 'Discord', icon: '🎮', color: '#5865f2' },
  slack: { label: 'Slack', icon: '🧵', color: '#4a154b' },
  x: { label: 'X', icon: '✖️', color: '#888888' },
  matrix: { label: 'Matrix', icon: '🟩', color: '#0dbd8b' }
}

export function networkInfo(n: string): { label: string; icon: string; color: string } {
  return NETWORK_LABELS[n] ?? { label: n ? n[0].toUpperCase() + n.slice(1) : 'Outra', icon: '💭', color: '#888888' }
}

/** Normaliza o nome/identificador de rede de qualquer provedor. */
export function normalizeNetwork(raw: string | null | undefined): ChatNetwork {
  const s = (raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!s) return 'outra'
  if (s.includes('whatsapp')) return 'whatsapp'
  if (s.includes('instagram') || s === 'ig') return 'instagram'
  if (s.includes('linkedin')) return 'linkedin'
  if (s.includes('telegram')) return 'telegram'
  if (s.includes('signal')) return 'signal'
  if (s.includes('messenger') || s.includes('facebook') || s === 'meta') return 'messenger'
  if (s.includes('imessage')) return 'imessage'
  if (s.includes('gmessages') || s.includes('googlemessages') || s === 'sms') return 'sms'
  if (s.includes('discord')) return 'discord'
  if (s.includes('slack')) return 'slack'
  if (s === 'x' || s.includes('twitter')) return 'x'
  if (s.includes('beeper') || s.includes('matrix')) return 'matrix'
  return s
}

/** O que um provedor (ou uma conta/conversa dele) sabe fazer. Nunca presuma suporte. */
export interface ChatProviderCapabilities {
  readMessages: boolean
  sendMessages: boolean
  markAsRead: boolean
  markAsUnread: boolean
  mentions: boolean
  attachments: boolean
  realtimeEvents: boolean
  search: boolean
  reactions: boolean
  replyTo: boolean
}

export type ProviderState = 'disabled' | 'idle' | 'syncing' | 'connected' | 'offline' | 'error' | 'unconfigured'

export interface ChatsStatus {
  enabled: boolean
  providerId: string
  providerLabel: string
  /** Provedor de demonstração: os dados são fictícios e a UI precisa avisar. */
  demo: boolean
  state: ProviderState
  message: string | null
  lastSyncAt: string | null
  lastError: string | null
  realtime: 'on' | 'off' | 'connecting' | 'unsupported'
  /** Modo de conexão com o provedor (Beeper: direto ou via agente local). */
  mode: string
  agentOnline: boolean
  capabilities: ChatProviderCapabilities
  /** Progresso da sincronização em andamento (conversas processadas). */
  progress: { done: number; total: number | null } | null
}

export interface ChatAccount {
  key: string
  providerId: string
  remoteId: string
  network: ChatNetwork
  displayName: string
  selfName: string | null
  status: string
  syncEnabled: boolean
  lastSeenAt: string | null
  chatCount: number
}

/** Estado de resposta (organizacional). `none` = não requer resposta. */
export type ReplyState = 'needs_reply' | 'waiting' | 'none' | 'resolved' | 'snoozed'
export type ManualReplyState = Exclude<ReplyState, 'snoozed'> | null
export type ChatPriority = 'alta' | 'normal' | 'baixa'

export const REPLY_STATE_LABELS: Record<ReplyState, string> = {
  needs_reply: 'Preciso responder',
  waiting: 'Aguardando resposta',
  none: 'Não requer resposta',
  resolved: 'Resolvido',
  snoozed: 'Adiado'
}

export interface ChatLabel {
  id: number
  name: string
  color: string
  chatCount?: number
}

export interface ChatSummary {
  id: number
  key: string
  providerId: string
  accountKey: string
  remoteId: string
  network: ChatNetwork
  title: string
  type: 'single' | 'group'
  imgUrl: string | null
  participantCount: number | null
  /** null = provedor não informa (não é zero). */
  unreadCount: number | null
  unreadMentions: number | null
  /** true quando a contagem de menções é estimativa local (provedor não informa). */
  mentionsEstimated: boolean
  mentionsReviewed: boolean
  lastActivity: string | null
  lastMessagePreview: string | null
  lastMessageFromMe: boolean | null
  lastMessageSender: string | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  /** Mensagem recebida mais antiga ainda sem resposta minha (quando conhecida). */
  pendingSince: string | null
  isMuted: boolean
  isArchivedRemote: boolean
  peerHandle: string | null
  /** Conversa de provedor/conta inativa: dados podem estar desatualizados. */
  stale: boolean
  /** Organização (do rickOS). */
  contactId: number | null
  contactName: string | null
  contactPriority: ChatPriority | null
  contactVip: boolean
  priority: ChatPriority | null
  replyState: ReplyState
  replyStateSource: 'manual' | 'auto'
  replyReason: string | null
  snoozeUntil: string | null
  reminderNote: string | null
  reminderDue: boolean
  /** Conversa adiada que recebeu mensagem nova (reabrir/destacar). */
  reopened: boolean
  notes: string | null
  labels: ChatLabel[]
  score: number
  suggestedPriority: ChatPriority
  todoCount: number
}

export interface ChatAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'unknown'
  fileName: string | null
  mimeType: string | null
  size: number | null
  /** URL interna do rickOS (proxy autenticado) quando o provedor permite baixar. */
  url: string | null
  width?: number | null
  height?: number | null
}

export interface ChatMessage {
  id: string
  chatId: number
  senderId: string
  senderName: string
  isMine: boolean
  timestamp: string
  text: string
  type: string
  attachments: ChatAttachment[]
  /** Menciona você (dado do provedor) — `mentionEstimated` quando inferido do texto. */
  mentionsMe: boolean
  mentionEstimated: boolean
  replyToId: string | null
  edited: boolean
  deleted: boolean
  reactions: { emoji: string; count: number; mine: boolean }[]
  sortKey: string
  pending?: boolean
}

export interface MessagePage {
  items: ChatMessage[]
  hasMore: boolean
  cursor: string | null
  /** O provedor pode não ter o histórico antigo: ausência ≠ não existe. */
  partialHistory: boolean
  /** Dados vindos do cache local (provedor indisponível). */
  fromCache: boolean
}

export type ChatStateFilter = 'all' | 'unread' | 'needs_reply' | 'waiting' | 'mentions' | 'reminders' | 'high' | 'snoozed' | 'resolved' | 'none'

export interface ChatFilter {
  networks?: string[]
  accountKeys?: string[]
  state?: ChatStateFilter
  type?: 'all' | 'single' | 'group'
  /** Atividade nas últimas N horas. */
  withinHours?: number | null
  from?: string | null
  to?: string | null
  /** Pendente (sem resposta minha) há mais de N dias. */
  pendingOlderThanDays?: number | null
  person?: 'all' | 'linked' | 'unlinked'
  contactId?: number | null
  /** Tags da conversa (qualquer uma). */
  labelIds?: number[]
  /** Tags da pessoa vinculada (qualquer uma). */
  personLabelIds?: number[]
  search?: string
  includeArchived?: boolean
  sort?: 'priority' | 'recent' | 'oldest_pending'
}

export interface ChatListPage {
  items: ChatSummary[]
  total: number
  offset: number
  hasMore: boolean
}

export interface ChatCounts {
  /** Conversas com não lidas (exato quando o provedor informa). */
  unreadChats: number
  /** Soma das mensagens não lidas informadas pelo provedor. */
  unreadMessages: number
  needsReply: number
  waiting: number
  mentionChats: number
  mentionCount: number
  mentionsEstimated: boolean
  high: number
  snoozed: number
  remindersDue: number
  total: number
  byNetwork: Record<string, { chats: number; unread: number }>
}

export interface ChatPreset {
  id: string
  name: string
  filter: ChatFilter
  builtin?: boolean
}

export interface ChatTemplate {
  id: number
  title: string
  body: string
}

export interface RadarItem {
  kind: 'vip_waiting' | 'old_unread' | 'forgotten' | 'mentions' | 'reminder_due' | 'professional' | 'no_contact' | 'reopened'
  text: string
  chatId: number | null
  contactId: number | null
  weight: number
}

export interface RadarView {
  items: RadarItem[]
  summary: string[]
}

export interface ContactSuggestion {
  contactId: number
  name: string
  reason: string
  score: number
}

export interface ContactChatLink {
  chatId: number
  network: ChatNetwork
  title: string
  lastActivity: string | null
  replyState: ReplyState
  unreadCount: number | null
}

export type AiStyle = 'natural' | 'curto' | 'descontraido' | 'profissional' | 'elaborado'

export const AI_STYLE_LABELS: Record<AiStyle, string> = {
  natural: 'Natural',
  curto: 'Curto',
  descontraido: 'Descontraído',
  profissional: 'Profissional',
  elaborado: 'Mais elaborado'
}

export interface AiSuggestRequest {
  chatId: number
  /** SÓ estas mensagens vão para a IA (ids do provedor). */
  messageIds: string[]
  mode: 'per_message' | 'single'
  style: AiStyle
  language?: string | null
  /** Inclui as notas/contexto da pessoa vinculada (opt-in explícito). */
  includePersonNotes?: boolean
  extraInstruction?: string | null
  /** Modelo de resposta rápida para a IA adaptar. */
  templateId?: number | null
}

export interface AiSuggestion {
  /** Mensagem respondida (modo per_message) ou null (resposta única). */
  messageId: string | null
  reply: string
  needsReply: boolean | null
  priority: ChatPriority | null
  reason: string | null
}

export interface AiSuggestResult {
  chatId: number
  suggestions: AiSuggestion[]
  error: string | null
}

export interface AiSummary {
  chatId: number
  text: string
  partial: boolean
  messageCount: number
}

export interface ChatsConfig {
  enabled: boolean
  providerId: string
  beeperMode: 'direct' | 'agent'
  beeperUrl: string
  hasBeeperToken: boolean
  hasAgentKey: boolean
  syncAuto: boolean
  syncIntervalSec: number
  realtime: boolean
  storePreviews: boolean
  retentionDays: number
  initialLimit: number
  markReadOnOpen: boolean
  aiModel: string
  aiStyleInstructions: string
  homeWidget: boolean
  notifyReminders: boolean
  notifyVipWaiting: boolean
  notifyMentions: boolean
  homeAlerts: string[]
  dailyReviewSize: number
  noContactDays: number
  priorityWeights: PriorityWeights
  /** Tags que contam como oportunidade profissional (radar/priorização). */
  professionalLabels: string[]
}

export interface PriorityWeights {
  mention: number
  vip: number
  manualHigh: number
  manualLow: number
  question: number
  professional: number
  recency: number
  agePerDay: number
  bigGroupPenalty: number
  mutedPenalty: number
}

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  mention: 50,
  vip: 40,
  manualHigh: 40,
  manualLow: -30,
  question: 15,
  professional: 20,
  recency: 20,
  agePerDay: 1,
  bigGroupPenalty: 15,
  mutedPenalty: 25
}

export const PROVIDERS_INFO: { id: string; label: string; demo?: boolean }[] = [
  { id: 'beeper', label: 'Beeper Desktop API' },
  { id: 'mock', label: 'Demonstração (dados fictícios)', demo: true }
]

export const NO_CAPABILITIES: ChatProviderCapabilities = {
  readMessages: false,
  sendMessages: false,
  markAsRead: false,
  markAsUnread: false,
  mentions: false,
  attachments: false,
  realtimeEvents: false,
  search: false,
  reactions: false,
  replyTo: false
}
