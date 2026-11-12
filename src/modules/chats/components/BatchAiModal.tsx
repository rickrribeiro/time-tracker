import React, { useEffect, useState } from 'react'
import type { AiStyle, AiSuggestResult, ChatMessage, ChatSummary } from '../../../../shared/chats'
import { AI_STYLE_LABELS, networkInfo } from '../../../../shared/chats'
import { openChat, useChatsStore } from '../store/chatsStore'
import { ConfirmSend } from './ChatView'

interface Row {
  chat: ChatSummary
  messages: ChatMessage[]
  picked: string[]
  loading: boolean
  error: string | null
  result: AiSuggestResult | null
  text: string
  generating: boolean
  sent: boolean
}

/**
 * Uma sugestão por conversa. Antes de gerar, mostra QUAIS mensagens de cada conversa vão
 * para a IA (dá para desmarcar). Envio é sempre individual e confirmado — nunca em massa.
 */
export function BatchAiModal({ chatIds, onClose }: { chatIds: number[]; onClose: () => void }): React.ReactElement {
  const items = useChatsStore((s) => s.items)
  const [rows, setRows] = useState<Row[]>([])
  const [style, setStyle] = useState<AiStyle>('natural')
  const [running, setRunning] = useState(false)
  const [confirm, setConfirm] = useState<Row | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // conversas fora da lista atual (ex.: vindas da triagem) são buscadas no servidor
      const found = await Promise.all(chatIds.slice(0, 30).map(async (id) => items.find((i) => i.id === id) ?? (await window.api.chats.get(id).catch(() => null))))
      const chats = found.filter((c): c is ChatSummary => !!c)
      if (cancelled) return
      setRows(chats.map((chat) => ({ chat, messages: [], picked: [], loading: true, error: null, result: null, text: '', generating: false, sent: false })))
      // carrega as pendentes de cada conversa (concorrência baixa)
      let i = 0
      const worker = async (): Promise<void> => {
        while (i < chats.length && !cancelled) {
          const c = chats[i++]
          try {
            const msgs = await window.api.chats.pendingMessages(c.id)
            setRows((rs) => rs.map((r) => (r.chat.id === c.id ? { ...r, messages: msgs, picked: msgs.map((m) => m.id), loading: false } : r)))
          } catch (e) {
            setRows((rs) => rs.map((r) => (r.chat.id === c.id ? { ...r, loading: false, error: e instanceof Error ? e.message : String(e) } : r)))
          }
        }
      }
      await Promise.all([worker(), worker(), worker()])
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (id: number, p: Partial<Row>): void => setRows((rs) => rs.map((r) => (r.chat.id === id ? { ...r, ...p } : r)))

  async function generate(only?: Row): Promise<void> {
    const targets = (only ? [only] : rows).filter((r) => r.picked.length && !r.sent)
    if (!targets.length) return
    setRunning(true)
    targets.forEach((r) => patch(r.chat.id, { generating: true, error: null }))
    const results = await window.api.chats.aiBatch(targets.map((r) => ({ chatId: r.chat.id, messageIds: r.picked, mode: 'single', style })))
    for (const res of results) {
      patch(res.chatId, { generating: false, result: res, text: res.suggestions[0]?.reply ?? '', error: res.error })
    }
    setRunning(false)
  }

  async function send(r: Row): Promise<void> {
    setSending(true)
    try {
      await window.api.chats.send(r.chat.id, r.text, null)
      patch(r.chat.id, { sent: true })
      setConfirm(null)
    } catch (e) {
      patch(r.chat.id, { error: e instanceof Error ? e.message : String(e) })
      setConfirm(null)
    } finally {
      setSending(false)
    }
  }

  const totalMsgs = rows.reduce((t, r) => t + r.picked.length, 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: '100%', maxHeight: '90dvh', overflowY: 'auto' }}>
        <h2>✨ Sugestões para {rows.length} conversa{rows.length === 1 ? '' : 's'}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Vão para a IA só as mensagens marcadas abaixo ({totalMsgs} no total), as recebidas desde a sua última resposta. Nada é
          enviado sem você confirmar, conversa por conversa.
        </p>
        <div className="chats-row" style={{ marginBottom: 10 }}>
          <select value={style} onChange={(e) => setStyle(e.target.value as AiStyle)} aria-label="Estilo">
            {(Object.keys(AI_STYLE_LABELS) as AiStyle[]).map((s) => (
              <option key={s} value={s}>{AI_STYLE_LABELS[s]}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" disabled={running || !totalMsgs} onClick={() => void generate()}>{running ? 'Gerando…' : 'Gerar sugestões'}</button>
        </div>
        {rows.map((r) => (
          <div key={r.chat.id} className="chats-ai-card" style={r.sent ? { opacity: 0.55 } : undefined}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {networkInfo(r.chat.network).icon} {r.chat.contactName || r.chat.title}
              </b>
              <button className="chats-linkbtn" onClick={() => (openChat(r.chat.id), onClose())}>abrir conversa</button>
            </div>
            {r.loading && <div className="chats-ai-reason">Carregando mensagens pendentes…</div>}
            {!r.loading && r.messages.length === 0 && !r.error && <div className="chats-ai-reason">Sem mensagens recebidas pendentes nesta conversa.</div>}
            {r.messages.map((m) => (
              <label key={m.id} className="chats-pick" style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={r.picked.includes(m.id)}
                  onChange={() => patch(r.chat.id, { picked: r.picked.includes(m.id) ? r.picked.filter((x) => x !== m.id) : [...r.picked, m.id] })}
                />
                <span style={{ fontSize: 12 }}>
                  <b>{m.senderName}:</b> {m.text.slice(0, 200) || '[anexo]'}
                </span>
              </label>
            ))}
            {r.generating && <div className="chats-ai-reason">Gerando…</div>}
            {r.error && (
              <div className="chats-msg err">
                {r.error} <button className="chats-linkbtn" onClick={() => void generate(r)}>tentar de novo</button>
              </div>
            )}
            {r.result && !r.error && (
              <>
                <textarea rows={3} value={r.text} onChange={(e) => patch(r.chat.id, { text: e.target.value })} style={{ width: '100%', marginTop: 6 }} />
                <div className="chats-ai-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => void generate(r)} disabled={r.generating}>↻ Regenerar</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(r.text)}>Copiar</button>
                  <button className="btn btn-primary btn-sm" disabled={!r.text.trim() || r.sent || r.chat.stale} onClick={() => setConfirm(r)}>{r.sent ? '✓ Enviada' : 'Enviar…'}</button>
                  {r.result.suggestions[0]?.reason && <span className="chats-ai-reason">{r.result.suggestions[0].reason}</span>}
                </div>
              </>
            )}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>Fechar</button>
        </div>
        {confirm && <ConfirmSend chat={confirm.chat} text={confirm.text} busy={sending} onCancel={() => setConfirm(null)} onConfirm={() => void send(confirm)} />}
      </div>
    </div>
  )
}
