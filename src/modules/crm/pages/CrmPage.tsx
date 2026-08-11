import React, { useEffect, useRef, useState } from 'react'
import { Contact } from '../../../types'
import { useContactStore } from '../store/contactStore'
import { ContactEditor } from '../components/ContactEditor'
import { timeAgo, localDateStr } from '../../../utils/dates'

/** Days until the next occurrence of a MM-DD / YYYY-MM-DD birthday, or null. */
function daysToBirthday(bday: string | null): number | null {
  if (!bday) return null
  const md = bday.slice(-5) // MM-DD
  const m = /^(\d{2})-(\d{2})$/.exec(md)
  if (!m) return null
  const now = new Date()
  let next = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]))
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next = new Date(now.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]))
  return Math.round((next.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
}

function SuggestModal({ contact, onClose }: { contact: Contact; onClose: () => void }): React.ReactElement {
  const [out, setOut] = useState('')
  const [running, setRunning] = useState(true)
  const runId = useRef<string | null>(null)
  useEffect(() => {
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runId.current) setOut((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error }) => {
      if (rid !== runId.current) return
      runId.current = null
      setRunning(false)
      setOut(ok ? output : error || 'Falha.')
    })
    ;(async () => {
      const model = (await window.api.settings.get('claude_model')) ?? ''
      const prompt = `Sou nômade e quero manter viva minha relação com ${contact.name}. Com base no contexto abaixo, escreva 2 ou 3 opções curtas de mensagem calorosa e natural para retomar o contato (em português, tom pessoal, sem parecer robô). Se houver um gancho no contexto (ex.: um exame, uma viagem, um projeto), puxe por ele.

Nome: ${contact.name}
Local: ${contact.location ?? '—'}
Interesses: ${contact.interests ?? '—'}
Última conversa: ${contact.lastContactAt ? new Date(contact.lastContactAt).toLocaleDateString('pt-BR') : '—'}
Contexto: ${contact.context ?? '—'}`
      runId.current = await window.api.ai.start({ prompt, model, save: false })
    })()
    return () => {
      offChunk()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 440, maxWidth: 600 }}>
        <h2>✨ Mensagens para {contact.name}</h2>
        <pre className="ai-output" style={{ maxHeight: 320 }}>{out || (running ? 'Pensando…' : '')}</pre>
        <div className="modal-actions">
          {!running && out && <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(out)}>Copiar</button>}
          <button className="btn btn-primary btn-sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

export function CrmPage(): React.ReactElement {
  const { contacts, refresh, log, remove } = useContactStore()
  const [editing, setEditing] = useState<Contact | null>(null)
  const [creating, setCreating] = useState(false)
  const [suggest, setSuggest] = useState<Contact | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const today = localDateStr(new Date())
  const needsAttention = (c: Contact): boolean => {
    if (c.nextFollowUp && c.nextFollowUp <= today) return true
    const bd = daysToBirthday(c.birthday)
    if (bd !== null && bd <= 7) return true
    if (c.lastContactAt) return Date.now() - new Date(c.lastContactAt).getTime() > 30 * 86400000
    return false
  }

  // sort: attention first, then oldest contact first
  const sorted = [...contacts].sort((a, b) => {
    const aa = needsAttention(a) ? 0 : 1
    const bb = needsAttention(b) ? 0 : 1
    if (aa !== bb) return aa - bb
    const at = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0
    const bt = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0
    return at - bt
  })
  const attentionCount = contacts.filter(needsAttention).length

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🤝 Pessoas</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {contacts.length} contatos · {attentionCount} precisam de atenção
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>＋ Pessoa</button>
      </div>

      <div className="list-stack">
        {contacts.length === 0 && <div className="empty-hint">Nenhuma pessoa. Adicione quem você quer manter por perto.</div>}
        {sorted.map((c) => {
          const bd = daysToBirthday(c.birthday)
          const attention = needsAttention(c)
          return (
            <div key={c.id} className="list-row" style={{ alignItems: 'flex-start', borderLeft: attention ? '3px solid var(--warning, #f59e0b)' : '3px solid transparent' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="list-row-title">{c.name}</span>
                  {c.location && <span className="project-chip">📍 {c.location}</span>}
                  {bd !== null && bd <= 7 && <span className="due-badge due-today">🎂 {bd === 0 ? 'hoje!' : `em ${bd}d`}</span>}
                  {c.nextFollowUp && <span className={`due-badge ${c.nextFollowUp <= today ? 'due-overdue' : 'due-future'}`}>↩ {c.nextFollowUp}</span>}
                </div>
                {c.interests && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>💡 {c.interests}</div>}
                {c.context && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{c.context}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.lastContactAt ? `última conversa há ${timeAgo(c.lastContactAt)}` : 'sem conversa registrada'}
                </div>
              </div>
              <div className="list-row-actions" style={{ flexShrink: 0 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setSuggest(c)} title="Sugerir mensagem com IA">✨ Msg</button>
                <button className="btn btn-secondary btn-sm" onClick={() => log(c.id)} title="Registrar que conversei hoje">✓ Falei</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>Editar</button>
                <button className="btn btn-danger btn-sm" onClick={() => window.confirm(`Remover ${c.name}?`) && remove(c.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {(creating || editing) && <ContactEditor contact={editing} onClose={() => { setCreating(false); setEditing(null) }} />}
      {suggest && <SuggestModal contact={suggest} onClose={() => setSuggest(null)} />}
    </div>
  )
}
