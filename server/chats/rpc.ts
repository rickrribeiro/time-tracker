import type { AiSuggestRequest, AiSuggestResult, ChatFilter, ChatPreset, ChatPriority, ManualReplyState } from '../../shared/chats'
import { networkInfo } from '../../shared/chats'
import { broadcast } from '../events'
import { getSetting, setSetting } from '../database/queries'
import { agentDetails, rotateAgentKey } from './agentRelay'
import * as ai from './ai'
import type { ConfigPatch } from './config'
import { K, loadConfig, publicConfig, saveConfig } from './config'
import * as repo from './repo'
import * as svc from './service'
import { getStatus, reconfigure, syncNow } from './sync'

/**
 * Canais `chats:*`. O front só conhece estes contratos normalizados; nada do provedor
 * (tokens, URLs internas de anexos, ids de conta crus) sai daqui sem tratamento.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handle = (channel: string, fn: (event: unknown, ...args: any[]) => unknown) => void

const BUILTIN_PRESETS: ChatPreset[] = [
  { id: 'b-attention', name: '🔥 Prioritárias', filter: { state: 'high', sort: 'priority' }, builtin: true },
  { id: 'b-reply', name: '✍️ Preciso responder', filter: { state: 'needs_reply', sort: 'priority' }, builtin: true },
  { id: 'b-waiting', name: '⏳ Aguardando resposta', filter: { state: 'waiting', sort: 'recent' }, builtin: true },
  { id: 'b-mentions', name: '@ Mencionaram-me', filter: { state: 'mentions', type: 'group', sort: 'recent' }, builtin: true },
  { id: 'b-old', name: '🕰 Pendentes há +7 dias', filter: { state: 'needs_reply', pendingOlderThanDays: 7, sort: 'oldest_pending' }, builtin: true },
  { id: 'b-ig-unread', name: '📸 Instagram não lidas', filter: { networks: ['instagram'], state: 'unread', sort: 'recent' }, builtin: true }
]

const STATES: (ManualReplyState | 'auto')[] = ['needs_reply', 'waiting', 'none', 'resolved', 'auto']
const PRIOS: (ChatPriority | null)[] = ['alta', 'normal', 'baixa', null]
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500) : [])

export function registerChatRpc(handle: Handle): void {
  // ── Configuração / status ──
  handle('chats:status', () => getStatus())
  handle('chats:config', async () => ({ config: publicConfig(await loadConfig()), agent: agentDetails() }))
  handle('chats:saveConfig', async (_e, patch: ConfigPatch) => {
    await saveConfig(patch ?? {})
    await reconfigure()
    broadcast('chats:updated', { chatIds: [] })
    return { config: publicConfig(await loadConfig()), status: getStatus() }
  })
  handle('chats:test', async () => {
    const p = await svc.activeProvider()
    if (!p) return { ok: false, message: 'Ative a Central de Mensagens primeiro.' }
    return p.test()
  })
  handle('chats:agentKey', async () => ({ key: await rotateAgentKey() }))
  handle('chats:agentStatus', () => agentDetails())
  handle('chats:syncNow', async (_e, full?: boolean) => {
    await syncNow({ full: !!full })
    return getStatus()
  })
  handle('chats:accounts', async () => {
    const cfg = await loadConfig()
    const rows = await repo.listAccounts(cfg.providerId)
    return rows.map((a) => ({
      key: a.key,
      providerId: a.providerId,
      remoteId: a.remoteId,
      network: a.network,
      displayName: a.displayName,
      selfName: a.selfName,
      status: a.status,
      syncEnabled: !!a.syncEnabled,
      lastSeenAt: a.lastSeenAt,
      chatCount: a.chatCount ?? 0
    }))
  })
  handle('chats:setAccountSync', async (_e, key: string, enabled: boolean) => {
    await repo.setAccountSync(String(key), !!enabled)
    svc.changed()
    void syncNow().catch(() => undefined)
  })
  handle('chats:clearCache', async () => {
    svc.invalidateMessages()
    const r = await repo.clearCache()
    svc.changed()
    return r
  })
  /** Desconectar: desliga o módulo e apaga o token, preservando a organização. */
  handle('chats:disconnect', async () => {
    await saveConfig({ enabled: false, beeperToken: '' })
    svc.invalidateMessages()
    await reconfigure()
    svc.changed()
    return getStatus()
  })

  // ── Lista / contadores ──
  handle('chats:list', (_e, filter: ChatFilter, offset?: number, limit?: number) => svc.listChats(filter ?? {}, Number(offset) || 0, Number(limit) || 60))
  handle('chats:counts', () => svc.counts())
  handle('chats:get', (_e, id: number) => svc.getSummary(Number(id)))
  handle('chats:radar', () => svc.radar())
  handle('chats:networks', async () => {
    const c = await svc.counts()
    return Object.entries(c.byNetwork).map(([id, v]) => ({ id, ...networkInfo(id), chats: v.chats, unread: v.unread }))
  })

  // ── Mensagens ──
  handle('chats:messages', async (_e, id: number, cursor?: string | null) => {
    const page = await svc.getMessages(Number(id), cursor ?? null)
    return page
  })
  handle('chats:send', (_e, id: number, text: string, replyToId?: string | null) => svc.sendMessage(Number(id), String(text ?? ''), replyToId ?? null))
  handle('chats:markRead', (_e, id: number, read: boolean) => svc.markRead(Number(id), read !== false))
  handle('chats:search', (_e, query: string, chatId?: number | null) => svc.searchMessages(String(query ?? ''), chatId ? Number(chatId) : null))
  handle('chats:pendingMessages', (_e, id: number) => ai.pendingMessages(Number(id)))

  // ── Organização (sempre local) ──
  handle('chats:setState', async (_e, chatIds: number[], state: ManualReplyState | 'auto') => {
    if (!STATES.includes(state)) throw new Error('Estado inválido.')
    const list = ids(chatIds)
    const now = new Date().toISOString()
    if (state === 'auto') await repo.patchOrg(list, { manualState: null, manualAt: null })
    else await repo.patchOrg(list, { manualState: state, manualAt: now, ...(state === 'resolved' || state === 'none' ? { snoozeUntil: null, snoozedAt: null, reminderNote: null } : {}) })
    svc.changed(list)
  })
  handle('chats:snooze', async (_e, chatIds: number[], until: string | null, note?: string | null, reopenOnMessage?: boolean) => {
    const list = ids(chatIds)
    if (until && Number.isNaN(Date.parse(until))) throw new Error('Data inválida.')
    if (!until) {
      await repo.patchOrg(list, { snoozeUntil: null, snoozedAt: null, reminderNote: null, reminderNotifiedAt: null })
    } else {
      const iso = new Date(until).toISOString()
      await repo.patchOrg(list, {
        snoozeUntil: iso,
        snoozedAt: new Date().toISOString(),
        reminderNote: note?.trim() ? note.trim().slice(0, 300) : null,
        reminderNotifiedAt: null,
        reopenOnMessage: reopenOnMessage === false ? 0 : 1
      })
      // pessoa vinculada: o lembrete também aparece como follow-up no CRM
      for (const id of list) {
        const org = await repo.getOrg(id)
        if (org?.contactId) await repo.setContactFollowUp(org.contactId, iso.slice(0, 10))
      }
    }
    svc.changed(list)
  })
  handle('chats:setPriority', async (_e, chatIds: number[], priority: ChatPriority | null) => {
    if (!PRIOS.includes(priority)) throw new Error('Prioridade inválida.')
    const list = ids(chatIds)
    await repo.patchOrg(list, { priority })
    svc.changed(list)
  })
  handle('chats:setNotes', async (_e, id: number, notes: string | null) => {
    await repo.patchOrg([Number(id)], { notes: notes?.trim() ? notes.slice(0, 5000) : null })
    svc.changed([Number(id)])
  })
  handle('chats:reviewMentions', async (_e, chatIds: number[]) => {
    const list = ids(chatIds)
    for (const id of list) {
      const c = await repo.chatById(id)
      await repo.patchOrg([id], { mentionsReviewedCount: c?.unreadMentions ?? 0 })
    }
    svc.changed(list)
  })

  // ── Pessoas ──
  handle('chats:suggestContacts', (_e, id: number) => svc.suggestContacts(Number(id)))
  handle('chats:link', async (_e, chatIds: number[], contactId: number | null) => {
    const list = ids(chatIds)
    for (const id of list) {
      const c = await repo.chatById(id)
      if (c?.type === 'group' && contactId) throw new Error('Grupos não são pessoas: vincule participantes individualmente.')
    }
    await repo.patchOrg(list, { contactId: contactId ? Number(contactId) : null })
    await repo.touchContactsFromOutbound()
    svc.changed(list)
  })
  handle('chats:createContact', async (_e, id: number, name: string) => {
    const chat = await repo.chatById(Number(id))
    if (!chat) throw new Error('Conversa não encontrada.')
    if (chat.type === 'group') throw new Error('Grupos não são pessoas.')
    const n = String(name ?? '').trim() || chat.title
    const ctx = `Criada a partir de conversa no ${networkInfo(chat.network).label}${chat.peerHandle ? ` (${chat.peerHandle})` : ''}.`
    const contactId = await repo.createContactFromChat(n.slice(0, 120), ctx)
    await repo.patchOrg([chat.id], { contactId })
    await repo.touchContactsFromOutbound()
    svc.changed([chat.id])
    return { contactId }
  })
  handle('chats:contactChats', (_e, contactId: number) => svc.contactChats(Number(contactId)))
  handle('chats:contactNetworks', () => svc.contactNetworks())
  handle('chats:contacts', () => repo.contactsLite())
  handle('chats:setContactPriority', async (_e, contactId: number, priority: ChatPriority, vip: boolean) => {
    if (!['alta', 'normal', 'baixa'].includes(priority)) throw new Error('Prioridade inválida.')
    await repo.setContactPriority(Number(contactId), priority, !!vip)
    svc.changed()
  })

  // ── Tags ──
  handle('chats:labels', () => repo.listLabels())
  handle('chats:saveLabel', async (_e, id: number | null, name: string, color: string) => {
    const n = String(name ?? '').trim().slice(0, 40)
    if (!n) throw new Error('Nome obrigatório.')
    const col = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6366f1'
    const l = await repo.saveLabel(id ? Number(id) : null, n, col)
    svc.changed()
    return l
  })
  handle('chats:deleteLabel', async (_e, id: number) => {
    await repo.deleteLabel(Number(id))
    svc.changed()
  })
  handle('chats:setLabels', async (_e, entity: 'chat' | 'contact', entityIds: number[], add: number[], remove: number[]) => {
    if (entity !== 'chat' && entity !== 'contact') throw new Error('Entidade inválida.')
    await repo.setLabels(entity, ids(entityIds), ids(add), ids(remove))
    svc.changed(entity === 'chat' ? ids(entityIds) : [])
  })
  handle('chats:contactLabels', async (_e, contactId: number) => (await repo.labelMap('contact')).get(Number(contactId)) ?? [])

  // ── TODOs ──
  handle('chats:createTodo', async (_e, id: number, title: string, dueDate: string | null, messageId: string | null) => {
    const chat = await repo.fullRow(Number(id))
    if (!chat) throw new Error('Conversa não encontrada.')
    const t = String(title ?? '').trim().slice(0, 200)
    if (!t) throw new Error('Título obrigatório.')
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('Data inválida.')
    const notes = `💬 Conversa: ${chat.title} (${networkInfo(chat.network).label})${chat.contactName ? ` · Pessoa: ${chat.contactName}` : ''}\nAbrir: #/chats?c=${chat.id}`
    const todoId = await repo.createChatTodo(chat.id, t, notes, dueDate, messageId)
    broadcast('inbox:updated', { source: 'chats' })
    svc.changed([chat.id])
    return { todoId }
  })
  handle('chats:todos', (_e, id: number) => repo.chatTodos(Number(id)))

  // ── Presets e modelos ──
  handle('chats:presets', async () => {
    let user: ChatPreset[] = []
    try {
      user = JSON.parse((await getSetting(K.presets)) || '[]')
    } catch {
      user = []
    }
    return [...BUILTIN_PRESETS, ...user]
  })
  handle('chats:savePreset', async (_e, name: string, filter: ChatFilter) => {
    const list: ChatPreset[] = JSON.parse((await getSetting(K.presets)) || '[]')
    list.push({ id: `u-${Date.now()}`, name: String(name).slice(0, 40), filter })
    await setSetting(K.presets, JSON.stringify(list.slice(-30)))
  })
  handle('chats:deletePreset', async (_e, id: string) => {
    const list: ChatPreset[] = JSON.parse((await getSetting(K.presets)) || '[]')
    await setSetting(K.presets, JSON.stringify(list.filter((p) => p.id !== id)))
  })
  handle('chats:templates', () => repo.listTemplates())
  handle('chats:saveTemplate', async (_e, id: number | null, title: string, body: string) => {
    if (!String(title ?? '').trim() || !String(body ?? '').trim()) throw new Error('Título e texto são obrigatórios.')
    await repo.saveTemplate(id ? Number(id) : null, String(title).slice(0, 80), String(body).slice(0, 4000))
  })
  handle('chats:deleteTemplate', (_e, id: number) => repo.deleteTemplate(Number(id)))

  // ── IA (só com as mensagens selecionadas) ──
  handle('chats:aiSuggest', (_e, req: AiSuggestRequest) => ai.suggestReplies(req))
  handle('chats:aiBatch', async (_e, reqs: AiSuggestRequest[]) => {
    const out: AiSuggestResult[] = await ai.suggestBatch(Array.isArray(reqs) ? reqs : [], (r) => broadcast('chats:ai', r))
    return out
  })
  handle('chats:aiSummarize', (_e, id: number, messageIds: string[], includeNotes?: boolean) => ai.summarize(Number(id), Array.isArray(messageIds) ? messageIds.map(String) : [], !!includeNotes))
}
