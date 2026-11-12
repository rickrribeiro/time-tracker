import React, { useCallback, useEffect, useState } from 'react'
import type { ChatFilter, ChatSummary } from '../../../../shared/chats'
import { networkInfo } from '../../../../shared/chats'
import { useChatsStore } from '../store/chatsStore'
import { LabelMenu, PriorityMenu, SnoozeMenu, StateMenu } from './actions'
import { BatchAiModal } from './BatchAiModal'
import { agoDays, Avatar, LabelChips, PrioMark, StatePill } from './ui'

import type { TriageMode as Mode } from '../store/chatsStore'

const MODES: { id: Mode; label: string; filter: ChatFilter }[] = [
  { id: 'backlog', label: '✍️ Preciso responder', filter: { state: 'needs_reply', sort: 'priority' } },
  { id: 'daily', label: '☕ Revisão diária', filter: { state: 'needs_reply', sort: 'priority' } },
  { id: 'mentions', label: '@ Menções', filter: { state: 'mentions', type: 'group', sort: 'recent' } },
  { id: 'unread', label: '📭 Não lidas', filter: { state: 'unread', sort: 'priority' } },
  { id: 'professional', label: '💼 Oportunidades', filter: { state: 'needs_reply', sort: 'priority' } }
]

/**
 * Triagem do backlog em lotes: decisões rápidas sem abrir chat por chat. Processar aos
 * poucos — nada obriga a zerar tudo no mesmo dia. Nunca envia nem marca como lido.
 */
export function TriageView(): React.ReactElement {
  const { open, setTab, setDetailOpen, counts, triageMode } = useChatsStore()
  const [mode, setMode] = useState<Mode>(triageMode)
  const [size, setSize] = useState(10)
  const [daily, setDaily] = useState(5)
  const [networks, setNetworks] = useState<string[]>([])
  const [batch, setBatch] = useState<ChatSummary[]>([])
  const [done, setDone] = useState<Record<number, string>>({})
  const [processed, setProcessed] = useState<number[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [total, setTotal] = useState(0)
  const [ai, setAi] = useState<number[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [profLabels, setProfLabels] = useState<number[]>([])

  useEffect(() => {
    void window.api.chats.config().then(async (r) => {
      setDaily(r.config.dailyReviewSize)
      const labels = await window.api.chats.labels()
      const names = new Set(r.config.professionalLabels.map((x) => x.toLowerCase()))
      setProfLabels(labels.filter((l) => names.has(l.name.toLowerCase())).map((l) => l.id))
    })
  }, [])
  useEffect(() => setMode(triageMode), [triageMode])

  const load = useCallback(
    async (exclude: number[]) => {
      setLoading(true)
      const m = MODES.find((x) => x.id === mode)!
      const n = mode === 'daily' ? daily : size
      const filter: ChatFilter = { ...m.filter, networks: networks.length ? networks : undefined, ...(mode === 'professional' ? { labelIds: profLabels.length ? profLabels : [-1] } : {}) }
      const page = await window.api.chats.list(filter, 0, n + exclude.length)
      const items = page.items.filter((c) => !exclude.includes(c.id)).slice(0, n)
      setBatch(items)
      setTotal(page.total)
      setDone({})
      setSelected([])
      setLoading(false)
    },
    [mode, size, daily, networks, profLabels]
  )

  useEffect(() => {
    setProcessed([])
    void load([])
  }, [load])

  const mark = (ids: number[], what: string): void => {
    setDone((d) => ({ ...d, ...Object.fromEntries(ids.map((i) => [i, what])) }))
    setProcessed((p) => Array.from(new Set([...p, ...ids])))
    setSelected([])
  }

  async function quick(ids: number[], action: 'resolved' | 'none'): Promise<void> {
    await window.api.chats.setState(ids, action)
    mark(ids, action === 'resolved' ? '✅ resolvida' : '🚫 não precisa')
  }

  function next(): void {
    void load(processed)
  }

  const doneCount = Object.keys(done).length
  const pct = batch.length ? Math.round((doneCount / batch.length) * 100) : 0
  const nets = Object.keys(counts?.byNetwork ?? {})

  return (
    <div className="chats-triage">
      <div className="chats-triage-head">
        <div className="chats-chips">
          {MODES.map((m) => (
            <button key={m.id} className={`chats-chip ${mode === m.id ? 'on' : ''}`} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        {nets.length > 1 && (
          <div className="chats-chips">
            {nets.map((n) => (
              <button key={n} className={`chats-chip ${networks.includes(n) ? 'on' : ''}`} onClick={() => setNetworks((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]))}>
                {networkInfo(n).icon} {networkInfo(n).label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="chats-triage-head">
        {mode !== 'daily' ? (
          <select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Tamanho do lote">
            <option value={10}>Lotes de 10</option>
            <option value={20}>Lotes de 20</option>
            <option value={50}>Lotes de 50</option>
          </select>
        ) : (
          <span className="chats-mini">As {daily} conversas mais importantes de hoje. Sem obrigação de zerar a inbox.</span>
        )}
        <div className="chats-progress" title={`${doneCount} de ${batch.length} decididas neste lote`}><div style={{ width: `${pct}%` }} /></div>
        <span className="chats-mini">{doneCount}/{batch.length} no lote · {total} na fila · {processed.length} hoje</span>
        <button className="btn btn-primary btn-sm" onClick={next} disabled={loading}>Próximo lote →</button>
      </div>

      {mode === 'professional' && profLabels.length === 0 && (
        <div className="chats-notice" style={{ margin: '0 0 10px' }}>Marque conversas ou pessoas com uma tag profissional (ex.: “Recrutadores”, “Clientes”; dá para ajustar em Configurações → Mensagens).</div>
      )}

      {selected.length > 0 && (
        <div className="chats-bulkbar" style={{ borderRadius: 'var(--radius)', marginBottom: 10 }}>
          <b>{selected.length} selecionada(s)</b>
          <button className="btn btn-secondary btn-sm" onClick={() => void quick(selected, 'resolved')}>✅ Resolver</button>
          <button className="btn btn-secondary btn-sm" onClick={() => void quick(selected, 'none')}>🚫 Não precisa</button>
          <SnoozeMenu ids={selected} />
          <LabelMenu ids={selected} />
          <PriorityMenu ids={selected} />
          <button className="btn btn-primary btn-sm" onClick={() => setAi(selected)}>✨ Sugestões IA</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>Limpar</button>
        </div>
      )}

      {loading && batch.length === 0 && <div className="chats-empty">Carregando…</div>}
      {!loading && batch.length === 0 && <div className="empty-hint">Fila vazia para este modo. 🎉</div>}

      {batch.map((c) => {
        const isDone = !!done[c.id]
        const mentions = (c.unreadMentions ?? 0) > 0 && !c.mentionsReviewed
        return (
          <div key={c.id} className={`chats-triage-card ${isDone ? 'done' : ''}`}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <input type="checkbox" checked={selected.includes(c.id)} onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} aria-label={`Selecionar ${c.title}`} />
              <Avatar chat={c} size={42} />
            </div>
            <div className="chats-triage-main">
              <div className="chats-row">
                <b style={{ fontSize: 15 }}>{c.contactName || c.title}</b>
                <span className="chats-mini">{networkInfo(c.network).label}{c.type === 'group' ? ' · grupo' : ''}</span>
                <span className="chats-mini">· {agoDays(c.lastActivity)} atrás</span>
                {(c.unreadCount ?? 0) > 0 && <span className="chats-unread">{c.unreadCount}</span>}
                {mentions && <span className={`chats-mention ${c.mentionsEstimated ? 'est' : ''}`}>{c.mentionsEstimated ? '~' : ''}@{c.unreadMentions}</span>}
              </div>
              <div className="chats-triage-preview">{c.lastMessagePreview ? `${c.lastMessageFromMe ? 'Você: ' : c.type === 'group' && c.lastMessageSender ? `${c.lastMessageSender}: ` : ''}${c.lastMessagePreview}` : <i>sem prévia</i>}</div>
              <div className="chats-item-meta">
                <StatePill state={c.replyState} source={c.replyStateSource} />
                {c.pendingSince && c.replyState === 'needs_reply' && <span className="chats-mini">esperando há {agoDays(c.pendingSince)}</span>}
                {c.contactName ? <span className="chats-mini">👤 {c.contactName}</span> : c.type === 'single' && <span className="chats-mini">sem pessoa vinculada</span>}
                <PrioMark p={c.priority} />
                {!c.priority && c.suggestedPriority !== 'normal' && <span className="chats-mini" title="Sugestão automática">sugerida: {c.suggestedPriority}</span>}
                <LabelChips labels={c.labels} />
                {c.replyReason && <span className="chats-mini" style={{ whiteSpace: 'normal' }}>· {c.replyReason}</span>}
              </div>
              {isDone ? (
                <div className="chats-mini" style={{ marginTop: 8 }}>{done[c.id]}</div>
              ) : (
                <div className="chats-triage-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => (setTab('inbox'), void open(c.id))}>Responder</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setAi([c.id])}>✨ IA</button>
                  <SnoozeMenu ids={[c.id]} label="⏰ Depois" />
                  <button className="btn btn-secondary btn-sm" onClick={() => void quick([c.id], 'resolved')}>✅ Resolvida</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => void quick([c.id], 'none')}>🚫 Não precisa</button>
                  {c.type === 'single' && !c.contactId && (
                    <button className="btn btn-secondary btn-sm" onClick={() => (setTab('inbox'), void open(c.id), setDetailOpen(true))}>👤 Vincular</button>
                  )}
                  <LabelMenu ids={[c.id]} current={c.labels} />
                  <StateMenu ids={[c.id]} label="⋯" />
                  <button className="chats-linkbtn" onClick={() => mark([c.id], '⏭ pulada')}>pular</button>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {batch.length > 0 && doneCount === batch.length && (
        <div className="chats-empty">
          Lote concluído! <button className="btn btn-primary btn-sm" onClick={next}>Próximo lote →</button> <button className="chats-linkbtn" onClick={() => setTab('radar')}>ou parar por hoje</button>
        </div>
      )}

      {ai && (
        <BatchAiModal
          chatIds={ai}
          onClose={() => {
            setAi(null)
          }}
        />
      )}
    </div>
  )
}
