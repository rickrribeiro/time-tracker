import React, { useEffect, useState } from 'react'
import type { ChatFilter, RadarItem, RadarView as Radar } from '../../../../shared/chats'
import { useUIStore } from '../../../store/uiStore'
import { openChat, useChatsStore } from '../store/chatsStore'

export const RADAR_ICON: Record<RadarItem['kind'], string> = {
  reminder_due: '⏰',
  vip_waiting: '⭐',
  mentions: '@',
  professional: '💼',
  forgotten: '🕰',
  old_unread: '📭',
  no_contact: '👋',
  reopened: '🔁'
}

/** "Conversas precisando de atenção": ajuda a agir, sem virar cobrança. */
export function RadarView(): React.ReactElement {
  const { counts, setFilter, setTab } = useChatsStore()
  const [radar, setRadar] = useState<Radar | null>(null)

  useEffect(() => {
    const load = (): void => void window.api.chats.radar().then(setRadar).catch(() => setRadar({ items: [], summary: [] }))
    load()
    return window.api.chats.onUpdated(() => load())
  }, [])

  const go = (f: Partial<ChatFilter>): void => {
    setFilter(f, true)
    setTab('inbox')
  }

  function onItem(i: RadarItem): void {
    if (i.chatId) {
      openChat(i.chatId)
      return
    }
    if (i.kind === 'no_contact') {
      useUIStore.getState().setPage('crm')
      return
    }
    if (i.kind === 'mentions') go({ state: 'mentions', type: 'group', sort: 'recent' })
    else if (i.kind === 'old_unread') go({ state: 'unread', sort: 'recent', withinHours: null })
    else if (i.kind === 'professional') go({ state: 'needs_reply', sort: 'priority' })
    else go({ state: 'needs_reply' })
  }

  const stat = (label: string, value: number | string, sub: string | null, f: Partial<ChatFilter>): React.ReactElement => (
    <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => go(f)}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </button>
  )

  return (
    <div className="chats-radar">
      {counts && (
        <div className="chats-radar-grid">
          {stat('Preciso responder', counts.needsReply, 'conversas', { state: 'needs_reply' })}
          {stat('Menções em grupos', `${counts.mentionsEstimated ? '~' : ''}${counts.mentionCount}`, `${counts.mentionChats} grupo(s)${counts.mentionsEstimated ? ' · inclui estimativa' : ''}`, { state: 'mentions', type: 'group' })}
          {stat('Prioridade alta', counts.high, 'pendentes', { state: 'high' })}
          {stat('Aguardando resposta', counts.waiting, 'de outras pessoas', { state: 'waiting', sort: 'recent' })}
          {stat('Lembretes vencidos', counts.remindersDue, `${counts.snoozed} adiada(s)`, { state: 'reminders' })}
          {stat('Não lidas', counts.unreadChats, `${counts.unreadMessages} mensagens`, { state: 'unread', sort: 'recent' })}
        </div>
      )}

      <div className="chats-row" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <h3 className="dash-heading" style={{ margin: 0 }}>Conversas precisando de atenção</h3>
        <div className="chats-row">
          <button className="btn btn-secondary btn-sm" onClick={() => useChatsStore.setState({ tab: 'triage', triageMode: 'daily' })}>☕ Revisão diária</button>
          <button className="btn btn-primary btn-sm" onClick={() => useChatsStore.setState({ tab: 'triage', triageMode: 'backlog' })}>🧹 Organizar inbox</button>
        </div>
      </div>

      {radar && radar.items.length === 0 && (
        <div className="empty-hint">Nada pedindo atenção agora. 🎉 Use a Triagem quando quiser organizar o backlog, sem pressa.</div>
      )}
      {radar?.items.map((i, idx) => (
        <div key={`${i.kind}-${i.chatId ?? i.contactId ?? idx}`} className="chats-radar-item" onClick={() => onItem(i)} role="button" tabIndex={0}>
          <span className="ic">{RADAR_ICON[i.kind]}</span>
          <span className="tx">{i.text}</span>
          <span className="chats-mini">abrir →</span>
        </div>
      ))}
      {radar && radar.summary.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>{radar.summary.join(' · ')}</p>}
    </div>
  )
}
