import type { ChatsConfig, PriorityWeights } from '../../shared/chats'
import { DEFAULT_PRIORITY_WEIGHTS } from '../../shared/chats'
import { getAllSettings, setSetting } from '../database/queries'
import { decodeSecret, encodeSecret } from '../services/secrets'
import { validateBeeperUrl } from './transport'

/** Chaves `chats_*` na tabela settings (o framework de configurações já existente). */
export const K = {
  enabled: 'chats_enabled',
  provider: 'chats_provider',
  beeperMode: 'chats_beeper_mode',
  beeperUrl: 'chats_beeper_url',
  beeperToken: 'chats_beeper_token',
  agentKey: 'chats_agent_key',
  syncAuto: 'chats_sync_auto',
  syncInterval: 'chats_sync_interval_sec',
  realtime: 'chats_realtime',
  storePreviews: 'chats_store_previews',
  retentionDays: 'chats_retention_days',
  initialLimit: 'chats_initial_limit',
  markReadOnOpen: 'chats_mark_read_on_open',
  aiModel: 'chats_ai_model',
  aiStyle: 'chats_ai_style_instructions',
  homeWidget: 'chats_home_widget',
  notifyReminders: 'chats_notify_reminders',
  notifyVip: 'chats_notify_vip',
  notifyMentions: 'chats_notify_mentions',
  homeAlerts: 'chats_home_alerts',
  dailyReview: 'chats_daily_review_size',
  noContactDays: 'chats_no_contact_days',
  weights: 'chats_priority_weights',
  professional: 'chats_professional_labels',
  presets: 'chats_presets',
  lastSync: 'chats_last_sync',
  lastError: 'chats_last_error'
} as const

export const DEFAULT_BEEPER_URL = 'http://127.0.0.1:23373'
const ALL_HOME_ALERTS = ['vip_waiting', 'mentions', 'reminder_due', 'professional', 'old_unread', 'forgotten', 'no_contact', 'reopened']

const bool = (v: string | undefined, def: boolean): boolean => (v == null || v === '' ? def : v === '1' || v === 'true')
const int = (v: string | undefined, def: number, min: number, max: number): number => {
  const n = Number(v)
  return Number.isFinite(n) && v !== '' && v != null ? Math.min(max, Math.max(min, Math.round(n))) : def
}
function json<T>(v: string | undefined, def: T): T {
  if (!v) return def
  try {
    return JSON.parse(v) as T
  } catch {
    return def
  }
}

export interface ServerChatsConfig extends ChatsConfig {
  beeperToken: string
}

export async function loadConfig(): Promise<ServerChatsConfig> {
  const s = await getAllSettings()
  const weights = { ...DEFAULT_PRIORITY_WEIGHTS, ...json<Partial<PriorityWeights>>(s[K.weights], {}) }
  const token = decodeSecret(s[K.beeperToken] ?? null) || ''
  return {
    enabled: bool(s[K.enabled], false),
    providerId: s[K.provider] || 'beeper',
    beeperMode: s[K.beeperMode] === 'agent' ? 'agent' : 'direct',
    beeperUrl: s[K.beeperUrl] || DEFAULT_BEEPER_URL,
    hasBeeperToken: !!token,
    beeperToken: token,
    hasAgentKey: !!decodeSecret(s[K.agentKey] ?? null),
    syncAuto: bool(s[K.syncAuto], true),
    syncIntervalSec: int(s[K.syncInterval], 120, 30, 3600),
    realtime: bool(s[K.realtime], true),
    storePreviews: bool(s[K.storePreviews], true),
    retentionDays: int(s[K.retentionDays], 0, 0, 3650),
    initialLimit: int(s[K.initialLimit], 1500, 50, 20000),
    markReadOnOpen: bool(s[K.markReadOnOpen], false),
    aiModel: s[K.aiModel] ?? 'sonnet',
    aiStyleInstructions: s[K.aiStyle] ?? '',
    homeWidget: bool(s[K.homeWidget], true),
    notifyReminders: bool(s[K.notifyReminders], true),
    notifyVipWaiting: bool(s[K.notifyVip], false),
    notifyMentions: bool(s[K.notifyMentions], false),
    homeAlerts: json<string[]>(s[K.homeAlerts], ALL_HOME_ALERTS),
    dailyReviewSize: int(s[K.dailyReview], 5, 1, 50),
    noContactDays: int(s[K.noContactDays], 45, 7, 365),
    priorityWeights: weights,
    professionalLabels: json<string[]>(s[K.professional], ['Recrutadores', 'Clientes', 'Trabalho', 'Networking'])
  }
}

/** Versão sem segredos, para o front. */
export function publicConfig(c: ServerChatsConfig): ChatsConfig {
  const { beeperToken: _t, ...rest } = c
  return rest
}

export interface ConfigPatch extends Partial<ChatsConfig> {
  /** undefined = mantém; '' = remove. */
  beeperToken?: string
}

export async function saveConfig(p: ConfigPatch): Promise<void> {
  const set = (k: string, v: string): Promise<void> => setSetting(k, v)
  const b = (v: boolean): string => (v ? '1' : '0')
  if (p.beeperUrl !== undefined) {
    const v = validateBeeperUrl(p.beeperUrl || DEFAULT_BEEPER_URL)
    if (!v.ok) throw new Error(v.error)
    await set(K.beeperUrl, v.url)
  }
  if (p.beeperToken !== undefined) await set(K.beeperToken, encodeSecret(K.beeperToken, p.beeperToken.trim()))
  if (p.enabled !== undefined) await set(K.enabled, b(p.enabled))
  if (p.providerId !== undefined) {
    if (!['beeper', 'mock'].includes(p.providerId)) throw new Error('Provedor desconhecido.')
    await set(K.provider, p.providerId)
  }
  if (p.beeperMode !== undefined) await set(K.beeperMode, p.beeperMode === 'agent' ? 'agent' : 'direct')
  if (p.syncAuto !== undefined) await set(K.syncAuto, b(p.syncAuto))
  if (p.syncIntervalSec !== undefined) await set(K.syncInterval, String(p.syncIntervalSec))
  if (p.realtime !== undefined) await set(K.realtime, b(p.realtime))
  if (p.storePreviews !== undefined) await set(K.storePreviews, b(p.storePreviews))
  if (p.retentionDays !== undefined) await set(K.retentionDays, String(p.retentionDays))
  if (p.initialLimit !== undefined) await set(K.initialLimit, String(p.initialLimit))
  if (p.markReadOnOpen !== undefined) await set(K.markReadOnOpen, b(p.markReadOnOpen))
  if (p.aiModel !== undefined) {
    const m = p.aiModel.trim()
    if (m && !/^[A-Za-z0-9._:-]+$/.test(m)) throw new Error('Modelo inválido.')
    await set(K.aiModel, m)
  }
  if (p.aiStyleInstructions !== undefined) await set(K.aiStyle, p.aiStyleInstructions.slice(0, 2000))
  if (p.homeWidget !== undefined) await set(K.homeWidget, b(p.homeWidget))
  if (p.notifyReminders !== undefined) await set(K.notifyReminders, b(p.notifyReminders))
  if (p.notifyVipWaiting !== undefined) await set(K.notifyVip, b(p.notifyVipWaiting))
  if (p.notifyMentions !== undefined) await set(K.notifyMentions, b(p.notifyMentions))
  if (p.homeAlerts !== undefined) await set(K.homeAlerts, JSON.stringify(p.homeAlerts.filter((a) => ALL_HOME_ALERTS.includes(a))))
  if (p.dailyReviewSize !== undefined) await set(K.dailyReview, String(p.dailyReviewSize))
  if (p.noContactDays !== undefined) await set(K.noContactDays, String(p.noContactDays))
  if (p.priorityWeights !== undefined) await set(K.weights, JSON.stringify(p.priorityWeights))
  if (p.professionalLabels !== undefined) await set(K.professional, JSON.stringify(p.professionalLabels.map((x) => x.trim()).filter(Boolean)))
}
