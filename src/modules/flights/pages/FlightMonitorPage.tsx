import React, { useEffect, useState } from 'react'
import type { MonitorSummary, SkyPick } from '../../../../shared/flights'
import { formatMoney } from '../../../../shared/flights'
import { useUIStore } from '../../../store/uiStore'
import { useTripStore } from '../../travel/store/tripStore'
import { ImportModal } from '../components/ImportModal'
import { MonitorEditor } from '../components/MonitorEditor'
import { AlertsPanel, HistoryPanel, PlanPanel, PriceCalendar, PromosPanel } from '../components/Panels'
import { SkyscannerModal } from '../components/SkyscannerModal'
import { TrackedPanel } from '../components/TrackedPanel'
import { ResultsExplorer } from '../components/ResultsExplorer'
import { SourcesModal } from '../components/SourcesModal'
import { rel, StateBadge } from '../components/ui'
import { errMsg, useFlightStore } from '../store/flightStore'
import '../flights.css'

type Tab = 'results' | 'tracked' | 'calendar' | 'history' | 'promos' | 'plan' | 'alerts'
const TABS: { id: Tab; label: string }[] = [
  { id: 'results', label: 'Resultados' },
  { id: 'calendar', label: 'Calendário de preços' },
  { id: 'tracked', label: 'Acompanhadas' },
  { id: 'history', label: 'Histórico' },
  { id: 'promos', label: 'Promoções (blogs)' },
  { id: 'plan', label: 'Plano e cobertura' },
  { id: 'alerts', label: 'Alertas' }
]

export function FlightMonitorPage(): React.ReactElement {
  const id = useFlightStore((s) => s.selectedId)
  const { providers, refreshProviders, refresh: refreshList } = useFlightStore()
  const setPage = useUIStore((s) => s.setPage)
  const { trips, refresh: refreshTrips } = useTripStore()
  const [m, setM] = useState<MonitorSummary | null>(null)
  const [tab, setTab] = useState<Tab>('results')
  const [version, setVersion] = useState(0)
  const [err, setErr] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [importing, setImporting] = useState<{ text?: string; mode?: 'structured' | 'ai' } | null>(null)
  const [sky, setSky] = useState<boolean | SkyPick[]>(false)
  const [sources, setSources] = useState(false)
  const [insight, setInsight] = useState<{ text: string; cached: boolean } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    if (id == null) return
    try {
      setM(await window.api.flightMon.get(id))
      setNotFound(false)
    } catch {
      setNotFound(true)
    }
  }

  useEffect(() => {
    void load()
    void refreshProviders()
    void refreshTrips()
    // atualizações ao vivo da execução (SSE); agrupa rajadas
    let t: ReturnType<typeof setTimeout> | null = null
    const off = window.api.flightMon.onChanged((p) => {
      if (p.monitorId != null && p.monitorId !== id) return
      if (t) clearTimeout(t)
      t = setTimeout(() => {
        void load()
        setVersion((v) => v + 1)
      }, 400)
    })
    return () => {
      off()
      if (t) clearTimeout(t)
    }
  }, [id])

  const act = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(label)
    setErr('')
    try {
      await fn()
      await load()
      setVersion((v) => v + 1)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(null)
    }
  }

  if (id == null || notFound)
    return (
      <div className="module-page fm-page">
        <div className="fm-empty">
          <h3>Monitoramento não encontrado</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('trip-monitoring')} type="button">
            ← Voltar
          </button>
        </div>
      </div>
    )
  if (!m) return <div className="module-page fm-page fm-muted">Carregando…</div>

  const automated = providers.filter((p) => p.kind === 'api' && p.available)
  const running = m.state === 'running'
  const canSearch = !running && m.state !== 'needs_config' && automated.length > 0
  const run = m.activeRun
  const cov = m.coverage
  const skyOn = providers.some((p) => p.id === 'skyscanner_chrome' && p.available)

  return (
    <div className="module-page fm-page">
      <div className="fm-hero">
        <div className="fm-row">
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('trip-monitoring')} type="button" aria-label="Voltar">
            ←
          </button>
          <h2 title={m.name}>{m.name}</h2>
          <StateBadge state={m.state} />
        </div>
        <div className="fm-route" style={{ marginTop: 4, whiteSpace: 'normal' }}>
          <b>{m.originSummary}</b> → <b>{m.destinationSummary}</b> · {m.dateSummary}
        </div>
        <div className="fm-hero-stats">
          <span>
            menor preço{m.eligibleCount ? '' : ' (pendente)'}
            <b>{formatMoney(m.minPrice)}</b>
          </span>
          <span>
            menor ao vivo<b>{formatMoney(m.minVerifiedPrice)}</b>
          </span>
          <span>
            elegíveis<b>{m.eligibleCount}</b>
          </span>
          <span>
            cobertura<b>{cov.percent}%</b>
          </span>
          <span>
            última busca ok<b>{rel(m.lastSuccessAt)}</b>
          </span>
          <span>
            próxima<b>{m.config.schedule.mode === 'manual' ? 'manual' : rel(m.nextRunAt)}</b>
          </span>
        </div>
        <div className="fm-cov" style={{ marginTop: 8 }} title={`${cov.covered}/${cov.universe} combinações`}>
          <span style={{ width: `${Math.min(100, cov.percent)}%` }} />
        </div>
        <div className="fm-row" style={{ marginTop: 10 }}>
          {running && run ? (
            <>
              <span className="fm-pill accent">
                <span className="fm-dot running" />{' '}
                {run.trigger === 'assisted' ? `${run.message ?? 'Pesquisando no Chrome…'} (${run.planned} combinação(ões))` : `${run.done} consulta(s) ok · ${run.queries} na fonte · ${run.cacheHits} do cache · ${run.offersFound} ofertas`}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => act('cancel', () => window.api.flightMon.cancel(run.id))} type="button">
                Cancelar
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" disabled={!canSearch || !!busy} onClick={() => act('run', () => window.api.flightMon.run(m.id))} type="button">
              {cov.pending > 0 && cov.done > 0 ? '▶ Continuar busca' : '🔎 Buscar agora'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)} type="button">
            Editar
          </button>
          {m.status !== 'draft' && (
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => act('status', () => window.api.flightMon.setStatus(m.id, m.status === 'paused' ? 'active' : 'paused'))} type="button">
              {m.status === 'paused' ? 'Retomar' : 'Pausar'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setImporting({})} type="button">
            ⤓ Importar
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={running || m.state === 'needs_config'}
            onClick={() => (skyOn ? setSky(true) : setSources(true))}
            type="button"
            title={skyOn ? 'Claude pesquisa no Skyscanner pelo seu Chrome (você acompanha)' : 'Ative "Skyscanner via Claude + Chrome" nas fontes'}
          >
            🔍 Skyscanner (Chrome)
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!!busy || !m.eligibleCount}
            title="1 chamada de IA (com cache) sobre as melhores opções já ordenadas"
            onClick={() => act('ai', async () => setInsight(await window.api.flightMon.insights(m.id)))}
            type="button"
          >
            {busy === 'ai' ? 'Analisando…' : '✨ Analisar trade-offs'}
          </button>
          <span className="fm-spacer" />
          <button
            className="btn btn-danger btn-sm"
            type="button"
            onClick={() =>
              window.confirm(`Excluir "${m.name}" com todo o histórico?`) &&
              act('del', async () => {
                await window.api.flightMon.delete(m.id)
                await refreshList()
                setPage('trip-monitoring')
              })
            }
          >
            Excluir
          </button>
        </div>
      </div>

      {m.state === 'needs_config' && (
        <div className="fm-note warn" style={{ marginBottom: 10 }}>
          Aguardando configuração: {m.stateDetail}{' '}
          <button className="fm-linkbtn" onClick={() => setEditing(true)} type="button">
            completar
          </button>
          {m.legacy && (
            <div className="fm-small" style={{ marginTop: 4 }}>
              Migrado do monitoramento antigo ({m.legacy.origin} → {m.legacy.destination}
              {m.legacy.price != null ? `, último preço anotado ${m.legacy.price} ${m.legacy.currency}` : ''}
              {m.legacy.checkedAt ? ` em ${m.legacy.checkedAt.slice(0, 10)}` : ''}). O preço antigo não tinha itinerário, então não entra no histórico comparável.
            </div>
          )}
        </div>
      )}
      {m.state !== 'needs_config' && automated.length === 0 && (
        <div className="fm-note warn" style={{ marginBottom: 10 }}>
          Nenhuma fonte automática configurada: buscas desativadas. Você pode{' '}
          <button className="fm-linkbtn" onClick={() => setSources(true)} type="button">
            configurar uma fonte
          </button>{' '}
          ou{' '}
          <button className="fm-linkbtn" onClick={() => setImporting({})} type="button">
            importar resultados reais
          </button>
          .
        </div>
      )}
      {m.state === 'error' && <div className="fm-note danger" style={{ marginBottom: 10 }}>Última busca falhou: {m.lastError}</div>}
      {m.status === 'paused' && <div className="fm-note" style={{ marginBottom: 10 }}>Pausado: o agendador não roda este monitor (buscas manuais continuam disponíveis).</div>}
      {m.lastSuccessAt && Date.now() - Date.parse(m.lastSuccessAt) > 3 * 86400_000 && (
        <div className="fm-note" style={{ marginBottom: 10 }}>Dados desatualizados: a última busca bem-sucedida foi {rel(m.lastSuccessAt)}.</div>
      )}
      {err && <div className="fm-note danger" style={{ marginBottom: 10 }}>{err}</div>}

      {insight && (
        <div className="fm-section fm-ai">
          <div className="fm-section-title">
            ✨ Análise da IA {insight.cached && <span className="fm-pill">cache · 0 tokens</span>}
            <span className="fm-spacer" />
            <button className="fm-x" onClick={() => setInsight(null)} type="button" aria-label="Fechar">
              ✕
            </button>
          </div>
          <div className="fm-insights">{insight.text}</div>
          <div className="fm-small">Comentário sobre dados já filtrados e ordenados pelo código; não substitui verificar regras de trânsito/visto.</div>
        </div>
      )}

      <div className="fm-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} type="button" role="tab" aria-selected={tab === t.id}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'results' && <ResultsExplorer m={m} version={version} canSearch={canSearch} onMore={(n) => act('more', () => window.api.flightMon.run(m.id, { more: n }))} />}
      {tab === 'tracked' && <TrackedPanel m={m} version={version} onResearch={(picks) => (skyOn ? setSky(picks) : setSources(true))} />}
      {tab === 'calendar' && <PriceCalendar m={m} version={version} />}
      {tab === 'history' && <HistoryPanel m={m} version={version} />}
      {tab === 'promos' && <PromosPanel m={m} version={version} onStructure={(text) => setImporting({ text, mode: 'ai' })} />}
      {tab === 'plan' && <PlanPanel m={m} version={version} onRetry={() => act('retry', () => window.api.flightMon.retryFailed(m.id))} />}
      {tab === 'alerts' && <AlertsPanel m={m} version={version} onEdit={() => setEditing(true)} />}

      {editing && (
        <MonitorEditor
          monitor={m}
          trips={trips}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            void load()
            setVersion((v) => v + 1)
          }}
        />
      )}
      {importing && <ImportModal m={m} initialText={importing.text} initialMode={importing.mode} onClose={() => setImporting(null)} onDone={() => (void load(), setVersion((v) => v + 1))} />}
      {sky && (
        <SkyscannerModal
          m={m}
          initial={Array.isArray(sky) ? sky : undefined}
          onClose={() => setSky(false)}
          onStarted={() => {
            setSky(false)
            void load()
          }}
        />
      )}
      {sources && (
        <SourcesModal
          onClose={() => {
            setSources(false)
            void load()
          }}
        />
      )}
    </div>
  )
}
