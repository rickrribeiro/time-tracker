import React, { useRef, useState } from 'react'
import type { ChatSummary } from '../../../../shared/chats'
import { useChatsStore } from '../store/chatsStore'
import { LabelMenu, PriorityMenu, SnoozeMenu, StateMenu } from './actions'
import { BatchAiModal } from './BatchAiModal'
import { agoDays, Avatar, LabelChips, PrioMark, shortTime, StatePill } from './ui'

function preview(c: ChatSummary): string {
  if (!c.lastMessagePreview) return c.stale ? 'Provedor inativo — dados podem estar desatualizados' : ''
  if (c.lastMessageFromMe) return `Você: ${c.lastMessagePreview}`
  if (c.type === 'group' && c.lastMessageSender) return `${c.lastMessageSender}: ${c.lastMessagePreview}`
  return c.lastMessagePreview
}

export function ChatItem({ c, active, selected, selecting, onOpen, onToggle }: {
  c: ChatSummary
  active: boolean
  selected: boolean
  selecting: boolean
  onOpen: () => void
  onToggle: () => void
}): React.ReactElement {
  const mentions = (c.unreadMentions ?? 0) > 0 && !c.mentionsReviewed
  const vip = c.contactVip || c.contactPriority === 'alta' || c.priority === 'alta'
  const cls = [
    'chats-item',
    active ? 'active' : '',
    selected ? 'selected' : '',
    (c.unreadCount ?? 0) > 0 ? 'unread' : '',
    mentions ? 'hl-mention' : vip && c.replyState === 'needs_reply' ? 'hl-vip' : '',
    c.stale ? 'stale' : ''
  ].join(' ')
  return (
    <div className={cls} onClick={selecting ? onToggle : onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      {selecting && <input type="checkbox" className="chats-check" checked={selected} onChange={onToggle} onClick={(e) => e.stopPropagation()} aria-label={`Selecionar ${c.title}`} />}
      <Avatar chat={c} />
      <div className="chats-item-main">
        <div className="chats-item-top">
          <span className="chats-item-title">{c.contactName && c.contactName !== c.title ? `${c.contactName}` : c.title}</span>
          <span className="chats-item-time">{shortTime(c.lastActivity)}</span>
        </div>
        <div className="chats-item-preview">{preview(c)}</div>
        <div className="chats-item-meta">
          <StatePill state={c.replyState} source={c.replyStateSource} />
          {c.reopened && <span className="chats-state needs_reply">Reaberta</span>}
          {c.reminderDue && <span className="chats-state needs_reply">⏰ Lembrete</span>}
          {c.replyState === 'needs_reply' && c.pendingSince && <span className="chats-mini" title="Esperando resposta há">⌛ {agoDays(c.pendingSince)}</span>}
          {c.contactId && <span className="chats-mini" title={`Vinculada a ${c.contactName}`}>👤</span>}
          {c.contactVip && <span className="chats-mini" title="Pessoa VIP">⭐</span>}
          <PrioMark p={c.priority} />
          <LabelChips labels={c.labels} max={2} />
          {c.todoCount > 0 && <span className="chats-mini">☑ {c.todoCount}</span>}
          {c.isMuted && <span className="chats-mini" title="Silenciada">🔕</span>}
        </div>
      </div>
      <div className="chats-badges">
        {mentions && (
          <span className={`chats-mention ${c.mentionsEstimated ? 'est' : ''}`} title={c.mentionsEstimated ? 'Estimativa local (o provedor não informa menções)' : 'Menções não lidas a você'}>
            {c.mentionsEstimated ? '~' : ''}@{c.unreadMentions}
          </span>
        )}
        {(c.unreadCount ?? 0) > 0 && <span className={`chats-unread ${c.isMuted ? 'muted' : ''}`} title="Mensagens não lidas">{c.unreadCount! > 999 ? '999+' : c.unreadCount}</span>}
      </div>
    </div>
  )
}

export function ChatList(): React.ReactElement {
  const { items, hasMore, loading, loadMore, activeId, open, selected, toggleSelect, clearSelection, selectMany, error, status } = useChatsStore()
  const [selecting, setSelecting] = useState(false)
  const [batch, setBatch] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sel = selecting || selected.length > 0

  function onScroll(): void {
    const el = ref.current
    if (el && el.scrollTop + el.clientHeight > el.scrollHeight - 300) void loadMore()
  }

  return (
    <>
      {sel ? (
        <div className="chats-bulkbar">
          <b>{selected.length} selecionada{selected.length === 1 ? '' : 's'}</b>
          <button className="chats-linkbtn" onClick={() => selectMany(items.map((i) => i.id))}>todas visíveis</button>
          {selected.length > 0 && (
            <>
              <StateMenu ids={selected} label="Estado" />
              <SnoozeMenu ids={selected} label="⏰ Lembrar" />
              <PriorityMenu ids={selected} label="Prioridade" />
              <LabelMenu ids={selected} label="🏷 Tags" />
              <button className="btn btn-secondary btn-sm" onClick={() => void window.api.chats.reviewMentions(selected)} title="Marcar menções como revisadas">@✓</button>
              <button className="btn btn-primary btn-sm" onClick={() => setBatch(true)} title="Uma sugestão por conversa, revisando antes o que vai para a IA">✨ Sugestões IA</button>
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => (clearSelection(), setSelecting(false))}>Cancelar</button>
        </div>
      ) : (
        <div className="chats-filter-meta" style={{ padding: '4px 12px' }}>
          <span />
          <button className="chats-linkbtn" onClick={() => setSelecting(true)}>Selecionar várias</button>
        </div>
      )}
      <div className="chats-list" ref={ref} onScroll={onScroll}>
        {error && <div className="chats-empty">Erro ao carregar: {error}</div>}
        {!error && items.length === 0 && !loading && (
          <div className="chats-empty">
            {status?.state === 'syncing' ? 'Sincronizando conversas…' : 'Nenhuma conversa para estes filtros.'}
          </div>
        )}
        {items.map((c) => (
          <ChatItem key={c.id} c={c} active={c.id === activeId} selected={selected.includes(c.id)} selecting={sel} onOpen={() => void open(c.id)} onToggle={() => toggleSelect(c.id)} />
        ))}
        {hasMore && (
          <div className="chats-loadmore">
            <button className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Carregando…' : 'Carregar mais'}</button>
          </div>
        )}
      </div>
      {batch && <BatchAiModal chatIds={selected} onClose={() => setBatch(false)} />}
    </>
  )
}
