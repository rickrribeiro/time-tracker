import React, { useEffect, useState } from 'react'
import type { ChatFilter, ChatStateFilter } from '../../../../shared/chats'
import { networkInfo } from '../../../../shared/chats'
import { useChatsStore } from '../store/chatsStore'
import { Popover } from './ui'

const STATE_CHIPS: { id: ChatStateFilter; label: string; count?: (c: NonNullable<ReturnType<typeof useChatsStore.getState>['counts']>) => number }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'needs_reply', label: '✍️ Preciso responder', count: (c) => c.needsReply },
  { id: 'unread', label: 'Não lidas', count: (c) => c.unreadChats },
  { id: 'mentions', label: '@ Menções', count: (c) => c.mentionChats },
  { id: 'high', label: '🔥 Alta', count: (c) => c.high },
  { id: 'waiting', label: '⏳ Aguardando', count: (c) => c.waiting },
  { id: 'reminders', label: '⏰ Lembretes' },
  { id: 'snoozed', label: '💤 Adiadas', count: (c) => c.snoozed },
  { id: 'resolved', label: '✅ Resolvidas' },
  { id: 'none', label: 'Sem resposta necessária' }
]

const isFiltered = (f: ChatFilter): boolean =>
  !!(
    (f.state && f.state !== 'all') ||
    f.networks?.length ||
    (f.type && f.type !== 'all') ||
    f.withinHours ||
    f.from ||
    f.to ||
    f.pendingOlderThanDays ||
    (f.person && f.person !== 'all') ||
    f.labelIds?.length ||
    f.personLabelIds?.length ||
    f.search
  )

export function ChatFilters(): React.ReactElement {
  const { filter, setFilter, counts, labels, presets, total, refreshPresets } = useChatsStore()
  const [q, setQ] = useState(filter.search ?? '')
  const [more, setMore] = useState(false)

  // busca com debounce (não consulta a cada tecla)
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filter.search ?? '') !== q) setFilter({ search: q })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const nets = Object.entries(counts?.byNetwork ?? {}).sort((a, b) => b[1].chats - a[1].chats)
  const toggleNet = (n: string): void => {
    const cur = filter.networks ?? []
    setFilter({ networks: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n] })
  }
  const toggleLabel = (key: 'labelIds' | 'personLabelIds', id: number): void => {
    const cur = filter[key] ?? []
    setFilter({ [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] })
  }
  const time = filter.withinHours ? String(filter.withinHours) : filter.from || filter.to ? 'custom' : ''

  async function savePreset(): Promise<void> {
    const name = window.prompt('Nome do filtro salvo:')
    if (!name) return
    const { search: _s, ...f } = filter
    await window.api.chats.savePreset(name, f)
    await refreshPresets()
  }

  return (
    <div className="chats-filters">
      <div className="chats-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar nome, grupo, prévia, tag…" aria-label="Buscar conversas" />
        <Popover label="☰" title="Filtros salvos" className="btn btn-secondary btn-sm">
          {(close) => (
            <>
              {presets.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="opt" style={{ flex: 1 }} onClick={() => (setFilter(p.filter, true), setQ(''), close())}>{p.name}</button>
                  {!p.builtin && (
                    <button className="chats-linkbtn" title="Excluir" onClick={() => void window.api.chats.deletePreset(p.id).then(refreshPresets)}>✕</button>
                  )}
                </div>
              ))}
              <div className="sep" />
              <button className="opt" onClick={() => (void savePreset(), close())}>💾 Salvar filtro atual…</button>
            </>
          )}
        </Popover>
      </div>

      <div className="chats-chips">
        {STATE_CHIPS.slice(0, more ? STATE_CHIPS.length : 6).map((s) => {
          const n = s.count && counts ? s.count(counts) : null
          return (
            <button key={s.id} className={`chats-chip ${(filter.state ?? 'all') === s.id ? 'on' : ''}`} onClick={() => setFilter({ state: s.id })}>
              {s.label}
              {n ? <span className="n">{n}</span> : null}
            </button>
          )
        })}
      </div>

      {nets.length > 1 && (
        <div className="chats-chips">
          {nets.map(([n, v]) => {
            const info = networkInfo(n)
            return (
              <button key={n} className={`chats-chip ${filter.networks?.includes(n) ? 'on' : ''}`} onClick={() => toggleNet(n)} title={`${v.chats} conversas, ${v.unread} com não lidas`}>
                {info.icon} {info.label}
                {v.unread ? <span className="n">{v.unread}</span> : null}
              </button>
            )
          })}
        </div>
      )}

      {more && (
        <>
          <div className="chats-more">
            <select value={filter.type ?? 'all'} onChange={(e) => setFilter({ type: e.target.value as ChatFilter['type'] })} aria-label="Tipo">
              <option value="all">Individuais e grupos</option>
              <option value="single">Só individuais</option>
              <option value="group">Só grupos</option>
            </select>
            <select
              value={time}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'custom') setFilter({ withinHours: null, from: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10) })
                else setFilter({ withinHours: v ? Number(v) : null, from: null, to: null })
              }}
              aria-label="Período"
            >
              <option value="">Qualquer data</option>
              <option value="24">Últimas 24 horas</option>
              <option value="168">Últimos 7 dias</option>
              <option value="720">Últimos 30 dias</option>
              <option value="custom">Período personalizado</option>
            </select>
            {time === 'custom' && (
              <>
                <input type="date" value={filter.from?.slice(0, 10) ?? ''} onChange={(e) => setFilter({ from: e.target.value || null })} aria-label="De" />
                <input type="date" value={filter.to?.slice(0, 10) ?? ''} onChange={(e) => setFilter({ to: e.target.value ? `${e.target.value}T23:59:59` : null })} aria-label="Até" />
              </>
            )}
            <select value={filter.pendingOlderThanDays ?? ''} onChange={(e) => setFilter({ pendingOlderThanDays: e.target.value ? Number(e.target.value) : null })} aria-label="Sem resposta há">
              <option value="">Sem resposta há: qualquer</option>
              <option value="1">+1 dia sem resposta</option>
              <option value="3">+3 dias sem resposta</option>
              <option value="7">+7 dias sem resposta</option>
              <option value="30">+30 dias sem resposta</option>
            </select>
            <select value={filter.person ?? 'all'} onChange={(e) => setFilter({ person: e.target.value as ChatFilter['person'] })} aria-label="Pessoa">
              <option value="all">Com ou sem pessoa</option>
              <option value="linked">Com pessoa vinculada</option>
              <option value="unlinked">Sem pessoa vinculada</option>
            </select>
            <select value={filter.sort ?? 'priority'} onChange={(e) => setFilter({ sort: e.target.value as ChatFilter['sort'] })} aria-label="Ordenar">
              <option value="priority">Ordenar: prioridade</option>
              <option value="recent">Ordenar: mais recentes</option>
              <option value="oldest_pending">Ordenar: esperando há mais tempo</option>
            </select>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={!!filter.includeArchived} onChange={(e) => setFilter({ includeArchived: e.target.checked })} /> Incluir arquivadas no app
            </label>
          </div>
          {labels.length > 0 && (
            <>
              <div className="chats-filter-meta">Tags da conversa</div>
              <div className="chats-chips">
                {labels.map((l) => (
                  <button key={l.id} className={`chats-chip ${filter.labelIds?.includes(l.id) ? 'on' : ''}`} onClick={() => toggleLabel('labelIds', l.id)}>
                    <span className="chats-color" style={{ background: l.color }} /> {l.name}
                  </button>
                ))}
              </div>
              <div className="chats-filter-meta">Tags da pessoa</div>
              <div className="chats-chips">
                {labels.map((l) => (
                  <button key={l.id} className={`chats-chip ${filter.personLabelIds?.includes(l.id) ? 'on' : ''}`} onClick={() => toggleLabel('personLabelIds', l.id)}>
                    <span className="chats-color" style={{ background: l.color }} /> {l.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="chats-filter-meta">
        <span>{total} conversa{total === 1 ? '' : 's'}</span>
        <span style={{ display: 'flex', gap: 10 }}>
          <button className="chats-linkbtn" onClick={() => setMore((m) => !m)}>{more ? 'Menos filtros' : 'Mais filtros'}</button>
          {isFiltered(filter) && (
            <button className="chats-linkbtn" onClick={() => (setFilter({}, true), setQ(''))}>Limpar</button>
          )}
        </span>
      </div>
    </div>
  )
}
