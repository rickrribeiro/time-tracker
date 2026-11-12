import React, { useEffect, useRef, useState } from 'react'
import { Contact } from '../../../types'
import { useContactStore } from '../store/contactStore'
import { ContactEditor } from '../components/ContactEditor'
import { BRAZIL, BRAZIL_STATES } from '../geo'
import { timeAgo, localDateStr } from '../../../utils/dates'
import { networkInfo } from '../../../../shared/chats'
import { openChat } from '../../chats/store/chatsStore'

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
Local: ${[contact.location, contact.state, contact.country].filter(Boolean).join(', ') || '—'}
Interesses: ${contact.interests ?? '—'}
Última conversa: ${contact.lastContactAt ? new Date(contact.lastContactAt).toLocaleDateString('pt-BR') : '—'}
Contexto: ${contact.context ?? '—'}`
      runId.current = await window.api.ai.start({ prompt, model, save: false, source: 'crm' })
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
  const [nameFilter, setNameFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  // conversas vinculadas (Central de Mensagens): redes por pessoa e pendências
  const [nets, setNets] = useState<Record<number, { network: string; chatId: number; pending: boolean }[]>>({})
  useEffect(() => {
    refresh()
    window.api.chats.contactNetworks().then(setNets).catch(() => setNets({}))
  }, [])

  function onCountryFilterChange(value: string): void {
    setCountryFilter(value)
    if (value !== BRAZIL) setStateFilter('') // estado só se aplica ao Brasil
  }

  // países distintos presentes nos contatos (para o filtro)
  const countries = Array.from(new Set(contacts.map((c) => c.country).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
  // estados distintos entre os contatos brasileiros (para o filtro por UF)
  const brStates = Array.from(new Set(contacts.filter((c) => c.country === BRAZIL).map((c) => c.state).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b))
  const ufLabel = (uf: string): string => BRAZIL_STATES.find((s) => s.uf === uf)?.name ?? uf

  const nameQuery = nameFilter.trim().toLowerCase()
  const filtered = contacts.filter((c) => {
    if (nameQuery && !c.name.toLowerCase().includes(nameQuery)) return false
    if (countryFilter && c.country !== countryFilter) return false
    if (countryFilter === BRAZIL && stateFilter && c.state !== stateFilter) return false
    return true
  })

  const today = localDateStr(new Date())
  const needsAttention = (c: Contact): boolean => {
    if (c.nextFollowUp && c.nextFollowUp <= today) return true
    if (nets[c.id]?.some((n) => n.pending)) return true
    const bd = daysToBirthday(c.birthday)
    if (bd !== null && bd <= 7) return true
    if (c.lastContactAt) return Date.now() - new Date(c.lastContactAt).getTime() > 30 * 86400000
    return false
  }

  // sort: attention first, then oldest contact first
  const sorted = [...filtered].sort((a, b) => {
    const aa = needsAttention(a) ? 0 : 1
    const bb = needsAttention(b) ? 0 : 1
    if (aa !== bb) return aa - bb
    const at = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0
    const bt = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0
    return at - bt
  })
  const attentionCount = contacts.filter(needsAttention).length
  const isFiltering = !!(nameQuery || countryFilter || stateFilter)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🤝 Pessoas</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {isFiltering ? `${filtered.length} de ${contacts.length} contatos` : `${contacts.length} contatos`} · {attentionCount} precisam de atenção
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="🔍 Buscar por nome"
            style={{ minWidth: 180 }}
          />
          {countries.length > 0 && (
            <select value={countryFilter} onChange={(e) => onCountryFilterChange(e.target.value)} title="Filtrar por país">
              <option value="">🌎 Todos os países</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {countryFilter === BRAZIL && brStates.length > 0 && (
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} title="Filtrar por estado">
              <option value="">📍 Todos os estados</option>
              {brStates.map((uf) => (
                <option key={uf} value={uf}>{uf} — {ufLabel(uf)}</option>
              ))}
            </select>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>＋ Pessoa</button>
        </div>
      </div>

      <div className="list-stack">
        {contacts.length === 0 && <div className="empty-hint">Nenhuma pessoa. Adicione quem você quer manter por perto.</div>}
        {contacts.length > 0 && sorted.length === 0 && <div className="empty-hint">Nenhum contato para os filtros selecionados.</div>}
        {sorted.map((c) => {
          const bd = daysToBirthday(c.birthday)
          const attention = needsAttention(c)
          return (
            <div key={c.id} className="list-row" style={{ alignItems: 'flex-start', borderLeft: attention ? '3px solid var(--warning, #f59e0b)' : '3px solid transparent' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="list-row-title">{c.vip ? '⭐ ' : ''}{c.name}</span>
                  {c.priority === 'alta' && <span className="due-badge due-overdue">prioridade alta</span>}
                  {(nets[c.id] ?? []).map((n) => (
                    <button
                      key={n.chatId}
                      className="project-chip"
                      style={{ cursor: 'pointer', border: n.pending ? '1px solid var(--danger)' : undefined }}
                      title={n.pending ? `${networkInfo(n.network).label}: esperando resposta` : `Abrir conversa no ${networkInfo(n.network).label}`}
                      onClick={() => openChat(n.chatId)}
                    >
                      {networkInfo(n.network).icon} {networkInfo(n.network).label}{n.pending ? ' ✍️' : ''}
                    </button>
                  ))}
                  {c.location && <span className="project-chip">📍 {c.location}</span>}
                  {c.country && <span className="project-chip">🌎 {c.country}{c.state ? ` / ${c.state}` : ''}</span>}
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
