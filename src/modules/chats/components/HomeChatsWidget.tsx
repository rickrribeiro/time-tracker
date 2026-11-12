import React, { useEffect, useState } from 'react'
import type { ChatCounts, RadarItem } from '../../../../shared/chats'
import { openChat, openChatsWith, useChatsStore } from '../store/chatsStore'
import { RADAR_ICON } from './RadarView'
import '../chats.css'

/**
 * Widget opcional da Home. Some com o módulo desligado ou com o widget desativado em
 * Configurações → Mensagens. Conversas ≠ mensagens; estimativas aparecem com "~".
 */
export function HomeChatsWidget(): React.ReactElement | null {
  const [show, setShow] = useState(false)
  const [counts, setCounts] = useState<ChatCounts | null>(null)
  const [alerts, setAlerts] = useState<RadarItem[]>([])

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const { config } = await window.api.chats.config()
        if (!alive) return
        const on = config.enabled && config.homeWidget
        setShow(on)
        if (!on) return
        const [c, r] = await Promise.all([window.api.chats.counts(), window.api.chats.radar()])
        if (!alive) return
        setCounts(c)
        setAlerts(r.items.filter((i) => config.homeAlerts.includes(i.kind)).slice(0, 4))
      } catch {
        setShow(false)
      }
    }
    void load()
    const off = window.api.chats.onUpdated(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [])

  if (!show || !counts) return null

  return (
    <>
      <h3 className="dash-heading">Central de Mensagens</h3>
      <div className="chats-widget-grid">
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'unread', sort: 'recent' })}>
          <div className="stat-card-label">Não lidas</div>
          <div className="stat-card-value">{counts.unreadChats}</div>
          <div className="stat-card-sub">conversas · {counts.unreadMessages} mensagens</div>
        </button>
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'needs_reply' })}>
          <div className="stat-card-label">Possivelmente pendentes</div>
          <div className="stat-card-value">{counts.needsReply}</div>
          <div className="stat-card-sub">conversas sem resposta sua</div>
        </button>
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'mentions', type: 'group', sort: 'recent' })}>
          <div className="stat-card-label">Menções em grupos</div>
          <div className="stat-card-value">{counts.mentionsEstimated ? '~' : ''}{counts.mentionCount}</div>
          <div className="stat-card-sub">em {counts.mentionChats} grupo(s){counts.mentionsEstimated ? ' · com estimativa' : ''}</div>
        </button>
        <button className="stat-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openChatsWith({ state: 'high' })}>
          <div className="stat-card-label">Prioridade alta</div>
          <div className="stat-card-value">{counts.high}</div>
          <div className="stat-card-sub">conversas</div>
        </button>
      </div>
      {alerts.length > 0 && (
        <div className="chats-widget-alerts">
          {alerts.map((a, i) => (
            <div key={`${a.kind}-${i}`} className="chats-widget-alert" role="button" tabIndex={0} onClick={() => (a.chatId ? openChat(a.chatId) : openChatsWith({ state: 'needs_reply' }, 'radar'))}>
              {RADAR_ICON[a.kind]} {a.text}
            </div>
          ))}
        </div>
      )}
      <div className="chats-row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={() => (useChatsStore.setState({ triageMode: 'backlog' }), openChatsWith({ state: 'needs_reply' }, 'triage'))}>🧹 Organizar inbox</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openChatsWith({ state: 'high' })}>🔥 Ver prioritárias</button>
      </div>
    </>
  )
}
