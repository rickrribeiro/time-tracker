import React, { useEffect, useMemo, useState } from 'react'
import type { MonitorSummary } from '../../../../shared/flights'
import { formatMoney } from '../../../../shared/flights'
import { useUIStore } from '../../../store/uiStore'
import { useTripStore } from '../../travel/store/tripStore'
import { MonitorEditor } from '../components/MonitorEditor'
import { SourcesModal } from '../components/SourcesModal'
import { rel, StateBadge } from '../components/ui'
import { errMsg, useFlightStore } from '../store/flightStore'
import '../flights.css'

function MonitorCard(props: { m: MonitorSummary; canSearch: boolean; onOpen: () => void; onEdit: () => void; onError: (e: string) => void }): React.ReactElement {
  const { m } = props
  const [busy, setBusy] = useState(false)
  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      props.onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  const stop = (e: React.MouseEvent): void => e.stopPropagation()
  const cov = m.coverage
  return (
    <div
      className={`fm-card ${m.status === 'paused' ? 'paused' : ''}`}
      onClick={props.onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && props.onOpen()}
    >
      <div className="fm-card-head">
        <span className="fm-card-name" title={m.name}>
          {m.name}
        </span>
        <StateBadge state={m.state} />
      </div>
      <div className="fm-route" title={`${m.originSummary} → ${m.destinationSummary}`}>
        <b>{m.originSummary}</b> → <b>{m.destinationSummary}</b>
      </div>
      <div className="fm-small">{m.dateSummary}</div>
      <div className="fm-card-prices">
        {m.minPrice ? (
          <span className="fm-price" title={m.eligibleCount ? 'Menor preço entre as opções elegíveis' : 'Menor preço com verificação pendente'}>
            {formatMoney(m.minPrice)}
          </span>
        ) : (
          <span className="fm-price muted">{m.offerCount ? 'sem elegíveis' : 'sem preços'}</span>
        )}
        {m.minVerifiedPrice && m.minVerifiedPrice.amountMinor !== m.minPrice?.amountMinor && (
          <span className="fm-small" title="Menor preço confirmado ao vivo">
            ✓ {formatMoney(m.minVerifiedPrice)} ao vivo
          </span>
        )}
        {m.minVerifiedPrice && m.minVerifiedPrice.amountMinor === m.minPrice?.amountMinor && <span className="fm-pill ok">ao vivo</span>}
        {m.minPrice && !m.eligibleCount && <span className="fm-pill warn">verificação pendente</span>}
        {m.trend && (
          <span className={`fm-trend ${m.trend.direction}`} title="Menor preço comparável: últimos 3 dias × 7 anteriores">
            {m.trend.direction === 'down' ? '▼' : m.trend.direction === 'up' ? '▲' : '='} {Math.abs(m.trend.deltaPercent)}%
          </span>
        )}
      </div>
      <div className="fm-card-meta">
        <span>
          {m.eligibleCount} elegível(is){m.pendingCount ? ` · ${m.pendingCount} pendente(s)` : ''}
        </span>
        <span title={m.lastSuccessAt ?? ''}>busca ok {rel(m.lastSuccessAt)}</span>
        {m.nextRunAt && <span title={m.nextRunAt}>próxima {rel(m.nextRunAt)}</span>}
      </div>
      <div title={`Cobertura: ${cov.covered} de ${cov.universe} combinações (${cov.percent}%)`}>
        <div className="fm-cov">
          <span style={{ width: `${Math.min(100, cov.percent)}%` }} />
        </div>
        <div className="fm-small" style={{ marginTop: 2 }}>
          cobertura {cov.percent}%{cov.pending ? ` · ${cov.pending} na fila` : ''}
          {cov.failed ? ` · ${cov.failed} falha(s)` : ''}
        </div>
      </div>
      {m.stateDetail && <div className={`fm-state-detail ${m.state === 'error' ? 'error' : ''}`}>{m.stateDetail}</div>}
      <div className="fm-card-actions" onClick={stop}>
        <button
          className="btn btn-primary"
          disabled={busy || m.state === 'running' || m.state === 'needs_config' || !props.canSearch}
          title={!props.canSearch ? 'Nenhuma fonte automática configurada' : m.state === 'needs_config' ? 'Complete a configuração' : 'Executar nova busca'}
          onClick={() => act(() => window.api.flightMon.run(m.id))}
          type="button"
        >
          {m.state === 'running' ? 'Buscando…' : '🔎 Buscar'}
        </button>
        <button className="btn btn-secondary" onClick={props.onEdit} type="button">
          Editar
        </button>
        {m.status !== 'draft' && (
          <button className="btn btn-secondary" disabled={busy} onClick={() => act(() => window.api.flightMon.setStatus(m.id, m.status === 'paused' ? 'active' : 'paused'))} type="button">
            {m.status === 'paused' ? 'Retomar' : 'Pausar'}
          </button>
        )}
        <button className="btn btn-secondary" disabled={busy} onClick={() => act(() => window.api.flightMon.duplicate(m.id))} type="button" title="Duplicar">
          ⧉
        </button>
        <button
          className="btn btn-danger"
          disabled={busy}
          type="button"
          title="Excluir"
          onClick={() => window.confirm(`Excluir "${m.name}" com todo o histórico de preços?`) && act(() => window.api.flightMon.delete(m.id))}
        >
          🗑
        </button>
      </div>
    </div>
  )
}

export function FlightsDashboardPage(): React.ReactElement {
  const { monitors, providers, loaded, error, refresh, refreshProviders, open } = useFlightStore()
  const { trips, refresh: refreshTrips } = useTripStore()
  const setPage = useUIStore((s) => s.setPage)
  const [editing, setEditing] = useState<{ monitor: MonitorSummary | null; ai: boolean } | null>(null)
  const [sources, setSources] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'attention'>('all')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void refresh()
    void refreshProviders()
    void refreshTrips()
    const off = window.api.flightMon.onChanged(() => void refresh())
    return off
  }, [])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return monitors.filter((m) => {
      if (filter === 'active' && m.status !== 'active') return false
      if (filter === 'paused' && m.status !== 'paused') return false
      if (filter === 'attention' && !['error', 'needs_config'].includes(m.state)) return false
      return !t || `${m.name} ${m.originSummary} ${m.destinationSummary}`.toLowerCase().includes(t)
    })
  }, [monitors, q, filter])

  const automated = providers.filter((p) => p.kind === 'api' && p.available)
  const openMonitor = (id: number): void => {
    open(id)
    setPage('flight-monitor')
  }

  return (
    <div className="module-page fm-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>✈️ Monitoramento de passagens</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Descubra, compare e acompanhe passagens com origem/destino flexíveis.</p>
        </div>
      </div>

      <div className="fm-toolbar">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ monitor: null, ai: false })} type="button">
          + Novo monitoramento
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ monitor: null, ai: true })} type="button">
          ✨ Criar com IA
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setSources(true)} type="button">
          ⚙️ Fontes e execução
        </button>
        <span className="fm-spacer" />
        <div className="fm-seg">
          {(
            [
              ['all', 'Todos'],
              ['active', 'Ativos'],
              ['paused', 'Pausados'],
              ['attention', 'Atenção']
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)} type="button">
              {l}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="fm-providers-strip">
        <span className="fm-muted">Fontes:</span>
        {providers.map((p) => (
          <span key={p.id} className={`fm-pill ${p.available ? 'ok' : 'outline'}`} title={p.reason ?? ''}>
            {p.available ? '●' : '○'} {p.label}
          </span>
        ))}
        {loaded && automated.length === 0 && (
          <button className="fm-linkbtn" onClick={() => setSources(true)} type="button">
            Nenhuma fonte automática — configurar
          </button>
        )}
      </div>

      {msg && (
        <div className="fm-note danger" style={{ marginBottom: 10 }}>
          {msg}{' '}
          <button className="fm-linkbtn" onClick={() => setMsg('')} type="button">
            fechar
          </button>
        </div>
      )}
      {error && <div className="fm-note danger">{error}</div>}

      {loaded && monitors.length === 0 ? (
        <div className="fm-empty">
          <h3>Nenhum monitoramento ainda</h3>
          <p className="fm-muted">Ex.: "Sudeste Asiático → Salvador ou Aracaju, 10–25/dez, com mala, sem conexão nos EUA/Canadá".</p>
          <div className="fm-row" style={{ justifyContent: 'center', marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditing({ monitor: null, ai: true })} type="button">
              ✨ Descrever para a IA
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ monitor: null, ai: false })} type="button">
              Montar manualmente
            </button>
          </div>
        </div>
      ) : (
        <div className="fm-grid">
          {shown.map((m) => (
            <MonitorCard key={m.id} m={m} canSearch={automated.length > 0} onOpen={() => openMonitor(m.id)} onEdit={() => setEditing({ monitor: m, ai: false })} onError={setMsg} />
          ))}
          {loaded && shown.length === 0 && <div className="empty-hint">Nada com esse filtro.</div>}
        </div>
      )}

      {editing && (
        <MonitorEditor
          monitor={editing.monitor}
          startWithAi={editing.ai}
          trips={trips}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null)
            void refresh()
            if (!editing.monitor) openMonitor(id)
          }}
        />
      )}
      {sources && (
        <SourcesModal
          onClose={() => {
            setSources(false)
            void refresh()
          }}
        />
      )}
    </div>
  )
}
