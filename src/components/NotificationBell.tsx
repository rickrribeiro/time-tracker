import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotificationStore, wireNotifications } from '../store/notificationStore'
import { useUIStore } from '../store/uiStore'
import { AppNotification } from '../types'

const SOURCE_LABEL: Record<string, string> = {
  automacao: 'Automação',
  agendador: 'Agente agendado',
  ia: 'IA',
  sistema: 'Sistema'
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Sino ao lado do logo: badge de não lidas + painel com a central de notificações. */
export function NotificationBell(): React.ReactElement {
  const { items, unread, loaded, load, markRead, markAllRead, remove, clear } = useNotificationStore()
  const setPage = useUIStore((s) => s.setPage)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    wireNotifications()
  }, [])

  // Ao abrir: recarrega e posiciona o painel logo abaixo do sino (fixed → não é cortado pela sidebar).
  useLayoutEffect(() => {
    if (!open) return
    void load().catch(() => undefined)
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const width = 360
      setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 8)) })
    }
  }, [open, load])

  // Fecha com clique fora / Esc; atualiza os "há X min" enquanto aberto.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const iv = window.setInterval(() => tick((x) => x + 1), 30000)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.clearInterval(iv)
    }
  }, [open])

  const visible = filter === 'unread' ? items.filter((n) => !n.readAt) : items
  const hasRead = items.some((n) => n.readAt)

  const openItem = (n: AppNotification): void => {
    if (!n.readAt) void markRead(n.id)
    if (n.page) {
      setPage(n.page)
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        className={`notif-bell ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={unread ? `${unread} notificação(ões) não lida(s)` : 'Notificações'}
        aria-label="Notificações"
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && createPortal(
        <div ref={panelRef} className="notif-panel" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label="Notificações">
          <div className="notif-head">
            <strong>Notificações</strong>
            <button className="notif-link" onClick={() => void markAllRead()} disabled={!unread}>
              Marcar todas como lidas
            </button>
          </div>
          <div className="notif-tabs">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              Todas
            </button>
            <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
              Não lidas{unread ? ` (${unread})` : ''}
            </button>
          </div>

          <div className="notif-list">
            {!loaded && <div className="notif-empty">Carregando…</div>}
            {loaded && visible.length === 0 && (
              <div className="notif-empty">
                <div style={{ fontSize: 28 }}>🔕</div>
                {filter === 'unread' ? 'Nada pendente por aqui.' : 'Nenhuma notificação ainda.'}
              </div>
            )}
            {visible.map((n) => (
              <div
                key={n.id}
                className={`notif-item ${n.readAt ? 'read' : 'unread'} ${n.page ? 'clickable' : ''}`}
                onClick={() => openItem(n)}
              >
                <span className="notif-dot" aria-hidden />
                <div className="notif-body">
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="notif-text">{n.body}</div>}
                  <div className="notif-meta">
                    {SOURCE_LABEL[n.source] ?? n.source} · {timeAgo(n.createdAt)}
                  </div>
                </div>
                <div className="notif-actions">
                  <button
                    title={n.readAt ? 'Marcar como não lida' : 'Marcar como lida'}
                    onClick={(e) => {
                      e.stopPropagation()
                      void markRead(n.id, !n.readAt)
                    }}
                  >
                    {n.readAt ? '●' : '✓'}
                  </button>
                  <button
                    title="Remover"
                    onClick={(e) => {
                      e.stopPropagation()
                      void remove(n.id)
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {items.length > 0 && (
            <div className="notif-foot">
              <button className="notif-link" onClick={() => void clear(true)} disabled={!hasRead}>
                Limpar lidas
              </button>
              <button
                className="notif-link danger"
                onClick={() => {
                  if (window.confirm('Apagar todas as notificações?')) void clear(false)
                }}
              >
                Apagar todas
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

/** Pontinho no botão ☰ do celular quando há notificações não lidas. */
export function UnreadDot(): React.ReactElement | null {
  const unread = useNotificationStore((s) => s.unread)
  return unread > 0 ? <span className="notif-menu-dot" aria-label={`${unread} não lidas`} /> : null
}
