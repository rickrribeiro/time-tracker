import React from 'react'
import type { ChatsStatus } from '../../../../shared/chats'

const LABEL: Record<ChatsStatus['state'], { text: string; cls: string }> = {
  disabled: { text: 'Desativado', cls: 'muted' },
  unconfigured: { text: 'Falta configurar', cls: 'warn' },
  idle: { text: 'Conectado', cls: 'ok' },
  connected: { text: 'Conectado · tempo real', cls: 'ok' },
  syncing: { text: 'Sincronizando…', cls: 'info' },
  offline: { text: 'Desconectado', cls: 'warn' },
  error: { text: 'Erro', cls: 'err' }
}

export function StatusBadge({ status, compact }: { status: ChatsStatus; compact?: boolean }): React.ReactElement {
  const l = LABEL[status.state] ?? LABEL.idle
  return (
    <span className={`chats-status ${l.cls}`} title={status.message ?? status.lastError ?? undefined}>
      <span className="dot" />
      {compact ? null : l.text}
      {status.demo && <span className="chats-demo-tag">DEMO</span>}
    </span>
  )
}
