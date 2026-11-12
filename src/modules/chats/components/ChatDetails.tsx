import React, { useEffect, useState } from 'react'
import type { ChatLabel, ChatPriority, ChatSummary, ContactChatLink, ContactSuggestion } from '../../../../shared/chats'
import { networkInfo } from '../../../../shared/chats'
import type { ContactLite } from '../api'
import { useChatsStore } from '../store/chatsStore'
import { LabelMenu, PriorityMenu, SnoozeMenu, StateMenu } from './actions'
import { LabelChips, StatePill } from './ui'

function LinkPersonModal({ chat, onClose }: { chat: ChatSummary; onClose: () => void }): React.ReactElement {
  const [contacts, setContacts] = useState<ContactLite[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    void window.api.chats.contacts().then(setContacts)
  }, [])
  const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const list = contacts.filter((c) => !q || norm(c.name).includes(norm(q))).slice(0, 80)
  async function link(id: number): Promise<void> {
    await window.api.chats.link([chat.id], id)
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '100%' }}>
        <h2>👤 Vincular pessoa</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>“{chat.title}” no {networkInfo(chat.network).label}</p>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar em Pessoas…" style={{ width: '100%' }} />
        <div className="chats-pick-list">
          {list.map((c) => (
            <div key={c.id} className="chats-pick" onClick={() => void link(c.id)}>
              <span>{c.vip ? '⭐' : '👤'}</span>
              <span style={{ flex: 1 }}>{c.name}</span>
              {c.priority === 'alta' && <span className="chats-prio alta">alta</span>}
            </div>
          ))}
          {list.length === 0 && <div className="chats-empty">Ninguém encontrado.</div>}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

export function ChatDetails({ chat }: { chat: ChatSummary }): React.ReactElement {
  const { refreshActive, open, setDetailOpen } = useChatsStore()
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [others, setOthers] = useState<ContactChatLink[]>([])
  const [person, setPerson] = useState<ContactLite | null>(null)
  const [personLabels, setPersonLabels] = useState<ChatLabel[]>([])
  const [todos, setTodos] = useState<{ id: number; title: string; status: string; dueDate: string | null }[]>([])
  const [notes, setNotes] = useState(chat.notes ?? '')
  const [linking, setLinking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadPerson(): Promise<void> {
    if (chat.contactId) {
      const all = await window.api.chats.contacts()
      setPerson(all.find((c) => c.id === chat.contactId) ?? null)
      setOthers((await window.api.chats.contactChats(chat.contactId)).filter((o) => o.chatId !== chat.id))
      setPersonLabels(await window.api.chats.contactLabels(chat.contactId))
      setSuggestions([])
    } else {
      setPerson(null)
      setOthers([])
      setPersonLabels([])
      setSuggestions(chat.type === 'single' ? await window.api.chats.suggestContacts(chat.id) : [])
    }
  }

  useEffect(() => {
    setNotes(chat.notes ?? '')
    setErr(null)
    void loadPerson()
    void window.api.chats.todos(chat.id).then(setTodos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, chat.contactId, chat.todoCount])

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setErr(null)
    try {
      await fn()
      await refreshActive()
      await loadPerson()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function createPerson(): Promise<void> {
    const name = window.prompt('Nome da pessoa:', chat.title)
    if (!name) return
    await act(() => window.api.chats.createContact(chat.id, name))
  }

  async function setPersonPrio(priority: ChatPriority, vip: boolean): Promise<void> {
    if (!chat.contactId) return
    await act(() => window.api.chats.setContactPriority(chat.contactId!, priority, vip))
  }

  const mentions = (chat.unreadMentions ?? 0) > 0 && !chat.mentionsReviewed

  return (
    <div>
      <div className="chats-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <b style={{ fontSize: 13 }}>Detalhes</b>
        <button className="btn btn-secondary btn-sm chats-detail-close" onClick={() => setDetailOpen(false)}>✕</button>
      </div>
      {err && <div className="chats-msg err" style={{ marginTop: 0, marginBottom: 10 }}>{err}</div>}

      <div className="chats-panel-section">
        <h4>Pessoa</h4>
        {chat.type === 'group' ? (
          <div className="chats-person" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Grupo ({chat.participantCount ?? '?'} participantes). Grupos não viram pessoas: use tags para o contexto (família, trabalho…) e vincule as
            conversas individuais de cada participante.
          </div>
        ) : chat.contactId && person ? (
          <div className="chats-person">
            <div className="chats-row" style={{ justifyContent: 'space-between' }}>
              <b>{person.vip ? '⭐ ' : ''}{person.name}</b>
              <button className="chats-linkbtn" onClick={() => void act(() => window.api.chats.link([chat.id], null))}>desvincular</button>
            </div>
            <div className="chats-row" style={{ marginTop: 6 }}>
              <select value={person.priority ?? 'normal'} onChange={(e) => void setPersonPrio(e.target.value as ChatPriority, !!person.vip)} aria-label="Prioridade da pessoa">
                <option value="alta">Pessoa: prioridade alta</option>
                <option value="normal">Pessoa: normal</option>
                <option value="baixa">Pessoa: baixa</option>
              </select>
              <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={!!person.vip} onChange={(e) => void setPersonPrio((person.priority as ChatPriority) || 'normal', e.target.checked)} /> VIP
              </label>
            </div>
            <div className="chats-row" style={{ marginTop: 6 }}>
              <LabelChips labels={personLabels} max={6} />
              <LabelMenu ids={[chat.contactId]} entity="contact" current={personLabels} label="🏷 da pessoa" className="chats-linkbtn" onChanged={() => void loadPerson()} />
            </div>
            {person.context && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{person.context}</div>}
            {person.interests && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>💡 {person.interests}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {person.lastContactAt ? `Última conversa: ${new Date(person.lastContactAt).toLocaleDateString('pt-BR')}` : 'Sem conversa registrada'}
            </div>
            {others.length > 0 && (
              <div className="chats-person-nets">
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Outras conversas desta pessoa</div>
                {others.map((o) => (
                  <div key={o.chatId} className="chats-person-net" onClick={() => void open(o.chatId)}>
                    <span>{networkInfo(o.network).icon}</span>
                    <span style={{ flex: 1 }}>{networkInfo(o.network).label} · {o.title}</span>
                    {o.replyState === 'needs_reply' && <span className="chats-state needs_reply">responder</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="chats-row">
              <button className="btn btn-primary btn-sm" onClick={() => setLinking(true)}>Vincular pessoa</button>
              <button className="btn btn-secondary btn-sm" onClick={() => void createPerson()}>＋ Criar pessoa</button>
            </div>
            {suggestions.map((s) => (
              <div key={s.contactId} className="chats-suggest">
                <span>
                  Será <b>{s.name}</b>? <span style={{ color: 'var(--text-muted)' }}>({s.reason})</span>
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => void act(() => window.api.chats.link([chat.id], s.contactId))}>Vincular</button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="chats-panel-section">
        <h4>Estado</h4>
        <div className="chats-row">
          <StatePill state={chat.replyState} source={chat.replyStateSource} />
          {chat.replyState === 'none' && <span className="chats-mini">Não requer resposta</span>}
          <StateMenu ids={[chat.id]} label="Corrigir" className="chats-linkbtn" />
        </div>
        {chat.replyReason && <div className="chats-mini" style={{ marginTop: 4, whiteSpace: 'normal' }}>{chat.replyReason}</div>}
        {mentions && (
          <div className="chats-row" style={{ marginTop: 6 }}>
            <span className={`chats-mention ${chat.mentionsEstimated ? 'est' : ''}`}>{chat.mentionsEstimated ? '~' : ''}@{chat.unreadMentions}</span>
            <button className="chats-linkbtn" onClick={() => void act(() => window.api.chats.reviewMentions([chat.id]))}>marcar menções como revisadas</button>
          </div>
        )}
      </div>

      <div className="chats-panel-section">
        <h4>Prioridade</h4>
        <div className="chats-row">
          <span style={{ fontSize: 13 }}>{chat.priority ? chat.priority : `automática (sugerida: ${chat.suggestedPriority})`}</span>
          <PriorityMenu ids={[chat.id]} label="Alterar" className="chats-linkbtn" />
        </div>
      </div>

      <div className="chats-panel-section">
        <h4>Tags da conversa</h4>
        <div className="chats-row">
          <LabelChips labels={chat.labels} max={10} />
          <LabelMenu ids={[chat.id]} current={chat.labels} label={chat.labels.length ? 'editar' : '＋ tag'} className="chats-linkbtn" />
        </div>
      </div>

      <div className="chats-panel-section">
        <h4>Lembrete</h4>
        <div className="chats-row">
          {chat.snoozeUntil ? (
            <span style={{ fontSize: 13 }}>
              {chat.reminderDue ? '⏰ venceu ' : '💤 até '}
              {new Date(chat.snoozeUntil).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              {chat.reminderNote ? ` — ${chat.reminderNote}` : ''}
            </span>
          ) : (
            <span className="chats-mini">Nenhum</span>
          )}
          <SnoozeMenu ids={[chat.id]} current={chat.snoozeUntil} label={chat.snoozeUntil ? 'alterar' : '＋ lembrar'} className="chats-linkbtn" />
        </div>
      </div>

      <div className="chats-panel-section">
        <h4>Tarefas</h4>
        {todos.length === 0 && <span className="chats-mini">Nenhuma tarefa vinculada</span>}
        {todos.map((t) => (
          <div key={t.id} style={{ fontSize: 13, display: 'flex', gap: 6 }}>
            <span>{t.status === 'done' ? '✅' : '☐'}</span>
            <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</span>
            {t.dueDate && <span className="chats-mini">{t.dueDate}</span>}
          </div>
        ))}
      </div>

      <div className="chats-panel-section">
        <h4>Notas (só no rickOS)</h4>
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (chat.notes ?? '') && void window.api.chats.setNotes(chat.id, notes)} placeholder="Contexto, combinados, o que falta responder…" />
      </div>

      <div className="chats-panel-section">
        <h4>Informações</h4>
        <div className="chats-mini" style={{ whiteSpace: 'normal', lineHeight: 1.6 }}>
          {networkInfo(chat.network).label} · {chat.type === 'group' ? 'grupo' : 'individual'}
          {chat.isMuted ? ' · silenciada' : ''}
          <br />
          Não lidas: {chat.unreadCount == null ? 'não informado pelo provedor' : chat.unreadCount}
          <br />
          Última recebida: {chat.lastInboundAt ? new Date(chat.lastInboundAt).toLocaleString('pt-BR') : '—'}
          <br />
          Última sua: {chat.lastOutboundAt ? new Date(chat.lastOutboundAt).toLocaleString('pt-BR') : '—'}
          {chat.stale && (
            <>
              <br />⚠️ Provedor/conta inativo
            </>
          )}
        </div>
      </div>

      {linking && (
        <LinkPersonModal
          chat={chat}
          onClose={() => {
            setLinking(false)
            void refreshActive().then(loadPerson)
          }}
        />
      )}
    </div>
  )
}
