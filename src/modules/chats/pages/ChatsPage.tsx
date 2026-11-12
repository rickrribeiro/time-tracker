import React, { useEffect } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { ChatDetails } from '../components/ChatDetails'
import { ChatFilters } from '../components/ChatFilters'
import { ChatList } from '../components/ChatList'
import { ChatView } from '../components/ChatView'
import { StatusBadge } from '../components/StatusBadge'
import { useChatsStore } from '../store/chatsStore'
import '../chats.css'

/** Central de Mensagens: inbox unificada (WhatsApp, Instagram, LinkedIn… via provedor). */
export function ChatsPage(): React.ReactElement {
  const s = useChatsStore()
  const { status, counts, active, pane, detailOpen } = s

  useEffect(() => {
    let off: (() => void) | undefined
    void s.init().then((fn) => (off = fn))
    return () => off?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (s.ready && status && !status.enabled) {
    return (
      <div className="module-page">
        <div className="module-header">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>💬 Chats</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Central de Mensagens</p>
          </div>
        </div>
        <div className="chart-section" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 42 }}>💬</div>
          <div style={{ marginTop: 10, fontSize: 16, fontWeight: 600 }}>Central de Mensagens desativada</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, margin: '8px auto 16px' }}>
            Junte WhatsApp, Instagram, LinkedIn e outras redes (via Beeper) para não esquecer ninguém: triagem, lembretes, menções em
            grupos e sugestões de resposta com IA. Nada é enviado sem a sua confirmação.
          </p>
          <button className="btn btn-primary" onClick={() => useUIStore.getState().setPage('settings')}>Configurar em Configurações → Mensagens</button>
        </div>
      </div>
    )
  }

  return (
    <div className="chats-page" data-pane={pane}>
      <div className="chats-topbar">
        <h2>💬 Chats</h2>
        <div className="chats-tabs" role="tablist">
          <button className="chats-tab active" role="tab" aria-selected>
            📥 Inbox {counts?.unreadChats ? <span className="chats-count">{counts.unreadChats}</span> : null}
            {counts?.mentionChats ? <span className="chats-count mention" title="Conversas com menções a você">@{counts.mentionCount}</span> : null}
          </button>
        </div>
        <div className="chats-topbar-right">
          {status && <StatusBadge status={status} />}
          {status?.lastSyncAt && <span className="chats-mini">sincronizado {new Date(status.lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn btn-secondary btn-sm" disabled={status?.state === 'syncing'} onClick={() => void window.api.chats.syncNow().catch(() => undefined)} title="Sincronizar agora">↻</button>
        </div>
      </div>
      {status?.demo && <div className="chats-demo-banner" style={{ margin: '8px 16px 0' }}>⚠️ Modo demonstração: conversas e pessoas <b>fictícias</b>. Ative o Beeper em Configurações → Mensagens para usar seus dados reais.</div>}
      {status && (status.state === 'offline' || status.state === 'error' || status.state === 'unconfigured') && (
        <div className="chats-notice warn" style={{ margin: '8px 16px 0' }}>
          {status.state === 'unconfigured' ? 'Falta configurar o provedor. ' : status.state === 'offline' ? 'Provedor desconectado: mostrando dados locais, que podem estar desatualizados. ' : 'Erro no provedor: '}
          {status.message ?? status.lastError ?? ''}
        </div>
      )}

      <div className={`chats-body ${active ? '' : 'no-detail'} ${detailOpen ? 'detail-open' : ''}`} data-pane={pane}>
        <div className="chats-col chats-left">
          <ChatFilters />
          <ChatList />
        </div>
        <div className="chats-col chats-center">
          {active ? (
            <ChatView chat={active} />
          ) : (
            <div className="chats-empty" style={{ margin: 'auto' }}>
              Escolha uma conversa à esquerda.
              <br />
              <span style={{ fontSize: 12 }}>Abrir uma conversa não a marca como lida.</span>
            </div>
          )}
        </div>
        {active && (
          <div className="chats-col chats-right">
            <ChatDetails chat={active} />
          </div>
        )}
      </div>
    </div>
  )
}
