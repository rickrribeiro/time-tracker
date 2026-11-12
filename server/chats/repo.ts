import type { Database } from 'sql.js'
import type { ChatLabel, ChatTemplate, ManualReplyState, ChatPriority } from '../../shared/chats'
import { normalizeNetwork } from '../../shared/chats'
import { getDb, saveDb } from '../database/db'
import type { RemoteAccount, RemoteChat } from './providers/types'

/**
 * Banco da Central de Mensagens. Como em `flights/repo.ts`, escritas em lote rodam numa
 * transação e o arquivo é salvo uma vez (a sincronização toca centenas de conversas).
 */
type P = (string | number | null)[]

function all<T>(db: Database, sql: string, params: P = []): T[] {
  const st = db.prepare(sql)
  if (params.length) st.bind(params)
  const out: T[] = []
  while (st.step()) out.push(st.getAsObject() as T)
  st.free()
  return out
}
function one<T>(db: Database, sql: string, params: P = []): T | null {
  return all<T>(db, sql, params)[0] ?? null
}
function exec(db: Database, sql: string, params: P = []): number {
  const st = db.prepare(sql)
  st.run(params)
  st.free()
  return db.getRowsModified()
}
function lastId(db: Database): number {
  return Number(one<{ id: number }>(db, 'SELECT last_insert_rowid() AS id')?.id ?? 0)
}

export async function tx<T>(fn: (db: Database) => T): Promise<T> {
  const db = await getDb()
  db.run('BEGIN')
  try {
    const r = fn(db)
    db.run('COMMIT')
    saveDb()
    return r
  } catch (e) {
    try {
      db.run('ROLLBACK')
    } catch {
      // nada a desfazer
    }
    throw e
  }
}
export async function read<T>(fn: (db: Database) => T): Promise<T> {
  return fn(await getDb())
}

const nowIso = (): string => new Date().toISOString()
const b = (v: boolean | null | undefined): number | null => (v == null ? null : v ? 1 : 0)

export const chatKey = (providerId: string, remoteId: string): string => `${providerId}:${remoteId}`
export const accountKey = (providerId: string, remoteId: string): string => `${providerId}:${remoteId}`

// ── Contas ────────────────────────────────────────────────────────────────────

export interface AccountRow {
  key: string
  providerId: string
  remoteId: string
  network: string
  displayName: string
  selfId: string | null
  selfName: string | null
  status: string
  syncEnabled: number
  lastSeenAt: string | null
  chatCount?: number
}

export async function upsertAccounts(providerId: string, accounts: RemoteAccount[]): Promise<void> {
  await tx((db) => {
    const now = nowIso()
    for (const a of accounts) {
      exec(
        db,
        `INSERT INTO chat_accounts (key, providerId, remoteId, network, displayName, selfId, selfName, status, lastSeenAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET network = excluded.network, displayName = excluded.displayName,
           selfId = excluded.selfId, selfName = excluded.selfName, status = excluded.status, lastSeenAt = excluded.lastSeenAt`,
        [accountKey(providerId, a.remoteId), providerId, a.remoteId, normalizeNetwork(a.network), a.displayName, a.selfId, a.selfName, a.status, now]
      )
    }
  })
}

export async function listAccounts(providerId?: string): Promise<AccountRow[]> {
  return read((db) =>
    all<AccountRow>(
      db,
      `SELECT a.*, (SELECT COUNT(*) FROM chats c WHERE c.accountKey = a.key) AS chatCount
       FROM chat_accounts a ${providerId ? 'WHERE a.providerId = ?' : ''} ORDER BY a.network, a.displayName`,
      providerId ? [providerId] : []
    )
  )
}

export async function setAccountSync(key: string, enabled: boolean): Promise<void> {
  await tx((db) => exec(db, 'UPDATE chat_accounts SET syncEnabled = ? WHERE key = ?', [enabled ? 1 : 0, key]))
}

// ── Conversas ─────────────────────────────────────────────────────────────────

export interface ChatRow {
  id: number
  key: string
  providerId: string
  accountKey: string
  remoteId: string
  network: string
  title: string
  type: 'single' | 'group'
  imgUrl: string | null
  participantCount: number | null
  peerHandle: string | null
  unreadCount: number | null
  unreadMentions: number | null
  mentionsEstimated: number
  lastActivity: string | null
  lastMessagePreview: string | null
  lastMessageFromMe: number | null
  lastMessageSender: string | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  lastInboundClosing: number
  lastInboundQuestion: number
  lastOutboundQuestion: number
  lastInboundRepliesToMe: number
  pendingSince: string | null
  isMuted: number
  isArchived: number
  scannedActivity: string | null
  syncedAt: string | null
  createdAt: string
}

export interface OrgRow {
  chatId: number
  contactId: number | null
  priority: ChatPriority | null
  manualState: ManualReplyState
  manualAt: string | null
  snoozeUntil: string | null
  snoozedAt: string | null
  reopenOnMessage: number
  reminderNote: string | null
  reminderNotifiedAt: string | null
  notes: string | null
  mentionsReviewedCount: number | null
  updatedAt: string | null
}

/** Linha completa usada para montar o resumo (conversa + organização + pessoa). */
export interface FullChatRow extends ChatRow {
  contactId: number | null
  contactName: string | null
  contactPriority: string | null
  contactVip: number | null
  priority: ChatPriority | null
  manualState: ManualReplyState
  manualAt: string | null
  snoozeUntil: string | null
  snoozedAt: string | null
  reopenOnMessage: number | null
  reminderNote: string | null
  notes: string | null
  mentionsReviewedCount: number | null
  accountSync: number | null
  todoCount: number
}

const PREVIEW_MAX = 160

export function previewOf(text: string | null | undefined, store: boolean): string | null {
  if (!store || !text) return null
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX - 1)}…` : t
}

export interface UpsertResult {
  /** Conversas novas ou cuja atividade mudou (precisam reler as mensagens recentes). */
  changed: number[]
  ids: number[]
}

/** Grava/atualiza conversas vindas do provedor. Não toca na organização. */
export async function upsertChats(providerId: string, chats: RemoteChat[], storePreviews: boolean): Promise<UpsertResult> {
  return tx((db) => {
    const now = nowIso()
    const changed: number[] = []
    const ids: number[] = []
    for (const c of chats) {
      const key = chatKey(providerId, c.remoteId)
      const prev = one<{ id: number; lastActivity: string | null; scannedActivity: string | null; unreadMentions: number | null; mentionsEstimated: number }>(
        db,
        'SELECT id, lastActivity, scannedActivity, unreadMentions, mentionsEstimated FROM chats WHERE key = ?',
        [key]
      )
      const p = c.preview
      const fromMe = p ? p.isMine : null
      const values: P = [
        accountKey(providerId, c.accountId),
        normalizeNetwork(c.network),
        c.title || '(sem nome)',
        c.type,
        c.imgUrl,
        c.participantCount,
        c.peerHandle,
        c.unreadCount,
        // provedor sem dado de menções (null): mantém a estimativa local em vez de apagá-la
        c.unreadMentions ?? (prev?.mentionsEstimated ? prev.unreadMentions : null),
        c.lastActivity ?? p?.timestamp ?? null,
        previewOf(p ? p.text || attachmentLabel(p.attachments.length ? p.attachments[0].type : null) : null, storePreviews),
        b(fromMe),
        p ? (p.isMine ? null : p.senderName) : null,
        c.isMuted ? 1 : 0,
        c.isArchived ? 1 : 0,
        now
      ]
      if (prev) {
        exec(
          db,
          `UPDATE chats SET accountKey = ?, network = ?, title = ?, type = ?, imgUrl = ?, participantCount = ?, peerHandle = COALESCE(?, peerHandle),
             unreadCount = ?, unreadMentions = ?, lastActivity = ?, lastMessagePreview = ?, lastMessageFromMe = ?, lastMessageSender = ?,
             isMuted = ?, isArchived = ?, syncedAt = ? WHERE id = ?`,
          [...values, prev.id]
        )
        // com dado do provedor, ele passa a valer e a estimativa local é descartada
        if (c.unreadMentions != null) exec(db, 'UPDATE chats SET mentionsEstimated = 0 WHERE id = ?', [prev.id])
        // A prévia já diz quem falou por último: mantém o lado correspondente atualizado.
        if (p) {
          exec(db, `UPDATE chats SET ${p.isMine ? 'lastOutboundAt' : 'lastInboundAt'} = ? WHERE id = ? AND (${p.isMine ? 'lastOutboundAt' : 'lastInboundAt'} IS NULL OR ${p.isMine ? 'lastOutboundAt' : 'lastInboundAt'} < ?)`, [p.timestamp, prev.id, p.timestamp])
        }
        ids.push(prev.id)
        const act = (values[9] as string | null) ?? null
        if (act !== prev.scannedActivity) changed.push(prev.id)
      } else {
        exec(
          db,
          `INSERT INTO chats (accountKey, network, title, type, imgUrl, participantCount, peerHandle, unreadCount, unreadMentions, lastActivity,
             lastMessagePreview, lastMessageFromMe, lastMessageSender, isMuted, isArchived, syncedAt, key, providerId, remoteId, createdAt,
             lastInboundAt, lastOutboundAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...values, key, providerId, c.remoteId, now, p && !p.isMine ? p.timestamp : null, p && p.isMine ? p.timestamp : null]
        )
        const id = lastId(db)
        ids.push(id)
        changed.push(id)
      }
    }
    return { changed, ids }
  })
}

export function attachmentLabel(type: string | null): string {
  switch (type) {
    case 'image':
      return '📷 Foto'
    case 'video':
      return '🎥 Vídeo'
    case 'audio':
      return '🎤 Áudio'
    case 'sticker':
      return '🙂 Figurinha'
    case 'file':
      return '📎 Arquivo'
    default:
      return type ? '📎 Anexo' : ''
  }
}

export interface ScanResult {
  scannedActivity: string | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  lastInboundClosing: boolean
  lastInboundQuestion: boolean
  lastOutboundQuestion: boolean
  lastInboundRepliesToMe: boolean
  pendingSince: string | null
  /** Só quando o provedor não informa menções (estimativa local). */
  estimatedMentions: number | null
}

export async function applyScans(scans: { id: number; scan: ScanResult }[]): Promise<void> {
  if (!scans.length) return
  await tx((db) => {
    for (const { id, scan: s } of scans) {
      exec(
        db,
        `UPDATE chats SET scannedActivity = ?, lastInboundAt = COALESCE(?, lastInboundAt), lastOutboundAt = COALESCE(?, lastOutboundAt),
           lastInboundClosing = ?, lastInboundQuestion = ?, lastOutboundQuestion = ?, lastInboundRepliesToMe = ?, pendingSince = ?
         WHERE id = ?`,
        [s.scannedActivity, s.lastInboundAt, s.lastOutboundAt, s.lastInboundClosing ? 1 : 0, s.lastInboundQuestion ? 1 : 0, s.lastOutboundQuestion ? 1 : 0, s.lastInboundRepliesToMe ? 1 : 0, s.pendingSince, id]
      )
      if (s.estimatedMentions != null) {
        exec(db, 'UPDATE chats SET unreadMentions = ?, mentionsEstimated = 1 WHERE id = ? AND (unreadMentions IS NULL OR mentionsEstimated = 1)', [s.estimatedMentions, id])
      }
    }
  })
}

const FULL_SELECT = `
  SELECT c.*, o.contactId, ct.name AS contactName, ct.priority AS contactPriority, ct.vip AS contactVip,
         o.priority, o.manualState, o.manualAt, o.snoozeUntil, o.snoozedAt, o.reopenOnMessage, o.reminderNote, o.notes,
         o.mentionsReviewedCount, a.syncEnabled AS accountSync,
         (SELECT COUNT(*) FROM chat_todos t JOIN todos td ON td.id = t.todoId WHERE t.chatId = c.id AND td.status != 'done') AS todoCount
  FROM chats c
  LEFT JOIN chat_org o ON o.chatId = c.id
  LEFT JOIN contacts ct ON ct.id = o.contactId
  LEFT JOIN chat_accounts a ON a.key = c.accountKey`

export async function allFullRows(): Promise<FullChatRow[]> {
  return read((db) => all<FullChatRow>(db, FULL_SELECT))
}

export async function fullRow(id: number): Promise<FullChatRow | null> {
  return read((db) => one<FullChatRow>(db, `${FULL_SELECT} WHERE c.id = ?`, [id]))
}

export async function chatById(id: number): Promise<ChatRow | null> {
  return read((db) => one<ChatRow>(db, 'SELECT * FROM chats WHERE id = ?', [id]))
}

export async function chatByKey(key: string): Promise<ChatRow | null> {
  return read((db) => one<ChatRow>(db, 'SELECT * FROM chats WHERE key = ?', [key]))
}

export async function chatIdsByRemote(providerId: string, remoteIds: string[]): Promise<number[]> {
  if (!remoteIds.length) return []
  return read((db) => {
    const out: number[] = []
    for (const r of remoteIds) {
      const row = one<{ id: number }>(db, 'SELECT id FROM chats WHERE key = ?', [chatKey(providerId, r)])
      if (row) out.push(row.id)
    }
    return out
  })
}

/** Atualiza contadores locais depois de ações (ex.: marcar como lida). */
export async function patchChatCounters(id: number, unreadCount: number | null, unreadMentions: number | null): Promise<void> {
  await tx((db) => exec(db, 'UPDATE chats SET unreadCount = ?, unreadMentions = ? WHERE id = ?', [unreadCount, unreadMentions, id]))
}

/** Registra uma mensagem enviada por mim (antes da próxima sincronização confirmar). */
/**
 * Depois de editar/apagar uma mensagem: a página lida é a verdade sobre quem falou por último
 * (sem o COALESCE de applyScans, que preserva o valor antigo quando a página não alcança).
 */
export async function applyLastFromScan(id: number, s: ScanResult): Promise<void> {
  const inT = s.lastInboundAt ? Date.parse(s.lastInboundAt) : 0
  const outT = s.lastOutboundAt ? Date.parse(s.lastOutboundAt) : 0
  const fromMe = !inT && !outT ? null : outT >= inT ? 1 : 0
  await tx((db) => exec(db, 'UPDATE chats SET lastOutboundAt = COALESCE(?, lastOutboundAt), lastMessageFromMe = ? WHERE id = ?', [s.lastOutboundAt, fromMe, id]))
}

export async function recordOutbound(id: number, at: string, question: boolean, preview: string | null): Promise<void> {
  await tx((db) =>
    exec(
      db,
      `UPDATE chats SET lastOutboundAt = ?, lastActivity = ?, lastMessageFromMe = 1, lastMessageSender = NULL,
         lastOutboundQuestion = ?, pendingSince = NULL, lastMessagePreview = COALESCE(?, lastMessagePreview) WHERE id = ?`,
      [at, at, question ? 1 : 0, preview, id]
    )
  )
}

export async function deleteChatsByRemote(providerId: string, remoteIds: string[]): Promise<void> {
  // Só apaga se não houver organização associada (a organização nunca se perde sozinha).
  await tx((db) => {
    for (const r of remoteIds) {
      const row = one<{ id: number }>(db, 'SELECT id FROM chats WHERE key = ?', [chatKey(providerId, r)])
      if (!row) continue
      if (hasOrgData(db, row.id)) continue
      exec(db, "DELETE FROM label_links WHERE entityType = 'chat' AND entityId = ?", [row.id])
      exec(db, 'DELETE FROM chats WHERE id = ?', [row.id])
    }
  })
}

function hasOrgData(db: Database, chatId: number): boolean {
  const o = one<OrgRow>(db, 'SELECT * FROM chat_org WHERE chatId = ?', [chatId])
  const labels = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM label_links WHERE entityType = 'chat' AND entityId = ?", [chatId])?.n ?? 0
  const todos = one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM chat_todos WHERE chatId = ?', [chatId])?.n ?? 0
  if (labels || todos) return true
  if (!o) return false
  return !!(o.contactId || o.priority || o.manualState || o.snoozeUntil || o.reminderNote || o.notes)
}

/**
 * Limpa o cache de mensagens/conversas sem tocar na organização: conversas sem nada do
 * rickOS são removidas; as demais perdem só a prévia do texto.
 */
export async function clearCache(opts: { olderThanDays?: number } = {}): Promise<{ removed: number; kept: number }> {
  return tx((db) => {
    const cutoff = opts.olderThanDays ? new Date(Date.now() - opts.olderThanDays * 86400_000).toISOString() : null
    const rows = all<{ id: number }>(db, cutoff ? 'SELECT id FROM chats WHERE lastActivity IS NULL OR lastActivity < ?' : 'SELECT id FROM chats', cutoff ? [cutoff] : [])
    let removed = 0
    let kept = 0
    for (const r of rows) {
      if (hasOrgData(db, r.id)) {
        exec(db, 'UPDATE chats SET lastMessagePreview = NULL, scannedActivity = NULL WHERE id = ?', [r.id])
        kept++
      } else {
        exec(db, "DELETE FROM label_links WHERE entityType = 'chat' AND entityId = ?", [r.id])
        exec(db, 'DELETE FROM chats WHERE id = ?', [r.id])
        removed++
      }
    }
    return { removed, kept }
  })
}

export async function clearPreviews(): Promise<void> {
  await tx((db) => exec(db, 'UPDATE chats SET lastMessagePreview = NULL'))
}

// ── Organização ───────────────────────────────────────────────────────────────

export type OrgPatch = Partial<Omit<OrgRow, 'chatId' | 'updatedAt'>>

const ORG_COLS = ['contactId', 'priority', 'manualState', 'manualAt', 'snoozeUntil', 'snoozedAt', 'reopenOnMessage', 'reminderNote', 'reminderNotifiedAt', 'notes', 'mentionsReviewedCount'] as const

function patchOrgDb(db: Database, chatId: number, patch: OrgPatch): void {
  exec(db, 'INSERT OR IGNORE INTO chat_org (chatId, updatedAt) VALUES (?, ?)', [chatId, nowIso()])
  const sets: string[] = []
  const params: P = []
  for (const c of ORG_COLS) {
    if (c in patch) {
      sets.push(`${c} = ?`)
      const v = patch[c]
      params.push(v === undefined ? null : (v as string | number | null))
    }
  }
  if (!sets.length) return
  sets.push('updatedAt = ?')
  params.push(nowIso(), chatId)
  exec(db, `UPDATE chat_org SET ${sets.join(', ')} WHERE chatId = ?`, params)
}

export async function patchOrg(chatIds: number[], patch: OrgPatch): Promise<void> {
  await tx((db) => {
    for (const id of chatIds) patchOrgDb(db, id, patch)
  })
}

export async function getOrg(chatId: number): Promise<OrgRow | null> {
  return read((db) => one<OrgRow>(db, 'SELECT * FROM chat_org WHERE chatId = ?', [chatId]))
}

/** Lembretes vencidos ainda não notificados. */
export async function dueReminders(nowIsoStr: string): Promise<{ chatId: number; title: string; reminderNote: string | null; snoozeUntil: string }[]> {
  return read((db) =>
    all(
      db,
      `SELECT o.chatId, c.title, o.reminderNote, o.snoozeUntil FROM chat_org o JOIN chats c ON c.id = o.chatId
       WHERE o.snoozeUntil IS NOT NULL AND o.snoozeUntil <= ? AND (o.reminderNotifiedAt IS NULL OR o.reminderNotifiedAt < o.snoozeUntil)`,
      [nowIsoStr]
    )
  )
}

// ── Pessoas ───────────────────────────────────────────────────────────────────

export interface ContactLite {
  id: number
  name: string
  priority: string | null
  vip: number | null
  context: string | null
  interests: string | null
  lastContactAt: string | null
}

export async function contactsLite(): Promise<ContactLite[]> {
  return read((db) => all<ContactLite>(db, 'SELECT id, name, priority, vip, context, interests, lastContactAt FROM contacts ORDER BY name COLLATE NOCASE'))
}

export async function contactLite(id: number): Promise<ContactLite | null> {
  return read((db) => one<ContactLite>(db, 'SELECT id, name, priority, vip, context, interests, lastContactAt FROM contacts WHERE id = ?', [id]))
}

export async function createContactFromChat(name: string, context: string | null): Promise<number> {
  return tx((db) => {
    exec(db, 'INSERT INTO contacts (name, context, createdAt) VALUES (?, ?, ?)', [name, context, nowIso()])
    return lastId(db)
  })
}

export async function setContactPriority(id: number, priority: ChatPriority, vip: boolean): Promise<void> {
  await tx((db) => exec(db, 'UPDATE contacts SET priority = ?, vip = ? WHERE id = ?', [priority, vip ? 1 : 0, id]))
}

/** Mensagem minha numa conversa vinculada conta como "última conversa" no CRM. */
export async function touchContactsFromOutbound(): Promise<void> {
  await tx((db) =>
    exec(
      db,
      `UPDATE contacts SET lastContactAt = (
         SELECT MAX(c.lastOutboundAt) FROM chat_org o JOIN chats c ON c.id = o.chatId WHERE o.contactId = contacts.id)
       WHERE id IN (SELECT o.contactId FROM chat_org o JOIN chats c ON c.id = o.chatId WHERE o.contactId IS NOT NULL AND c.lastOutboundAt IS NOT NULL)
         AND (lastContactAt IS NULL OR lastContactAt < (
         SELECT MAX(c.lastOutboundAt) FROM chat_org o JOIN chats c ON c.id = o.chatId WHERE o.contactId = contacts.id))`
    )
  )
}

export async function setContactFollowUp(contactId: number, date: string): Promise<void> {
  await tx((db) => exec(db, 'UPDATE contacts SET nextFollowUp = ? WHERE id = ? AND (nextFollowUp IS NULL OR nextFollowUp > ?)', [date, contactId, date]))
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function listLabels(): Promise<ChatLabel[]> {
  return read((db) =>
    all<ChatLabel>(
      db,
      `SELECT l.id, l.name, l.color, (SELECT COUNT(*) FROM label_links k WHERE k.labelId = l.id AND k.entityType = 'chat') AS chatCount
       FROM labels l ORDER BY l.name COLLATE NOCASE`
    )
  )
}

export async function saveLabel(id: number | null, name: string, color: string): Promise<ChatLabel> {
  return tx((db) => {
    if (id) exec(db, 'UPDATE labels SET name = ?, color = ? WHERE id = ?', [name, color, id])
    else exec(db, 'INSERT INTO labels (name, color, createdAt) VALUES (?, ?, ?)', [name, color, nowIso()])
    const lid = id || lastId(db)
    return one<ChatLabel>(db, 'SELECT id, name, color FROM labels WHERE id = ?', [lid])!
  })
}

export async function deleteLabel(id: number): Promise<void> {
  await tx((db) => {
    exec(db, 'DELETE FROM label_links WHERE labelId = ?', [id])
    exec(db, 'DELETE FROM labels WHERE id = ?', [id])
  })
}

export async function setLabels(entityType: 'chat' | 'contact', ids: number[], add: number[], remove: number[]): Promise<void> {
  await tx((db) => {
    for (const id of ids) {
      for (const l of add) exec(db, 'INSERT OR IGNORE INTO label_links (labelId, entityType, entityId) VALUES (?, ?, ?)', [l, entityType, id])
      for (const l of remove) exec(db, 'DELETE FROM label_links WHERE labelId = ? AND entityType = ? AND entityId = ?', [l, entityType, id])
    }
  })
}

/** Mapa entidade → tags. */
export async function labelMap(entityType: 'chat' | 'contact'): Promise<Map<number, ChatLabel[]>> {
  return read((db) => {
    const rows = all<{ entityId: number; id: number; name: string; color: string }>(
      db,
      'SELECT k.entityId, l.id, l.name, l.color FROM label_links k JOIN labels l ON l.id = k.labelId WHERE k.entityType = ? ORDER BY l.name COLLATE NOCASE',
      [entityType]
    )
    const m = new Map<number, ChatLabel[]>()
    for (const r of rows) {
      const list = m.get(r.entityId) ?? []
      list.push({ id: r.id, name: r.name, color: r.color })
      m.set(r.entityId, list)
    }
    return m
  })
}

// ── TODOs ─────────────────────────────────────────────────────────────────────

export async function createChatTodo(chatId: number, title: string, notes: string, dueDate: string | null, messageId: string | null): Promise<number> {
  return tx((db) => {
    exec(
      db,
      "INSERT INTO todos (title, notes, status, priority, dueDate, source, aiGenerated, type, createdAt) VALUES (?, ?, 'todo', 0, ?, 'chats', 0, ?, ?)",
      [title, notes, dueDate, dueDate ? 'lembrete' : 'projeto', nowIso()]
    )
    const todoId = lastId(db)
    exec(db, 'INSERT OR IGNORE INTO chat_todos (chatId, todoId, messageId) VALUES (?, ?, ?)', [chatId, todoId, messageId])
    return todoId
  })
}

export async function chatTodos(chatId: number): Promise<{ id: number; title: string; status: string; dueDate: string | null }[]> {
  return read((db) =>
    all(db, 'SELECT td.id, td.title, td.status, td.dueDate FROM chat_todos t JOIN todos td ON td.id = t.todoId WHERE t.chatId = ? ORDER BY td.createdAt DESC', [chatId])
  )
}

// ── Modelos de resposta ───────────────────────────────────────────────────────

export async function listTemplates(): Promise<ChatTemplate[]> {
  return read((db) => all<ChatTemplate>(db, 'SELECT id, title, body FROM chat_templates ORDER BY title COLLATE NOCASE'))
}
export async function getTemplate(id: number): Promise<ChatTemplate | null> {
  return read((db) => one<ChatTemplate>(db, 'SELECT id, title, body FROM chat_templates WHERE id = ?', [id]))
}
export async function saveTemplate(id: number | null, title: string, body: string): Promise<void> {
  await tx((db) => {
    if (id) exec(db, 'UPDATE chat_templates SET title = ?, body = ? WHERE id = ?', [title, body, id])
    else exec(db, 'INSERT INTO chat_templates (title, body, createdAt) VALUES (?, ?, ?)', [title, body, nowIso()])
  })
}
export async function deleteTemplate(id: number): Promise<void> {
  await tx((db) => exec(db, 'DELETE FROM chat_templates WHERE id = ?', [id]))
}

// ── Reconciliação entre provedores ────────────────────────────────────────────

/**
 * Quando a mesma conversa aparece por outro provedor (ex.: saiu do Beeper para um
 * conector direto de WhatsApp), move a organização da conversa antiga para a nova se o
 * identificador remoto do contato (rede + telefone/@usuário) for EXATAMENTE igual.
 * Nunca por nome. A conversa antiga fica sem organização (e pode ser limpa depois).
 */
export async function reconcile(activeProviderId: string): Promise<number> {
  return tx((db) => {
    const fresh = all<{ id: number; network: string; peerHandle: string }>(
      db,
      `SELECT c.id, c.network, c.peerHandle FROM chats c LEFT JOIN chat_org o ON o.chatId = c.id
       WHERE c.providerId = ? AND c.type = 'single' AND c.peerHandle IS NOT NULL AND o.chatId IS NULL`,
      [activeProviderId]
    )
    let moved = 0
    for (const f of fresh) {
      const old = one<{ id: number }>(
        db,
        `SELECT c.id FROM chats c JOIN chat_org o ON o.chatId = c.id
         WHERE c.providerId != ? AND c.network = ? AND c.peerHandle = ? ORDER BY c.lastActivity DESC LIMIT 1`,
        [activeProviderId, f.network, f.peerHandle]
      )
      if (!old) continue
      exec(db, 'UPDATE chat_org SET chatId = ? WHERE chatId = ?', [f.id, old.id])
      exec(db, "UPDATE label_links SET entityId = ? WHERE entityType = 'chat' AND entityId = ?", [f.id, old.id])
      exec(db, 'UPDATE OR IGNORE chat_todos SET chatId = ? WHERE chatId = ?', [f.id, old.id])
      moved++
    }
    return moved
  })
}
