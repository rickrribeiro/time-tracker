import React, { useEffect, useState } from 'react'
import type { AlertEvent, CalendarDay, HistoryPoint, HistoryView, MonitorSummary, PlanView, PromoFeedView } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { formatMoney } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'
import { rel } from './ui'

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; err: string } {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    fn()
      .then((d) => live && (setData(d), setErr('')))
      .catch((e) => live && setErr(errMsg(e)))
    return () => {
      live = false
    }
  }, deps)
  return { data, err }
}

// ── Calendário ────────────────────────────────────────────────────────────────

export function PriceCalendar(props: { m: MonitorSummary; version: number }): React.ReactElement {
  const { data, err } = useLoad(() => window.api.flightMon.calendar(props.m.id), [props.m.id, props.version])
  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">Carregando…</div>
  if (!data.length) return <div className="fm-empty">Sem datas futuras configuradas.</div>
  const prices = data.map((d) => d.minPrice?.amountMinor).filter((x): x is number => x != null)
  const min = prices.length ? Math.min(...prices) : null
  const months = new Map<string, CalendarDay[]>()
  for (const d of data) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d])
  return (
    <div>
      <div className="fm-note" style={{ marginBottom: 8 }}>
        Menor preço conhecido (não excluído) por data de partida, em {props.m.config.currency}. Dias hachurados ainda não foram pesquisados — <b>não</b> significa que não há voos.
      </div>
      {[...months.entries()].map(([month, days]) => {
        const first = new Date(`${month}-01T12:00:00`).getDay()
        const firstDay = Number(days[0].date.slice(8, 10))
        const lead = (first + firstDay - 1) % 7
        return (
          <div key={month} style={{ marginBottom: 14 }}>
            <div className="fm-section-title">{new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div>
            <div className="fm-cal">
              {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => (
                <div key={d} className="fm-cal-head">
                  {d}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`e${i}`} className="fm-cal-empty" />
              ))}
              {days.map((d) => (
                <div
                  key={d.date}
                  className={`fm-cal-day ${d.coverage === 'none' && !d.minPrice ? 'none' : ''} ${d.coverage === 'failed' ? 'failed' : ''} ${min != null && d.minPrice?.amountMinor === min ? 'cheap' : ''}`}
                  title={d.coverage === 'none' ? 'Ainda não pesquisado' : d.coverage === 'failed' ? 'Só houve falhas nesta data' : `${d.offers} opção(ões)`}
                >
                  <span>{Number(d.date.slice(8, 10))}</span>
                  {d.minPrice ? <b>{formatMoney(d.minPrice).replace(/,\d\d$/, '')}</b> : <span className="fm-small">{d.coverage === 'searched' ? 'sem preço' : d.coverage === 'failed' ? 'falhou' : ''}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="fm-legend">
        <span>
          <i style={{ background: 'color-mix(in srgb, var(--success) 20%, transparent)', borderColor: 'var(--success)' }} />
          menor preço do período
        </span>
        <span>
          <i style={{ background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, var(--bg-tertiary) 3px, var(--bg-tertiary) 5px)' }} />
          não pesquisado
        </span>
        <span>
          <i style={{ borderColor: 'var(--danger)' }} />
          só falhas
        </span>
      </div>
    </div>
  )
}

// ── Histórico ─────────────────────────────────────────────────────────────────

const PALETTE = ['var(--accent)', '#06b6d4', 'var(--warning)', 'var(--danger)', '#8b5cf6', '#ec4899', '#84cc16', '#f97316']

export function LineChart(props: { series: { label: string; points: HistoryPoint[] }[]; currency: string }): React.ReactElement {
  const all = props.series.flatMap((s) => s.points)
  if (all.length < 2) return <div className="fm-muted">Dados insuficientes para o gráfico (precisa de observações em pelo menos 2 dias).</div>
  const days = [...new Set(all.map((p) => p.day))].sort()
  const minV = Math.min(...all.map((p) => p.minor))
  const maxV = Math.max(...all.map((p) => p.minor))
  const W = 640
  const H = 200
  const pad = { l: 64, r: 10, t: 10, b: 24 }
  const x = (d: string): number => pad.l + (days.length === 1 ? 0 : (days.indexOf(d) / (days.length - 1)) * (W - pad.l - pad.r))
  const span = maxV - minV || maxV * 0.1 || 1
  const y = (v: number): number => pad.t + (1 - (v - minV + span * 0.05) / (span * 1.1)) * (H - pad.t - pad.b)
  const ticks = [minV, minV + span / 2, maxV]
  return (
    <div>
      <svg className="fm-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histórico de preços">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end">
              {formatMoney({ amountMinor: Math.round(t), currency: props.currency }).replace(/,\d\d$/, '')}
            </text>
          </g>
        ))}
        {[days[0], days[days.length - 1]].map((d, i) => (
          <text key={i} x={x(d)} y={H - 6} textAnchor={i ? 'end' : 'start'}>
            {d.slice(8, 10)}/{d.slice(5, 7)}
          </text>
        ))}
        {props.series.map((s, i) => (
          <g key={s.label}>
            <polyline fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} points={s.points.map((p) => `${x(p.day)},${y(p.minor)}`).join(' ')} />
            {s.points.map((p) => (
              <circle key={p.day} cx={x(p.day)} cy={y(p.minor)} r={2.5} fill={PALETTE[i % PALETTE.length]}>
                <title>{`${s.label} · ${p.day}: ${formatMoney({ amountMinor: p.minor, currency: props.currency })}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      {props.series.length > 1 && (
        <div className="fm-series-legend">
          {props.series.map((s, i) => (
            <span key={s.label}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function top(groups: Record<string, HistoryPoint[]>, n = 6): { label: string; points: HistoryPoint[] }[] {
  return Object.entries(groups)
    .map(([label, points]) => ({ label, points }))
    .sort((a, b) => Math.min(...a.points.map((p) => p.minor)) - Math.min(...b.points.map((p) => p.minor)))
    .slice(0, n)
}

export function HistoryPanel(props: { m: MonitorSummary; version: number }): React.ReactElement {
  const [days, setDays] = useState(60)
  const { data, err } = useLoad<HistoryView>(() => window.api.flightMon.history(props.m.id, days), [props.m.id, props.version, days])
  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">Carregando…</div>
  return (
    <div>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <div className="fm-seg">
          {[14, 30, 60, 180].map((d) => (
            <button key={d} className={days === d ? 'active' : ''} onClick={() => setDays(d)} type="button">
              {d} dias
            </button>
          ))}
        </div>
        <span className="fm-small">Só observações comparáveis: mesma moeda ({data.currency}) e mesma configuração de passageiros/cabine.</span>
      </div>
      {data.note && <div className="fm-note" style={{ marginBottom: 8 }}>{data.note}</div>}
      <div className="fm-chart-card">
        <h4>Menor preço observado por dia</h4>
        <LineChart series={[{ label: 'Menor preço', points: data.overall }]} currency={data.currency} />
      </div>
      <div className="fm-cols">
        <div className="fm-chart-card">
          <h4>Por origem</h4>
          <LineChart series={top(data.byOrigin)} currency={data.currency} />
        </div>
        <div className="fm-chart-card">
          <h4>Por destino</h4>
          <LineChart series={top(data.byDestination)} currency={data.currency} />
        </div>
      </div>
      <div className="fm-chart-card">
        <h4>Mudanças de preço no mesmo itinerário</h4>
        {data.changes.length === 0 ? (
          <div className="fm-muted">Nenhuma mudança registrada ainda.</div>
        ) : (
          <table className="report-table" style={{ width: '100%', fontSize: 12 }}>
            <tbody>
              {data.changes.map((c) => (
                <tr key={c.offerId}>
                  <td>{c.label}</td>
                  <td>{formatMoney(c.from)}</td>
                  <td>→</td>
                  <td style={{ color: c.to.amountMinor < c.from.amountMinor ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{formatMoney(c.to)}</td>
                  <td className="fm-small">{rel(c.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Plano / cobertura ─────────────────────────────────────────────────────────

const STAGE_LABEL = { discovery: 'Descoberta', deepen: 'Aprofundamento', validate: 'Validação' }
const STAGE_HINT = {
  discovery: 'Amplo e barato: por par de aeroportos e mês (cache) ou poucas datas.',
  deepen: 'Só pares promissores, data a data, datas baratas primeiro.',
  validate: 'Revalida ao vivo as melhores opções vindas de cache.'
}
const RUN_STATUS: Record<string, string> = { running: 'em andamento', done: 'concluída', partial: 'parcial', failed: 'falhou', interrupted: 'interrompida', budget: 'orçamento atingido' }

export function PlanPanel(props: { m: MonitorSummary; version: number; onRetry: () => void }): React.ReactElement {
  const { data, err } = useLoad<PlanView>(() => window.api.flightMon.plan(props.m.id), [props.m.id, props.version])
  const [showTasks, setShowTasks] = useState(false)
  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">Carregando…</div>
  const c = data.coverage
  return (
    <div>
      <div className="fm-section">
        <div className="fm-section-title">Cobertura da pesquisa</div>
        <div className="fm-cov" style={{ height: 8 }}>
          <span style={{ width: `${Math.min(100, c.percent)}%` }} />
        </div>
        <div className="fm-summary-bar" style={{ marginTop: 6 }}>
          <span>
            <b>{c.covered.toLocaleString('pt-BR')}</b> de <b>{c.universe.toLocaleString('pt-BR')}</b> combinações (aeroporto × aeroporto × data) pesquisadas ({c.percent}%)
          </span>
          <span>
            <b>{c.done}</b> consultas ok · <b>{c.pending}</b> na fila · <b>{c.failed}</b> falhas
          </span>
        </div>
        <div className="fm-small" style={{ marginTop: 4 }}>
          Origens: {data.airports.origins.join(', ') || '—'} · Destinos: {data.airports.destinations.join(', ') || '—'}
        </div>
        {data.warnings.map((w) => (
          <div key={w} className="fm-small" style={{ color: 'var(--warning)' }}>
            {w}
          </div>
        ))}
        {c.failed > 0 && (
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={props.onRetry} type="button">
            Recolocar {c.failed} falha(s) na fila
          </button>
        )}
      </div>
      <div className="fm-stage-grid">
        {(Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[]).map((s) => {
          const st = data.byStage[s]
          return (
            <div className="fm-stage" key={s}>
              <h4>{STAGE_LABEL[s]}</h4>
              <div className="fm-small">{STAGE_HINT[s]}</div>
              <div style={{ marginTop: 4 }}>
                ✓ {st.done} · ⏳ {st.pending + st.running} · ✕ {st.failed}
              </div>
            </div>
          )
        })}
      </div>
      <div className="fm-section">
        <div className="fm-section-title">Execuções recentes</div>
        {data.runs.length === 0 ? (
          <div className="fm-muted">Nenhuma execução ainda.</div>
        ) : (
          <table className="report-table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Consultas</th>
                <th>Cache</th>
                <th>Ofertas</th>
                <th>Tokens</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{rel(r.startedAt)}</td>
                  <td>{r.trigger === 'schedule' ? 'agendada' : r.trigger === 'more' ? 'mais opções' : r.trigger === 'assisted' ? 'Skyscanner (Chrome)' : 'manual'}</td>
                  <td>{RUN_STATUS[r.status] ?? r.status}</td>
                  <td>{r.queries}</td>
                  <td>{r.cacheHits}</td>
                  <td>{r.offersFound}</td>
                  <td>{r.tokens ? r.tokens.toLocaleString('pt-BR') : '—'}</td>
                  <td className="fm-small">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button className="fm-linkbtn" onClick={() => setShowTasks(!showTasks)} type="button">
        {showTasks ? 'Ocultar' : 'Ver'} consultas planejadas ({data.tasks.length})
      </button>
      {showTasks && (
        <div className="fm-table-wrap" style={{ marginTop: 6, maxHeight: 360, overflowY: 'auto' }}>
          <table className="fm-table" style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Fonte</th>
                <th>Rota</th>
                <th>Data</th>
                <th>Status</th>
                <th>Result.</th>
                <th>Menor</th>
                <th>Erro</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((t) => (
                <tr key={t.id}>
                  <td>{STAGE_LABEL[t.stage]}</td>
                  <td>{t.provider}</td>
                  <td className="nowrap">
                    {t.origin}→{t.destination}
                  </td>
                  <td className="nowrap">
                    {t.departDate}
                    {t.returnDate ? ` / ${t.returnDate}` : ''}
                  </td>
                  <td>{t.status}</td>
                  <td>{t.status === 'done' ? t.resultCount : ''}</td>
                  <td>{t.minPrice ? formatMoney(t.minPrice) : ''}</td>
                  <td className="fm-small">{t.lastError}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Alertas ───────────────────────────────────────────────────────────────────

export function AlertsPanel(props: { m: MonitorSummary; version: number; onEdit: () => void }): React.ReactElement {
  const { data, err } = useLoad<AlertEvent[]>(() => window.api.flightMon.alerts(props.m.id), [props.m.id, props.version])
  const a = props.m.config.alerts
  const rules = [
    a.priceBelow && `preço abaixo de ${formatMoney(a.priceBelow)}`,
    a.dropPercent && `queda de ${a.dropPercent}% no mesmo itinerário`,
    a.newLow && 'novo menor preço comparável',
    a.interesting && 'voo novo muito bem pontuado',
    a.favoriteChanges && 'favorita mudou de preço ou sumiu',
    a.promoPosts && 'post novo em blog de promoção mencionando a rota'
  ].filter(Boolean)
  return (
    <div>
      <div className="fm-section">
        <div className="fm-section-title">Regras ativas</div>
        {rules.length ? (
          <ul className="fm-small" style={{ margin: '0 0 0 16px', padding: 0 }}>
            {rules.map((r) => (
              <li key={String(r)}>{r}</li>
            ))}
          </ul>
        ) : (
          <div className="fm-muted">Nenhuma regra.</div>
        )}
        <div className="fm-small" style={{ marginTop: 6 }}>
          Alertas só consideram opções <b>elegíveis</b>, avaliadas depois de cada busca, e cada um dispara uma única vez (central de notificações do rickOS).
          {props.m.config.schedule.mode === 'manual' && ' Atualização manual: alertas só depois das buscas que você disparar.'}
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={props.onEdit} type="button">
          Editar regras
        </button>
      </div>
      {err && <div className="fm-error">{err}</div>}
      <div className="fm-section">
        <div className="fm-section-title">Disparados</div>
        {!data?.length ? (
          <div className="fm-muted">Nenhum alerta disparado.</div>
        ) : (
          data.map((e) => (
            <div key={e.id} className="fm-row" style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="fm-pill accent">{e.kind}</span>
              <span className="fm-grow">{e.message}</span>
              <span className="fm-small">{rel(e.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Promoções (RSS) ───────────────────────────────────────────────────────────

export function PromosPanel(props: { m: MonitorSummary; version: number; onStructure: (text: string) => void }): React.ReactElement {
  const [force, setForce] = useState(0)
  const { data, err } = useLoad<PromoFeedView>(() => window.api.flightMon.promos(props.m.id, force > 0), [props.m.id, props.version, force])
  return (
    <div>
      <div className="fm-note" style={{ marginBottom: 8 }}>
        Posts recentes (até 21 dias) de blogs de promoção que mencionam lugares deste monitor. É só o anúncio, não uma cotação: abra o post e confira datas e regras.
        {props.m.config.alerts.promoPosts ? ' Posts novos geram notificação (1× cada).' : ''}
      </div>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setForce((n) => n + 1)} type="button">
          Atualizar feeds
        </button>
        {data?.feeds.map((f) => (
          <span key={f.url} className={`fm-pill ${f.ok ? 'ok' : 'danger'}`} title={f.error ?? `${f.items} itens · lido ${rel(f.fetchedAt)}`}>
            {new URL(f.url).hostname.replace(/^www\./, '')} {f.ok ? `· ${f.items}` : '· erro'}
          </span>
        ))}
      </div>
      {data && data.keywords.length > 0 && <div className="fm-small" style={{ marginBottom: 8 }}>Procurando por: {data.keywords.join(', ')}</div>}
      {err && <div className="fm-error">{err}</div>}
      {!data ? (
        <div className="fm-muted">Lendo feeds…</div>
      ) : data.posts.length === 0 ? (
        <div className="fm-empty">Nenhum post recente menciona as origens/destinos deste monitor.</div>
      ) : (
        data.posts.map((p) => (
          <div key={p.link} className="fm-section" style={{ padding: 10 }}>
            <div className="fm-row" style={{ alignItems: 'flex-start' }}>
              <div className="fm-grow">
                <button className="fm-linkbtn" style={{ fontSize: 13, fontWeight: 600, textAlign: 'left' }} onClick={() => openExternal(p.link)} type="button">
                  {p.title} ↗
                </button>
                <div className="fm-small">
                  {p.source} · {p.publishedAt ? rel(p.publishedAt) : 'sem data'}
                </div>
              </div>
              {p.prices[0] && <span className="fm-price muted">{p.prices[0]}</span>}
            </div>
            <div className="fm-row" style={{ gap: 4, marginTop: 4 }}>
              {p.both && <span className="fm-pill ok">origem e destino</span>}
              {p.matches.map((k) => (
                <span key={k} className="fm-pill accent">
                  {k}
                </span>
              ))}
              <span className="fm-spacer" />
              <button className="fm-linkbtn" onClick={() => props.onStructure(`${p.title}\n${p.summary}\nFonte: ${p.source} (${p.link})`)} type="button" title="A IA tenta extrair rotas/datas/preços do post para a importação (você revisa)">
                ✨ estruturar
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
