import React, { useEffect, useRef, useState } from 'react'
import type { ChatLabel, ChatPriority, ChatSummary, ReplyState } from '../../../../shared/chats'
import { networkInfo, REPLY_STATE_LABELS } from '../../../../shared/chats'

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

function hue(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}

export function Avatar({ chat, size = 38 }: { chat: Pick<ChatSummary, 'title' | 'network' | 'type'>; size?: number }): React.ReactElement {
  const n = networkInfo(chat.network)
  return (
    <div className="chats-avatar" style={{ width: size, height: size, background: `hsl(${hue(chat.title)} 45% 42%)` }} aria-hidden>
      {chat.type === 'group' ? '👥' : initials(chat.title)}
      <span className="net" title={n.label}>{n.icon}</span>
    </div>
  )
}

export function shortTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / 86400_000)
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (days < 1) return 'ontem'
  if (days < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function agoDays(iso: string | null): string {
  if (!iso) return ''
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000)
  if (d <= 0) {
    const h = Math.floor((Date.now() - Date.parse(iso)) / 3600_000)
    return h <= 0 ? 'agora' : `${h}h`
  }
  return `${d}d`
}

export function StatePill({ state, source }: { state: ReplyState; source?: 'manual' | 'auto' }): React.ReactElement | null {
  if (state === 'none') return null
  return (
    <span className={`chats-state ${state}`} title={source === 'manual' ? 'Definido por você' : 'Classificação automática'}>
      {REPLY_STATE_LABELS[state]}
      {source === 'manual' ? ' ✓' : ''}
    </span>
  )
}

export function LabelChips({ labels, max = 3 }: { labels: ChatLabel[]; max?: number }): React.ReactElement {
  return (
    <>
      {labels.slice(0, max).map((l) => (
        <span key={l.id} className="chats-label" style={{ borderColor: l.color, background: `color-mix(in srgb, ${l.color} 18%, transparent)` }}>
          {l.name}
        </span>
      ))}
      {labels.length > max && <span className="chats-mini">+{labels.length - max}</span>}
    </>
  )
}

export function PrioMark({ p }: { p: ChatPriority | null }): React.ReactElement | null {
  if (!p || p === 'normal') return null
  return <span className={`chats-prio ${p}`}>{p === 'alta' ? '▲ alta' : '▼ baixa'}</span>
}

/** Botão + menu flutuante que fecha ao clicar fora/Esc. */
export function Popover({
  label,
  children,
  className = 'btn btn-secondary btn-sm',
  align = 'right',
  title,
  disabled
}: {
  label: React.ReactNode
  children: (close: () => void) => React.ReactNode
  className?: string
  align?: 'left' | 'right'
  title?: string
  disabled?: boolean
}): React.ReactElement {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="chats-pop" ref={ref}>
      <button className={className} onClick={() => setOpen((o) => !o)} title={title} disabled={disabled} type="button">
        {label}
      </button>
      {open && <div className={`chats-pop-menu ${align === 'left' ? 'left' : ''}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

/** Datas rápidas para adiar/lembrar. */
export function quickDates(): { label: string; iso: string }[] {
  const at = (days: number, hour: number): string => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hour, 0, 0, 0)
    return d.toISOString()
  }
  const now = new Date()
  const laterToday = new Date(now.getTime() + 3 * 3600_000)
  const nextMonday = (): string => {
    const d = new Date()
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }
  return [
    { label: 'Daqui a 3 horas', iso: laterToday.toISOString() },
    { label: 'Amanhã 9h', iso: at(1, 9) },
    { label: 'Daqui a 3 dias', iso: at(3, 9) },
    { label: 'Próxima segunda', iso: nextMonday() },
    { label: 'Daqui a 1 semana', iso: at(7, 9) },
    { label: 'Daqui a 1 mês', iso: at(30, 9) }
  ]
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
