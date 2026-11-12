import type { ChatPriority, ManualReplyState, PriorityWeights, ReplyState } from '../../shared/chats'

/**
 * Regras puras (sem banco/rede) de "precisa responder?" e de prioridade. A IA pode
 * sugerir, mas a fonte de verdade é esta heurística + a correção manual do usuário.
 */

const CLOSING = [
  'ok', 'okay', 'oki', 'okk', 'blz', 'beleza', 'valeu', 'vlw', 'obrigado', 'obrigada', 'obg', 'brigado', 'brigada',
  'tmj', 'show', 'top', 'perfeito', 'combinado', 'fechado', 'certo', 'certinho', 'tranquilo', 'tranks', 'de nada',
  'disponha', 'boa noite', 'bom dia', 'boa tarde', 'até mais', 'ate mais', 'abraço', 'abraco', 'abs', 'bjs', 'beijos',
  'thanks', 'thank you', 'thx', 'ty', 'cool', 'great', 'sure', 'np', 'no problem', 'got it', 'sounds good', 'see you',
  'kk', 'kkk', 'kkkk', 'haha', 'hahaha', 'rs', 'rsrs', 'sim', 'yes', 'yep', 'ah sim', 'entendi', 'massa', 'demais'
]

const strip = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[!.,;:~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Só emojis/pontuação (reação, figurinha, "👍"). */
export function isEmojiOnly(text: string): boolean {
  const t = text.replace(/[\s\p{P}]/gu, '')
  return t.length > 0 && /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}‍️]+$/u.test(t)
}

/** Mensagem de encerramento/confirmação simples: normalmente não pede resposta. */
export function isClosingMessage(text: string | null | undefined): boolean {
  if (!text) return false
  if (text.includes('?')) return false
  if (isEmojiOnly(text)) return true
  const s = strip(text)
  if (!s) return true
  if (s.length > 40) return false
  if (CLOSING.includes(s)) return true
  // "ok, valeu!", "valeu, abraço", "kkkkkk"
  if (/^(k|h?a|rs)+$/.test(s.replace(/\s/g, ''))) return true
  const words = s.split(' ')
  return words.length <= 4 && words.every((w) => CLOSING.includes(w) || isEmojiOnly(w))
}

export function looksLikeQuestion(text: string | null | undefined): boolean {
  if (!text) return false
  if (text.includes('?')) return true
  const s = strip(text)
  return /^(voce|vc|tu|sera|consegue|pode|podia|poderia|quando|onde|como|qual|quais|quem|por que|pq|bora|vamos|topa|can you|could you|would you|do you|are you|when|where|how|what|who|why)\b/.test(s)
}

/** Estimativa local de menção: o texto cita meu nome/@usuário (fallback quando o provedor não informa). */
export function textMentions(text: string | null | undefined, selfNames: string[]): boolean {
  if (!text) return false
  const t = strip(text)
  return selfNames.some((n) => {
    const k = strip(n)
    if (k.length < 3) return false
    const re = new RegExp(`(^|[^a-z0-9])@?${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
    return re.test(t)
  })
}

/** Flags de uma mensagem usadas pela classificação. */
export function messageFlags(text: string | null | undefined): { closing: boolean; question: boolean } {
  return { closing: isClosingMessage(text), question: looksLikeQuestion(text) }
}

export interface ReplyInput {
  type: 'single' | 'group'
  isMuted: boolean
  lastMessageFromMe: boolean | null
  lastInboundAt: string | null
  lastOutboundAt: string | null
  /** Flags derivadas do texto no momento da sincronização (o texto em si não é guardado). */
  lastInboundClosing: boolean
  lastInboundQuestion: boolean
  lastOutboundQuestion: boolean
  /** Última recebida responde/cita uma mensagem minha. */
  lastInboundRepliesToMe: boolean
  /** Menções não revisadas para mim (contagem do provedor ou estimativa). */
  pendingMentions: number
  manualState: ManualReplyState
  manualAt: string | null
  snoozeUntil: string | null
  snoozedAt: string | null
  reopenOnMessage: boolean
  now: number
}

export interface ReplyOutput {
  state: ReplyState
  source: 'manual' | 'auto'
  reason: string
  /** Adiada, mas chegou mensagem nova relevante depois do adiamento. */
  reopened: boolean
}

const ts = (s: string | null): number => (s ? Date.parse(s) || 0 : 0)

/** Estado automático (sem considerar decisões manuais nem adiamento). */
export function autoReplyState(i: ReplyInput): { state: ReplyState; reason: string } {
  const inT = ts(i.lastInboundAt)
  const outT = ts(i.lastOutboundAt)
  const lastIsMine = i.lastMessageFromMe ?? (outT > 0 && outT >= inT)
  if (i.type === 'group') {
    if (i.pendingMentions > 0) return { state: 'needs_reply', reason: `${i.pendingMentions} menção(ões) a você` }
    if (!lastIsMine && inT > outT && i.lastInboundRepliesToMe) return { state: 'needs_reply', reason: 'Responderam a uma mensagem sua' }
    if (i.isMuted) return { state: 'none', reason: 'Grupo silenciado' }
    if (lastIsMine && i.lastOutboundQuestion) return { state: 'waiting', reason: 'Você perguntou algo no grupo' }
    return { state: 'none', reason: 'Grupo sem menção a você' }
  }
  if (!inT && !outT) return { state: 'none', reason: 'Sem mensagens conhecidas' }
  if (lastIsMine) {
    if (i.lastOutboundQuestion) return { state: 'waiting', reason: 'Sua última mensagem foi uma pergunta' }
    return { state: 'none', reason: 'Você respondeu por último' }
  }
  if (i.lastInboundClosing) return { state: 'none', reason: 'Última mensagem parece encerramento ("ok", "valeu", 👍)' }
  if (i.lastInboundQuestion) return { state: 'needs_reply', reason: 'Pergunta sem resposta' }
  return { state: 'needs_reply', reason: 'Mensagem recebida sem resposta' }
}

/** Estado final: manual > adiamento > automático, com reabertura por mensagem nova. */
export function computeReplyState(i: ReplyInput): ReplyOutput {
  const auto = autoReplyState(i)
  const inT = ts(i.lastInboundAt)
  const outT = ts(i.lastOutboundAt)

  // Adiado: some do radar até a data, salvo mensagem nova relevante (se pedido).
  const snoozeT = ts(i.snoozeUntil)
  if (snoozeT > i.now) {
    const newSince = inT > ts(i.snoozedAt)
    if (i.reopenOnMessage && newSince && auto.state === 'needs_reply') {
      return { state: 'needs_reply', source: 'auto', reason: 'Mensagem nova numa conversa adiada', reopened: true }
    }
    return { state: 'snoozed', source: 'manual', reason: 'Adiada', reopened: false }
  }

  if (i.manualState) {
    const at = ts(i.manualAt)
    switch (i.manualState) {
      case 'resolved':
      case 'none':
        // Mensagem nova depois da decisão volta para o automático.
        if (inT > at) break
        return { state: i.manualState, source: 'manual', reason: i.manualState === 'resolved' ? 'Marcada como resolvida' : 'Marcada: não precisa responder', reopened: false }
      case 'needs_reply':
        // Respondi depois de marcar → cumprido.
        if (outT > at) break
        return { state: 'needs_reply', source: 'manual', reason: 'Marcada: preciso responder', reopened: false }
      case 'waiting':
        // A pessoa respondeu depois → volta ao automático.
        if (inT > at) break
        return { state: 'waiting', source: 'manual', reason: 'Marcada: aguardando resposta', reopened: false }
    }
  }
  return { state: auto.state, source: 'auto', reason: auto.reason, reopened: false }
}

// ── Prioridade ────────────────────────────────────────────────────────────────

export interface PriorityInput {
  replyState: ReplyState
  type: 'single' | 'group'
  participantCount: number | null
  isMuted: boolean
  pendingMentions: number
  manualPriority: ChatPriority | null
  contactPriority: ChatPriority | null
  contactVip: boolean
  professional: boolean
  question: boolean
  pendingSince: string | null
  lastActivity: string | null
  unreadCount: number | null
  reminderDue: boolean
  now: number
}

/** Pontuação explicável: só ordena/sugere, nunca altera a prioridade manual. */
export function priorityScore(p: PriorityInput, w: PriorityWeights): number {
  let s = 0
  if (p.replyState === 'needs_reply') s += 30
  else if (p.replyState === 'waiting') s += 5
  else if (p.replyState === 'resolved' || p.replyState === 'none' || p.replyState === 'snoozed') s -= 20
  if (p.pendingMentions > 0) s += w.mention
  if (p.contactVip || p.contactPriority === 'alta') s += w.vip
  if (p.contactPriority === 'baixa') s += w.manualLow / 2
  if (p.manualPriority === 'alta') s += w.manualHigh
  if (p.manualPriority === 'baixa') s += w.manualLow
  if (p.professional) s += w.professional
  if (p.question && p.replyState === 'needs_reply') s += w.question
  if (p.reminderDue) s += 35
  const last = ts(p.lastActivity)
  if (last) {
    const days = (p.now - last) / 86400_000
    s += Math.max(0, w.recency * (1 - days / 14)) // recente pesa mais
  }
  const pend = ts(p.pendingSince)
  if (pend && p.replyState === 'needs_reply') {
    const days = (p.now - pend) / 86400_000
    s += Math.min(30, days * w.agePerDay) // esquecida há muito tempo sobe um pouco (com teto)
  }
  if (p.type === 'group' && (p.participantCount ?? 0) > 20 && p.pendingMentions === 0) s -= w.bigGroupPenalty
  if (p.isMuted && p.pendingMentions === 0) s -= w.mutedPenalty
  return Math.round(s)
}

export function suggestedPriority(score: number): ChatPriority {
  if (score >= 70) return 'alta'
  if (score <= 10) return 'baixa'
  return 'normal'
}
