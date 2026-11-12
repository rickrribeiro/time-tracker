import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, ChatSummary, ChatTemplate, MessagePage } from '../../../../shared/chats'
import { networkInfo } from '../../../../shared/chats'
import { authedUrl } from '../../../api/transport'
import { useChatsStore } from '../store/chatsStore'
import { SnoozeMenu, StateMenu } from './actions'
import { AiPanel } from './AiPanel'
import { Avatar, Popover } from './ui'

let cfgCache: { markReadOnOpen: boolean } | null = null

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === y.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export function ConfirmSend({ chat, text, onCancel, onConfirm, busy }: { chat: ChatSummary; text: string; onCancel: () => void; onConfirm: () => void; busy?: boolean }): React.ReactElement {
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCancel])
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%' }}>
        <h2>Enviar mensagem?</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Para <b>{chat.contactName || chat.title}</b> no {networkInfo(chat.network).icon} {networkInfo(chat.network).label}
        </p>
        <div className="chats-bubble" style={{ maxWidth: '100%', margin: '8px 0' }}>{text}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={busy} autoFocus>{busy ? 'Enviando…' : 'Confirmar envio'}</button>
        </div>
      </div>
    </div>
  )
}

function TodoModal({ chat, message, onClose }: { chat: ChatSummary; message: ChatMessage | null; onClose: () => void }): React.ReactElement {
  const [title, setTitle] = useState(message ? `${chat.contactName || chat.title}: ${message.text.replace(/\s+/g, ' ').slice(0, 80)}` : `Responder ${chat.contactName || chat.title}`)
  const [due, setDue] = useState('')
  const [err, setErr] = useState<string | null>(null)
  async function save(): Promise<void> {
    try {
      await window.api.chats.createTodo(chat.id, title, due || null, message?.id ?? null)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
        <h2>☑ Criar tarefa</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vai para o TODO, vinculada a esta conversa{chat.contactName ? ` e a ${chat.contactName}` : ''}.</p>
        <div className="editor-field">
          <label>Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="editor-field">
          <label>Prazo (opcional)</label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        {err && <div className="chats-msg err">{err}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={() => void save()}>Criar</button>
        </div>
      </div>
    </div>
  )
}

function DeleteModal({ chat, message, onClose, onDone }: { chat: ChatSummary; message: ChatMessage; onClose: () => void; onDone: () => void }): React.ReactElement {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  async function run(forEveryone: boolean): Promise<void> {
    setBusy(true)
    setErr(null)
    try {
      await window.api.chats.deleteMessage(chat.id, message.id, forEveryone)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%' }}>
        <h2>Apagar mensagem?</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Em <b>{chat.contactName || chat.title}</b> no {networkInfo(chat.network).icon} {networkInfo(chat.network).label}. Não dá para desfazer.
        </p>
        <div className="chats-bubble" style={{ maxWidth: '100%', margin: '8px 0' }}>{message.text || <i>(sem texto)</i>}</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>"Para todos" depende da rede (algumas só permitem por um tempo depois do envio). Se a rede recusar, nada é apagado e o motivo aparece aqui.</p>
        {err && <div className="chats-msg err">{err}</div>}
        <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-secondary btn-sm" onClick={() => void run(false)} disabled={busy}>Apagar só para mim</button>
          <button className="btn btn-danger btn-sm" onClick={() => void run(true)} disabled={busy} autoFocus>{busy ? 'Apagando…' : 'Apagar para todos'}</button>
        </div>
      </div>
    </div>
  )
}

export function ChatView({ chat }: { chat: ChatSummary }): React.ReactElement {
  const { status, setPane, setDetailOpen, detailOpen, refreshActive } = useChatsStore()
  const [page, setPage] = useState<MessagePage | null>(null)
  const [items, setItems] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState<string | null>(null)
  const [ai, setAi] = useState<'suggest' | 'summary' | null>(null)
  const [todoFor, setTodoFor] = useState<ChatMessage | null | undefined>(undefined)
  const [templates, setTemplates] = useState<ChatTemplate[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ChatMessage | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  const offline = status?.state === 'offline' || status?.state === 'error' || status?.state === 'disabled'
  const canSend = !chat.stale && !offline && !!status?.capabilities.sendMessages
  const canEdit = !chat.stale && !offline && !!status?.capabilities.editMessages
  const canDelete = !chat.stale && !offline && !!status?.capabilities.deleteMessages

  async function load(): Promise<void> {
    setLoading(true)
    setErr(null)
    try {
      const p = await window.api.chats.messages(chat.id)
      setPage(p)
      setItems(p.items)
      stick.current = true
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // Esc fecha o painel de IA e, depois, a seleção (fora de campos de texto)
  useEffect(() => {
    if (!ai && !picking) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT')) return
      if (document.querySelector('.modal-overlay')) return
      if (ai) setAi(null)
      else {
        setPicking(false)
        setPicked([])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ai, picking])

  useEffect(() => {
    setPicked([])
    setPicking(false)
    setReplyTo(null)
    setAi(null)
    setText('')
    setSendErr(null)
    setEditing(null)
    setDeleting(null)
    void load()
    void (async () => {
      cfgCache ??= (await window.api.chats.config()).config
      if (cfgCache.markReadOnOpen && (chat.unreadCount ?? 0) > 0 && status?.capabilities.markAsRead) await window.api.chats.markRead(chat.id, true).catch(() => undefined)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id])

  // tempo real: recarrega a página recente quando a conversa muda (sem perder as antigas carregadas)
  useEffect(() => {
    return window.api.chats.onUpdated(({ chatIds }) => {
      if (!chatIds.includes(chat.id)) return
      void window.api.chats.messages(chat.id).then((p) => {
        setItems((old) => {
          const m = new Map(old.map((x) => [x.id, x]))
          for (const x of p.items) m.set(x.id, x)
          return [...m.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey, undefined, { numeric: true }))
        })
      })
    })
  }, [chat.id])

  useEffect(() => {
    if (stick.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [items])

  async function older(): Promise<ChatMessage[]> {
    if (!page?.cursor) return []
    const el = listRef.current
    const prevH = el?.scrollHeight ?? 0
    stick.current = false
    const p = await window.api.chats.messages(chat.id, page.cursor)
    setPage({ ...p, items: [] })
    setItems((old) => {
      const ids = new Set(old.map((x) => x.id))
      return [...p.items.filter((x) => !ids.has(x.id)), ...old]
    })
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH
    })
    return p.items
  }

  async function gotoMention(): Promise<void> {
    let target = [...items].reverse().find((m) => m.mentionsMe)
    for (let i = 0; !target && i < 5 && page?.cursor; i++) {
      const more = await older()
      target = [...more].reverse().find((m) => m.mentionsMe)
    }
    if (!target) return
    setFlash(target.id)
    stick.current = false
    setTimeout(() => document.getElementById(`msg-${target!.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
    setTimeout(() => setFlash(null), 1800)
  }

  const togglePick = (id: string): void => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  function pickSinceMyLast(): void {
    let last = -1
    items.forEach((m, i) => {
      if (m.isMine) last = i
    })
    const ids = items.slice(last + 1).filter((m) => !m.isMine && !m.deleted).map((m) => m.id)
    setPicked(ids.length ? ids : items.filter((m) => !m.isMine).slice(-3).map((m) => m.id))
    setPicking(true)
  }

  async function send(body: string, reply: ChatMessage | null): Promise<boolean> {
    setSending(true)
    setSendErr(null)
    try {
      await window.api.chats.send(chat.id, body, reply?.id ?? null)
      stick.current = true
      await load()
      void refreshActive()
      return true
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSending(false)
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return
    const original = items.find((m) => m.id === editing.id)
    if (original && original.text === editing.text.trim()) {
      setEditing(null)
      return
    }
    setEditBusy(true)
    setEditErr(null)
    try {
      await window.api.chats.editMessage(chat.id, editing.id, editing.text)
      setItems((old) => old.map((m) => (m.id === editing.id ? { ...m, text: editing.text.trim(), edited: true } : m)))
      setEditing(null)
      void refreshActive()
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEditBusy(false)
    }
  }

  async function sendComposer(): Promise<void> {
    if (!text.trim() || !canSend) return
    if (await send(text, replyTo)) {
      setText('')
      setReplyTo(null)
    }
  }

  const byId = useMemo(() => new Map(items.map((m) => [m.id, m])), [items])
  const pickedMsgs = items.filter((m) => picked.includes(m.id))
  const hasMention = (chat.unreadMentions ?? 0) > 0 || items.some((m) => m.mentionsMe)
  const n = networkInfo(chat.network)

  let lastDay = ''
  return (
    <>
      <div className="chats-view-head">
        <button className="btn btn-secondary btn-sm chats-back" onClick={() => setPane('list')} aria-label="Voltar">←</button>
        <Avatar chat={chat} size={34} />
        <div className="chats-view-title">
          <b>{chat.contactName && chat.contactName !== chat.title ? `${chat.contactName} · ${chat.title}` : chat.title}</b>
          <span>
            {n.icon} {n.label}
            {chat.type === 'group' && chat.participantCount ? ` · ${chat.participantCount} participantes` : ''}
            {chat.peerHandle ? ` · ${chat.peerHandle}` : ''}
          </span>
        </div>
        <div className="chats-view-actions">
          {hasMention && <button className="btn btn-secondary btn-sm" onClick={() => void gotoMention()} title="Ir para a menção">@ Ir p/ menção</button>}
          {status?.capabilities.markAsRead && (chat.unreadCount ?? 0) > 0 && (
            <button className="btn btn-secondary btn-sm" disabled={offline || chat.stale} onClick={() => void window.api.chats.markRead(chat.id, true).then(refreshActive)}>✓ Marcar lida</button>
          )}
          {status?.capabilities.markAsUnread && (chat.unreadCount ?? 0) === 0 && (
            <button className="btn btn-secondary btn-sm" disabled={offline || chat.stale} onClick={() => void window.api.chats.markRead(chat.id, false).then(refreshActive)}>● Não lida</button>
          )}
          <StateMenu ids={[chat.id]} label="Estado" />
          <SnoozeMenu ids={[chat.id]} current={chat.snoozeUntil} />
          <button className="btn btn-secondary btn-sm" onClick={() => (picking ? (setPicking(false), setPicked([])) : setPicking(true))}>{picking ? 'Cancelar seleção' : '☑ Selecionar'}</button>
          <button className="btn btn-secondary btn-sm chats-info-btn" onClick={() => setDetailOpen(!detailOpen)} title="Pessoa, tags, notas">ℹ️ Detalhes</button>
        </div>
      </div>

      {chat.stale && <div className="chats-notice warn">Esta conversa é de um provedor/conta inativo: dados podem estar desatualizados e o envio está bloqueado.</div>}
      {!chat.stale && offline && <div className="chats-notice warn">Provedor indisponível: mostrando o que estiver em cache. Envio e ações remotas ficam bloqueados.</div>}
      {page?.fromCache && <div className="chats-notice">Mensagens do cache local (podem estar desatualizadas).</div>}

      <div className="chats-messages" ref={listRef} onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollTop + el.clientHeight > el.scrollHeight - 80
      }}>
        {page?.cursor && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => void older()}>Carregar mais antigas</button>
          </div>
        )}
        {page && !page.cursor && items.length > 0 && page.partialHistory && (
          <div className="chats-day">Início do histórico disponível no provedor (pode haver mensagens mais antigas fora do alcance)</div>
        )}
        {loading && items.length === 0 && <div className="chats-empty">Carregando mensagens…</div>}
        {err && <div className="chats-empty">Não foi possível carregar: {err}</div>}
        {!loading && !err && items.length === 0 && <div className="chats-empty">Nenhuma mensagem disponível.</div>}
        {items.map((m) => {
          const d = new Date(m.timestamp).toDateString()
          const showDay = d !== lastDay
          lastDay = d
          const ref = m.replyToId ? byId.get(m.replyToId) : null
          return (
            <React.Fragment key={m.id}>
              {showDay && <div className="chats-day">{dayLabel(m.timestamp)}</div>}
              <div className={`chats-msgrow ${m.isMine ? 'mine' : ''}`} id={`msg-${m.id}`}>
                {picking && <input type="checkbox" className="chats-msgsel" checked={picked.includes(m.id)} onChange={() => togglePick(m.id)} aria-label="Selecionar mensagem" />}
                <div
                  className={`chats-bubble ${m.mentionsMe ? 'mention' : ''} ${picked.includes(m.id) ? 'picked' : ''} ${flash === m.id ? 'flash' : ''} ${editing?.id === m.id ? 'editing' : ''}`}
                  onClick={picking ? () => togglePick(m.id) : undefined}
                >
                  {chat.type === 'group' && !m.isMine && <div className="chats-sender">{m.senderName}</div>}
                  {ref && <div className="chats-reply-ref">↩ {ref.isMine ? 'Você' : ref.senderName}: {ref.text.slice(0, 80)}</div>}
                  {m.deleted ? (
                    <i style={{ color: 'var(--text-muted)' }}>Mensagem apagada</i>
                  ) : editing?.id === m.id ? (
                    <div className="chats-edit" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={editing.text}
                        autoFocus
                        rows={Math.min(8, Math.max(2, editing.text.split('\n').length))}
                        onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditing(null)
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            void saveEdit()
                          }
                        }}
                      />
                      {editErr && <div className="chats-msg err" style={{ margin: 0 }}>{editErr}</div>}
                      <div className="chats-edit-actions">
                        <span>A edição aparece para todos na conversa.</span>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)} disabled={editBusy}>Cancelar</button>
                        <button className="btn btn-primary btn-sm" onClick={() => void saveEdit()} disabled={editBusy || !editing.text.trim()}>{editBusy ? 'Salvando…' : 'Salvar edição'}</button>
                      </div>
                    </div>
                  ) : (
                    m.text
                  )}
                  {m.attachments.map((a, i) => (
                    <div className="chats-attach" key={i}>
                      {a.url && a.type === 'image' ? (
                        <a href={authedUrl(a.url)} target="_blank" rel="noreferrer"><img src={authedUrl(a.url)} alt={a.fileName ?? 'imagem'} loading="lazy" /></a>
                      ) : a.url ? (
                        <a href={authedUrl(a.url)} target="_blank" rel="noreferrer">📎 {a.fileName ?? a.type}</a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>📎 {a.fileName ?? a.type} (indisponível)</span>
                      )}
                    </div>
                  ))}
                  {m.reactions.length > 0 && (
                    <div className="chats-reactions">{m.reactions.map((r) => <span key={r.emoji}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ''}</span>)}</div>
                  )}
                  <div className="chats-bubble-meta">
                    {m.mentionsMe && <span title={m.mentionEstimated ? 'Estimativa (texto cita seu nome)' : 'Menciona você'}>{m.mentionEstimated ? '~@' : '@'} você</span>}
                    {m.edited && <span>editada</span>}
                    <span>{new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {!picking && !m.deleted && editing?.id !== m.id && (
                    <div className="chats-msg-menu">
                      {status?.capabilities.replyTo && <button title="Responder a esta" onClick={() => setReplyTo(m)}>↩</button>}
                      <button title="Selecionar" onClick={() => (setPicking(true), setPicked([m.id]))}>☑</button>
                      <button title="Criar tarefa" onClick={() => setTodoFor(m)}>✓ tarefa</button>
                      {m.isMine && !m.pending && canEdit && m.text && m.attachments.length === 0 && (
                        <button title="Editar mensagem" onClick={() => (setEditErr(null), setEditing({ id: m.id, text: m.text }))}>✎ editar</button>
                      )}
                      {m.isMine && !m.pending && canDelete && <button title="Apagar mensagem" onClick={() => setDeleting(m)}>🗑 apagar</button>}
                    </div>
                  )}
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {(picking || picked.length > 0) && (
        <div className="chats-selbar">
          <b>{picked.length} selecionada{picked.length === 1 ? '' : 's'}</b>
          <button className="btn btn-primary btn-sm" disabled={!picked.length} onClick={() => setAi('suggest')}>✨ Gerar sugestões</button>
          <button className="btn btn-secondary btn-sm" disabled={!picked.length} onClick={() => setAi('summary')}>📝 Resumir</button>
          <button className="btn btn-secondary btn-sm" disabled={picked.length !== 1} onClick={() => setTodoFor(pickedMsgs[0] ?? null)}>☑ Tarefa</button>
          <span style={{ flex: 1 }} />
          <button className="chats-linkbtn" onClick={pickSinceMyLast}>desde minha última resposta</button>
          <button className="chats-linkbtn" onClick={() => setPicked(items.slice(-5).map((m) => m.id))}>últimas 5</button>
          <button className="chats-linkbtn" onClick={() => setPicked([])}>limpar</button>
          <button className="chats-x" onClick={() => (setPicking(false), setPicked([]), setAi(null))} title="Fechar seleção (Esc)" aria-label="Fechar seleção">✕</button>
        </div>
      )}

      {ai && (
        <AiPanel
          chat={chat}
          mode={ai}
          messages={pickedMsgs}
          canSend={canSend}
          onClose={() => setAi(null)}
          onUse={(t) => setText(t)}
          onSend={(t, msgId) => send(t, msgId ? byId.get(msgId) ?? null : null)}
        />
      )}

      <div className="chats-composer">
        {replyTo && (
          <div className="chats-replying">
            ↩ Respondendo a {replyTo.isMine ? 'você' : replyTo.senderName}: <i>{replyTo.text.slice(0, 60)}</i>
            <button className="chats-linkbtn" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        {sendErr && <div className="chats-msg err" style={{ marginTop: 0 }}>{sendErr}</div>}
        <div className="chats-composer-row">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={canSend ? 'Escreva uma resposta… (Ctrl/⌘+Enter envia)' : 'Envio indisponível agora (provedor offline ou conversa inativa)'}
            rows={2}
            disabled={!canSend}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void sendComposer()
              }
            }}
          />
          <button className="btn btn-primary" disabled={!canSend || !text.trim() || sending} onClick={() => void sendComposer()}>{sending ? '…' : 'Enviar'}</button>
        </div>
        <div className="chats-composer-tools">
          <Popover label="⚡ Respostas rápidas" className="btn btn-secondary btn-sm" align="left" up>
            {(close) => (
              <TemplatesList
                templates={templates}
                onLoad={() => void window.api.chats.templates().then(setTemplates)}
                onPick={(t) => {
                  setText((cur) => (cur ? `${cur}\n${t.body}` : t.body))
                  close()
                }}
              />
            )}
          </Popover>
          <button className="btn btn-secondary btn-sm" onClick={pickSinceMyLast} title="Seleciona as mensagens recebidas desde sua última resposta">✨ Sugerir resposta</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTodoFor(null)}>☑ Tarefa</button>
        </div>
      </div>

      {deleting && (
        <DeleteModal
          chat={chat}
          message={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null)
            void load()
            void refreshActive()
          }}
        />
      )}
      {todoFor !== undefined && <TodoModal chat={chat} message={todoFor} onClose={() => setTodoFor(undefined)} />}
    </>
  )
}

function TemplatesList({ templates, onLoad, onPick }: { templates: ChatTemplate[]; onLoad: () => void; onPick: (t: ChatTemplate) => void }): React.ReactElement {
  useEffect(onLoad, [])
  return (
    <>
      {templates.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>Crie modelos em Configurações → Mensagens → IA → Respostas rápidas.</div>}
      {templates.map((t) => (
        <button key={t.id} className="opt" onClick={() => onPick(t)} title={t.body}>{t.title}</button>
      ))}
    </>
  )
}
