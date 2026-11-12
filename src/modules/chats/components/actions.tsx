import React, { useState } from 'react'
import type { ChatLabel, ChatPriority, ManualReplyState } from '../../../../shared/chats'
import { REPLY_STATE_LABELS } from '../../../../shared/chats'
import { useChatsStore } from '../store/chatsStore'
import { Popover, quickDates, toLocalInput } from './ui'

const after = (): void => {
  void useChatsStore.getState().refreshCounts()
  void useChatsStore.getState().reload()
  void useChatsStore.getState().refreshActive()
}

export function SnoozeMenu({ ids, label = '⏰ Lembrar', className, current }: { ids: number[]; label?: string; className?: string; current?: string | null }): React.ReactElement {
  const [custom, setCustom] = useState(toLocalInput(current ?? null))
  const [note, setNote] = useState('')
  const [reopen, setReopen] = useState(true)
  async function apply(iso: string | null, close: () => void): Promise<void> {
    await window.api.chats.snooze(ids, iso, note || null, reopen)
    close()
    after()
  }
  return (
    <Popover label={label} className={className} title="Adiar e lembrar de responder">
      {(close) => (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px' }}>Some do radar até lá e lembra você</div>
          {quickDates().map((q) => (
            <button key={q.label} className="opt" onClick={() => void apply(q.iso, close)}>{q.label}</button>
          ))}
          <div className="sep" />
          <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <input placeholder="Nota (opcional): ex. responder sobre a vaga" value={note} onChange={(e) => setNote(e.target.value)} />
            <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} /> Reabrir se chegar mensagem nova
            </label>
            <button className="btn btn-primary btn-sm" disabled={!custom} onClick={() => void apply(new Date(custom).toISOString(), close)}>Definir</button>
          </div>
          {current && (
            <>
              <div className="sep" />
              <button className="opt" onClick={() => void apply(null, close)}>✕ Remover lembrete/adiamento</button>
            </>
          )}
        </>
      )}
    </Popover>
  )
}

const STATES: (Exclude<ManualReplyState, null>)[] = ['needs_reply', 'waiting', 'none', 'resolved']

export function StateMenu({ ids, label = 'Estado', className }: { ids: number[]; label?: string; className?: string }): React.ReactElement {
  return (
    <Popover label={label} className={className} title="Corrigir a classificação">
      {(close) => (
        <>
          {STATES.map((s) => (
            <button
              key={s}
              className="opt"
              onClick={() =>
                void window.api.chats.setState(ids, s).then(() => {
                  close()
                  after()
                })
              }
            >
              {s === 'needs_reply' ? '✍️ ' : s === 'waiting' ? '⏳ ' : s === 'none' ? '🚫 ' : '✅ '}
              {REPLY_STATE_LABELS[s]}
            </button>
          ))}
          <div className="sep" />
          <button className="opt" onClick={() => void window.api.chats.setState(ids, 'auto').then(() => (close(), after()))}>🤖 Voltar ao automático</button>
        </>
      )}
    </Popover>
  )
}

export function PriorityMenu({ ids, label = 'Prioridade', className }: { ids: number[]; label?: string; className?: string }): React.ReactElement {
  const opts: [ChatPriority | null, string][] = [
    ['alta', '▲ Alta'],
    ['normal', '● Normal'],
    ['baixa', '▼ Baixa'],
    [null, '🤖 Automática (sugerida)']
  ]
  return (
    <Popover label={label} className={className}>
      {(close) =>
        opts.map(([p, l]) => (
          <button key={l} className="opt" onClick={() => void window.api.chats.setPriority(ids, p).then(() => (close(), after()))}>{l}</button>
        ))
      }
    </Popover>
  )
}

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#64748b']

/** Aplica/remove tags em uma ou várias conversas (ou pessoas). */
export function LabelMenu({
  ids,
  current = [],
  entity = 'chat',
  label = '🏷 Tags',
  className,
  onChanged
}: {
  ids: number[]
  current?: ChatLabel[]
  entity?: 'chat' | 'contact'
  label?: string
  className?: string
  onChanged?: () => void
}): React.ReactElement {
  const labels = useChatsStore((s) => s.labels)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[4])
  const has = new Set(current.map((l) => l.id))
  async function toggle(l: ChatLabel): Promise<void> {
    if (has.has(l.id) && ids.length === 1) await window.api.chats.setLabels(entity, ids, [], [l.id])
    else await window.api.chats.setLabels(entity, ids, [l.id], [])
    onChanged?.()
    after()
  }
  async function create(): Promise<void> {
    if (!name.trim()) return
    const l = await window.api.chats.saveLabel(null, name.trim(), color)
    await window.api.chats.setLabels(entity, ids, [l.id], [])
    setName('')
    await useChatsStore.getState().refreshLabels()
    onChanged?.()
    after()
  }
  return (
    <Popover label={label} className={className}>
      {() => (
        <>
          {ids.length > 1 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px' }}>Aplicar a {ids.length} itens</div>}
          <div className="chats-pick-list">
            {labels.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>Nenhuma tag ainda.</div>}
            {labels.map((l) => (
              <label key={l.id} className="chats-pick">
                <input type="checkbox" checked={has.has(l.id)} onChange={() => void toggle(l)} />
                <span className="chats-color" style={{ background: l.color }} />
                <span>{l.name}</span>
              </label>
            ))}
          </div>
          {ids.length > 1 && current.length === 0 && labels.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px' }}>Em lote, marcar adiciona. Para remover, abra cada conversa.</div>
          )}
          <div className="sep" />
          <div style={{ display: 'flex', gap: 4, padding: '0 4px', alignItems: 'center' }}>
            <input placeholder="Nova tag" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void create()} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn btn-primary btn-sm" onClick={() => void create()}>＋</button>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: '6px 4px 2px' }}>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={`cor ${c}`} style={{ width: 18, height: 18, borderRadius: 4, background: c, border: color === c ? '2px solid var(--text-primary)' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
          </div>
        </>
      )}
    </Popover>
  )
}
