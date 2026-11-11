import React, { useEffect, useState } from 'react'
import type { EligibilityStatus, MonitorSummary, OfferPage, OfferQuery, OfferView, SortStrategy } from '../../../../shared/flights'
import { fmtMinutes, formatMoney, STRATEGY_LABEL } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'
import { Modal } from './Modal'
import { OfferDetail } from './OfferDetail'
import { fmtLocal, VerificationBadge } from './ui'

const STATUS_TABS: { id: EligibilityStatus; label: string; hint: string }[] = [
  { id: 'eligible', label: 'Elegíveis', hint: 'Cumprem todas as restrições obrigatórias' },
  { id: 'pending', label: 'Verificação pendente', hint: 'Falta informação para confirmar alguma restrição (ex.: bagagem, conexões)' },
  { id: 'excluded', label: 'Excluídos', hint: 'Violam alguma restrição — veja o motivo' }
]

function CompareModal(props: { offers: OfferView[]; onClose: () => void }): React.ReactElement {
  const o = props.offers
  const best = (vals: (number | null)[]): number => {
    const ok = vals.filter((v): v is number => v != null)
    return ok.length ? Math.min(...ok) : NaN
  }
  const row = (label: string, vals: (number | null)[], fmt: (v: number | null, i: number) => React.ReactNode): React.ReactElement => {
    const b = best(vals)
    return (
      <tr>
        <th>{label}</th>
        {vals.map((v, i) => (
          <td key={i} className={v != null && v === b && vals.filter((x) => x === b).length < vals.length ? 'best' : ''}>
            {fmt(v, i)}
          </td>
        ))}
      </tr>
    )
  }
  const txt = (label: string, f: (x: OfferView) => React.ReactNode): React.ReactElement => (
    <tr>
      <th>{label}</th>
      {o.map((x) => (
        <td key={x.id}>{f(x)}</td>
      ))}
    </tr>
  )
  return (
    <Modal title={`Comparar ${o.length} opções`} onClose={props.onClose} size="wide">
      <div className="fm-compare">
        <table>
          <thead>
            <tr>
              <th />
              {o.map((x) => (
                <th key={x.id}>
                  {x.origin} → {x.destination}
                  <div className="fm-small">{fmtLocal(x.slices[0].departLocal)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row('Tarifa', o.map((x) => x.cost.fareInCurrency?.amountMinor ?? null), (_, i) => formatMoney(o[i].cost.fareInCurrency ?? o[i].price))}
            {row('Custo total', o.map((x) => x.cost.total?.amountMinor ?? null), (_, i) => (
              <>
                {formatMoney(o[i].cost.total)} <span className="fm-small">({o[i].cost.totalStatus === 'verified' ? 'verificado' : o[i].cost.totalStatus === 'estimated' ? 'estimado' : 'incompleto'})</span>
              </>
            ))}
            {row('Duração', o.map((x) => x.totalDurationMin), (v) => fmtMinutes(v))}
            {row('Porta a porta', o.map((x) => x.cost.doorToDoorMinutes), (v) => fmtMinutes(v))}
            {row('Conexões', o.map((x) => x.stops), (v, i) => `${v} ${o[i].connections.length ? `(${o[i].connections.map((c) => `${c.airport} ${fmtMinutes(c.minutes)}`).join(', ')})` : ''}`)}
            {txt('Bagagem', (x) => (x.baggage.checked == null ? 'não verificado' : `${x.baggage.checked} despachada(s)`))}
            {txt('Companhias', (x) => x.carriers.join(', ') || '—')}
            {txt('Chegada', (x) => fmtLocal(x.slices[0].arriveLocal))}
            {txt('Riscos', (x) => x.checks.filter((c) => c.level !== 'info').map((c) => c.message).join(' · ') || '—')}
            {txt('Destaques', (x) => x.highlights.join(' · ') || '—')}
            {row('Pontuação', o.map((x) => -x.score), (_, i) => o[i].score)}
            {txt('Fonte', (x) => <VerificationBadge v={x.verification} stale={x.stale} />)}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

export function ResultsExplorer(props: { m: MonitorSummary; version: number; onMore: (n: number) => void; canSearch: boolean }): React.ReactElement {
  const { m } = props
  const [status, setStatus] = useState<EligibilityStatus>('eligible')
  const [q, setQ] = useState<OfferQuery>({ page: 1 })
  const [search, setSearch] = useState('')
  const [data, setData] = useState<OfferPage | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [cmp, setCmp] = useState<Map<number, OfferView>>(new Map())
  const [showCmp, setShowCmp] = useState(false)
  const [moreN, setMoreN] = useState(10)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setData(await window.api.flightMon.offers(m.id, { ...q, status, search }))
        setErr('')
      } catch (e) {
        setErr(errMsg(e))
      }
    }, 120)
    return () => clearTimeout(t)
  }, [m.id, q, status, search, props.version])

  const set = (p: Partial<OfferQuery>): void => setQ((x) => ({ ...x, ...p, page: p.page ?? 1 }))
  const sortBy = (s: OfferQuery['sort']): void => set({ sort: s })
  const toggleCmp = (o: OfferView): void => {
    const n = new Map(cmp)
    if (n.has(o.id)) n.delete(o.id)
    else if (n.size < 4) n.set(o.id, o)
    setCmp(n)
  }
  const fav = async (o: OfferView): Promise<void> => {
    await window.api.flightMon.favorite(o.id, !o.favorite)
    setQ((x) => ({ ...x }))
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const th = (label: string, s?: OfferQuery['sort']): React.ReactElement => (
    <th className={s ? 'sortable' : ''} onClick={s ? () => sortBy(s) : undefined} aria-sort={q.sort === s ? 'ascending' : undefined}>
      {label}
      {s && q.sort === s ? ' ▲' : ''}
    </th>
  )

  return (
    <div>
      <div className="fm-tabs" role="tablist">
        {STATUS_TABS.map((t) => (
          <button key={t.id} className={status === t.id ? 'active' : ''} onClick={() => setStatus(t.id)} title={t.hint} type="button">
            {t.label}
            <span className={`fm-pill ${t.id === 'eligible' ? 'ok' : t.id === 'pending' ? 'warn' : ''}`}>{data?.counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {data?.coverageNote && <div className="fm-note info" style={{ marginBottom: 8 }}>{data.coverageNote}</div>}

      <div className="fm-filters">
        <input type="search" placeholder="Buscar (aeroporto, cia, data)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={q.sort ?? ''} onChange={(e) => set({ sort: (e.target.value || undefined) as OfferQuery['sort'] })} aria-label="Ordenação">
          <option value="">Padrão: {STRATEGY_LABEL[m.config.preferences.strategy]}</option>
          {(Object.keys(STRATEGY_LABEL) as SortStrategy[]).map((s) => (
            <option key={s} value={s}>
              {STRATEGY_LABEL[s]}
            </option>
          ))}
          <option value="depart">Data de partida</option>
          <option value="recent">Cotação mais recente</option>
        </select>
        <select value={q.origins?.[0] ?? ''} onChange={(e) => set({ origins: e.target.value ? [e.target.value] : undefined })} aria-label="Origem">
          <option value="">Todas as origens</option>
          {data?.facets.origins.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={q.destinations?.[0] ?? ''} onChange={(e) => set({ destinations: e.target.value ? [e.target.value] : undefined })} aria-label="Destino">
          <option value="">Todos os destinos</option>
          {data?.facets.destinations.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={q.maxStops ?? ''} onChange={(e) => set({ maxStops: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Conexões">
          <option value="">Qualquer nº de conexões</option>
          <option value="0">Direto</option>
          <option value="1">Até 1</option>
          <option value="2">Até 2</option>
        </select>
        <select value={q.carriers?.[0] ?? ''} onChange={(e) => set({ carriers: e.target.value ? [e.target.value] : undefined })} aria-label="Companhia">
          <option value="">Todas as cias</option>
          {data?.facets.carriers.map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={q.verification?.[0] ?? ''} onChange={(e) => set({ verification: e.target.value ? [e.target.value as 'live'] : undefined })} aria-label="Verificação">
          <option value="">Qualquer verificação</option>
          <option value="live">Só ao vivo</option>
          <option value="cached">Só cache</option>
          <option value="imported">Importados</option>
          <option value="assisted">Assistidos</option>
        </select>
        <label className="fm-check fm-small">
          <input type="checkbox" checked={!!q.favoritesOnly} onChange={(e) => set({ favoritesOnly: e.target.checked })} /> ★ favoritos
        </label>
        <label className="fm-check fm-small" title="Diversifica origem, país, data, companhia e conexões no topo da lista">
          <input type="checkbox" checked={q.diversify !== false} onChange={(e) => set({ diversify: e.target.checked })} /> diversificar
        </label>
      </div>

      {err && <div className="fm-error">{err}</div>}

      {data && data.total === 0 ? (
        <div className="fm-empty">
          {data.counts.eligible + data.counts.pending + data.counts.excluded === 0 ? (
            <>
              <h3>Nenhum voo encontrado ainda</h3>
              <p className="fm-muted">Rode uma busca ou importe resultados. Datas sem dados não significam "sem voos".</p>
            </>
          ) : status === 'eligible' ? (
            <>
              <h3>Nenhum voo elegível pelos filtros</h3>
              <p className="fm-muted">
                {data.counts.pending} com verificação pendente e {data.counts.excluded} excluído(s). Veja as outras abas para entender o motivo.
              </p>
            </>
          ) : (
            <p className="fm-muted">Nada nesta aba com os filtros atuais.</p>
          )}
        </div>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <thead>
              <tr>
                <th title="Comparar (2–4)">⇄</th>
                <th>★</th>
                {th('Origem')}
                {th('Destino')}
                {th('Partida', 'depart')}
                {th('Chegada')}
                {th('Preço', 'price')}
                {th('Custo total', 'total_cost')}
                {th('Duração', 'duration')}
                {th('Conex.', 'stops')}
                {th('Via')}
                {th('Cia')}
                {th('Bagagem')}
                {th('Fonte / cotação', 'recent')}
                {th('Nota', 'value')}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((o) => (
                <React.Fragment key={o.id}>
                  <tr className={`main ${open === o.id ? 'open' : ''} ${o.available ? '' : 'gone'}`} onClick={() => setOpen(open === o.id ? null : o.id)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={cmp.has(o.id)} disabled={!cmp.has(o.id) && cmp.size >= 4} onChange={() => toggleCmp(o)} aria-label="Comparar" />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className={`fm-star ${o.favorite ? 'on' : ''}`} onClick={() => fav(o)} aria-label="Favoritar" type="button">
                        {o.favorite ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="nowrap">
                      <b>{o.origin}</b> <span className="fm-small">{o.originCountry}</span>
                    </td>
                    <td className="nowrap">
                      <b>{o.destination}</b>
                    </td>
                    <td className="nowrap">
                      {fmtLocal(o.slices[0].departLocal)}
                      {o.returnDate && <div className="fm-small">volta {fmtLocal(o.slices[1]?.departLocal)}</div>}
                    </td>
                    <td className="nowrap">{fmtLocal(o.slices[0].arriveLocal)}</td>
                    <td className="num">
                      <span className="strong">{formatMoney(o.price)}</span>
                      {o.cost.fareInCurrency && o.cost.fareInCurrency.currency !== o.price.currency && <div className="fm-small">≈ {formatMoney(o.cost.fareInCurrency)}</div>}
                      {o.previousPrice && o.previousPrice.amountMinor !== o.price.amountMinor && (
                        <div className="fm-small" style={{ color: o.previousPrice.amountMinor > o.price.amountMinor ? 'var(--success)' : 'var(--danger)' }}>
                          antes {formatMoney(o.previousPrice)}
                        </div>
                      )}
                    </td>
                    <td className="num" title={o.cost.totalStatus}>
                      {formatMoney(o.cost.total)}
                      <div className="fm-small">{o.cost.totalStatus === 'verified' ? 'verificado' : o.cost.totalStatus === 'estimated' ? 'estimado' : 'incompleto'}</div>
                    </td>
                    <td className="num">{fmtMinutes(o.totalDurationMin)}</td>
                    <td className="num">{o.stops}</td>
                    <td className="nowrap">{o.connections.length ? o.connections.map((c) => c.airport).join(' · ') : o.stops ? <span className="fm-small">?</span> : '—'}</td>
                    <td>{o.carriers.join(', ') || '—'}</td>
                    <td className="nowrap">{o.baggage.checked == null ? <span className="fm-pill warn">não verificado</span> : `${o.baggage.checked}× desp.`}</td>
                    <td>
                      <VerificationBadge v={o.verification} stale={o.stale} />
                      <div className="fm-small">{new Date(o.observedAt).toLocaleDateString('pt-BR')}</div>
                    </td>
                    <td className="num">
                      {o.score}
                      {o.highlights.length > 0 && (
                        <div className="fm-highlights">
                          {o.highlights.slice(0, 2).map((h) => (
                            <span key={h} className="fm-pill accent" title={h}>
                              {h.length > 22 ? `${h.slice(0, 22)}…` : h}
                            </span>
                          ))}
                        </div>
                      )}
                      {status !== 'eligible' && <div className="fm-small" style={{ maxWidth: 200, whiteSpace: 'normal' }}>{o.checks.find((c) => c.level === (status === 'excluded' ? 'fail' : 'unknown'))?.message}</div>}
                    </td>
                  </tr>
                  {open === o.id && (
                    <tr>
                      <td colSpan={15}>
                        <OfferDetail o={o} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {data && (
            <div className="fm-pager">
              <span className="fm-muted">
                {data.total} opção(ões) · meta de exibição {data.displayTarget}
              </span>
              <span className="fm-spacer" />
              <select value={data.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })} aria-label="Itens por página">
                {[data.displayTarget, 10, 20, 30, 50].filter((v, i, a) => a.indexOf(v) === i).map((n) => (
                  <option key={n} value={n}>
                    {n} por página
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm" disabled={data.page <= 1} onClick={() => set({ page: data.page - 1 })} type="button">
                ‹
              </button>
              <span>
                {data.page}/{pages}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={data.page >= pages} onClick={() => set({ page: data.page + 1 })} type="button">
                ›
              </button>
            </div>
          )}
        </div>
      )}

      <div className="fm-row" style={{ marginTop: 10 }}>
        <span className="fm-muted">Buscar mais opções:</span>
        <select value={moreN} onChange={(e) => setMoreN(Number(e.target.value))} aria-label="Quantas opções a mais">
          {[5, 10, 20, 30].map((n) => (
            <option key={n} value={n}>
              +{n}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary btn-sm" disabled={!props.canSearch} onClick={() => props.onMore(moreN)} type="button" title={props.canSearch ? 'Explora combinações ainda não consultadas' : 'Sem fonte automática disponível ou busca em andamento'}>
          🔭 Buscar mais opções
        </button>
      </div>

      {cmp.size > 0 && (
        <div className="fm-compare-bar">
          {cmp.size} selecionada(s)
          <button className="btn btn-primary btn-sm" disabled={cmp.size < 2} onClick={() => setShowCmp(true)} type="button">
            Comparar
          </button>
          <button className="fm-linkbtn" onClick={() => setCmp(new Map())} type="button">
            limpar
          </button>
        </div>
      )}
      {showCmp && <CompareModal offers={[...cmp.values()]} onClose={() => setShowCmp(false)} />}
    </div>
  )
}
