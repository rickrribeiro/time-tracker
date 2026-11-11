import React, { useEffect, useState } from 'react'
import type { MonitorSummary, SkyPick, TrackedCombo, TrackedView } from '../../../../shared/flights'
import { formatMoney } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { errMsg } from '../store/flightStore'
import { LineChart } from './Panels'
import { rel } from './ui'

const short = (minor: number, currency: string): string => formatMoney({ amountMinor: minor, currency }).replace(/,\d\d$/, '')
const dm = (d: string): string => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const dayLabel = (d: string): string => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')

function Delta(props: { c: TrackedCombo }): React.ReactElement {
  const { latest, previous } = props.c
  if (!latest || !previous) return <span className="fm-muted">—</span>
  const d = latest.amountMinor - previous.amountMinor
  if (d === 0) return <span className="fm-muted">=</span>
  const pct = Math.round((Math.abs(d) / previous.amountMinor) * 100)
  return (
    <span className={d < 0 ? 'fm-delta down' : 'fm-delta up'} title={`antes ${formatMoney(previous)}`}>
      {d < 0 ? '▼' : '▲'} {short(Math.abs(d), latest.currency)} ({pct}%)
    </span>
  )
}

/**
 * Combinações acompanhadas: o que você pesquisou no Skyscanner entra aqui. Mostra o menor
 * preço de cada combinação em cada dia de leitura, para ver a variação e comparar entre elas.
 */
export function TrackedPanel(props: { m: MonitorSummary; version: number; onResearch: (picks: SkyPick[]) => void }): React.ReactElement {
  const [data, setData] = useState<TrackedView | null>(null)
  const [err, setErr] = useState('')
  const [chart, setChart] = useState<Set<string> | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    window.api.flightMon
      .tracked(props.m.id)
      .then((d) => live && (setData(d), setErr('')))
      .catch((e) => live && setErr(errMsg(e)))
    return () => {
      live = false
    }
  }, [props.m.id, props.version, tick])

  if (err) return <div className="fm-error">{err}</div>
  if (!data) return <div className="fm-muted">Carregando…</div>
  if (!data.combos.length)
    return <div className="fm-empty">Nenhuma combinação acompanhada ainda. Tudo que você pesquisar no Skyscanner (botão 🔍) entra aqui automaticamente, com o preço de cada dia.</div>

  const cur = data.currency
  const key = (c: SkyPick): string => `${c.origin}|${c.destination}|${c.depart}|${c.ret ?? '-'}`
  const future = data.combos.filter((c) => !c.past)
  const priced = future.filter((c) => c.latest)
  const cheapest = priced[0]?.latest?.amountMinor ?? null
  // menor preço de cada coluna (dia de leitura) para destacar
  const colMin = new Map(data.days.map((d) => [d, Math.min(...data.combos.map((c) => c.points.find((p) => p.day === d)?.minor ?? Infinity))]))
  const chartKeys = chart ?? new Set(priced.slice(0, 5).map(key))
  const series = data.combos
    .filter((c) => chartKeys.has(key(c)) && c.points.length)
    .map((c) => ({ label: `${c.origin}→${c.destination} ${dm(c.depart)}${c.ret ? `–${dm(c.ret)}` : ''}`, points: c.points }))

  async function untrack(c: TrackedCombo): Promise<void> {
    try {
      await window.api.flightMon.untrack(props.m.id, { origin: c.origin, destination: c.destination, depart: c.depart, ret: c.ret })
      setTick((t) => t + 1)
    } catch (e) {
      setErr(errMsg(e))
    }
  }
  function toggleChart(c: TrackedCombo): void {
    const next = new Set(chartKeys)
    if (next.has(key(c))) next.delete(key(c))
    else next.add(key(c))
    setChart(next)
  }

  return (
    <div>
      <div className="fm-row" style={{ marginBottom: 8 }}>
        <span className="fm-small fm-grow">
          {future.length} combinação(ões) futuras · menor preço lido em cada dia, de todas as fontes (ofertas excluídas pelas suas restrições não contam). Pesquise de novo a cada dia para ver a variação.
        </span>
        <button className="btn btn-primary btn-sm" type="button" disabled={!future.length} onClick={() => props.onResearch(future.map((c) => ({ origin: c.origin, destination: c.destination, depart: c.depart, ret: c.ret })))}>
          🔍 Pesquisar de novo no Skyscanner
        </button>
      </div>

      <div className="fm-chart-card">
        <h4>Variação dia a dia {series.length ? `(${series.length} no gráfico — marque na tabela)` : ''}</h4>
        {data.days.length < 2 ? (
          <div className="fm-muted">
            Por enquanto só há leitura de {data.days[0] ? dm(data.days[0]) : 'nenhum dia'}. O gráfico aparece a partir da 2ª leitura em outro dia — pesquise as acompanhadas de novo amanhã.
          </div>
        ) : (
          <LineChart series={series} currency={cur} />
        )}
      </div>

      <div className="fm-table-wrap">
        <table className="report-table fm-tracked">
          <thead>
            <tr>
              <th title="No gráfico">📈</th>
              <th>Rota e datas</th>
              <th>Último</th>
              <th>Variação</th>
              <th>Menor já visto</th>
              {data.days.map((d) => (
                <th key={d} className="fm-num">
                  {dm(d)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data.combos.map((c) => (
              <tr key={key(c)} className={c.past ? 'past' : c.latest && c.latest.amountMinor === cheapest ? 'best' : ''}>
                <td>
                  <input type="checkbox" checked={chartKeys.has(key(c))} disabled={!c.points.length} onChange={() => toggleChart(c)} aria-label="Mostrar no gráfico" />
                </td>
                <td className="fm-tracked-route">
                  <div>
                    <b>{c.originLabel}</b> → {c.destinationLabel}
                  </div>
                  <div className="fm-small">
                    {dayLabel(c.depart)}
                    {c.ret ? ` → ${dayLabel(c.ret)}` : ''}
                    {c.past ? ' · já passou' : ''}
                    {c.lastCheckedAt ? ` · Skyscanner ${rel(c.lastCheckedAt)}` : ' · ainda não lida no Skyscanner'}
                    {c.offers ? ` · ${c.offers} oferta(s)` : ''}
                  </div>
                </td>
                <td className="fm-num">
                  {c.latest ? <b>{formatMoney(c.latest)}</b> : <span className="fm-muted">sem preço</span>}
                  {c.latest && c.latest.amountMinor === cheapest && !c.past && <div className="fm-pill ok">mais barata</div>}
                </td>
                <td className="fm-num">
                  <Delta c={c} />
                </td>
                <td className="fm-num">{c.best ? formatMoney(c.best) : '—'}</td>
                {data.days.map((d) => {
                  const p = c.points.find((x) => x.day === d)
                  return (
                    <td key={d} className={`fm-num ${p && p.minor === colMin.get(d) ? 'colbest' : ''}`}>
                      {p ? short(p.minor, cur) : <span className="fm-muted">·</span>}
                    </td>
                  )
                })}
                <td className="fm-nowrap">
                  <button className="fm-linkbtn" type="button" onClick={() => openExternal(c.url)} title="Abrir a pesquisa no Skyscanner">
                    ↗
                  </button>{' '}
                  <button className="fm-x" type="button" onClick={() => void untrack(c)} title="Parar de acompanhar" aria-label="Parar de acompanhar">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fm-small" style={{ marginTop: 6 }}>
        Colunas = dias em que houve leitura (não a data do voo). Em verde, a mais barata de cada dia. Os preços ficam guardados mesmo quando a oferta some.
      </div>
    </div>
  )
}
