import React from 'react'
import type { OfferView, Slice } from '../../../../shared/flights'
import { fmtMinutes, formatMoney } from '../../../../shared/flights'
import { openExternal } from '../../../api/createApi'
import { fmtLocal, VerificationBadge } from './ui'

function bagText(o: OfferView): string {
  const b = o.baggage
  const c = b.checked == null ? 'mala despachada: não verificado' : b.checked === 0 ? 'sem mala despachada' : `${b.checked} mala(s) despachada(s)`
  const h = b.carryOn == null ? 'mão: não verificado' : b.carryOn === 0 ? 'sem bagagem de mão' : `${b.carryOn} de mão`
  return `${c} · ${h}`
}

function Leg(props: { s: Slice; o: OfferView; title: string }): React.ReactElement {
  const { s, o } = props
  if (!s.segments.length) {
    return (
      <div>
        <div className="fm-leg-title">
          {props.title}: {s.from} → {s.to}
        </div>
        <div className="fm-note warn">
          A fonte informa só o resumo: partida {fmtLocal(s.departLocal)}, chegada {fmtLocal(s.arriveLocal)}, {s.stops} conexão(ões){s.carriers.length ? `, ${s.carriers.join('/')}` : ''}
          {s.firstFlightNumber ? ` (voo ${s.carriers[0] ?? ''}${s.firstFlightNumber})` : ''}
          {s.via?.length ? `, escalas em ${s.via.join(', ')} (tempos de conexão não lidos).` : '. Aeroportos e tempos de conexão não verificados — revalide numa fonte ao vivo.'}
        </div>
      </div>
    )
  }
  return (
    <div className="fm-timeline">
      <div className="fm-leg-title">
        {props.title}: {s.from} → {s.to} · {fmtMinutes(s.durationMin)}
      </div>
      {s.segments.map((g, i) => {
        const conn = i < s.segments.length - 1 ? o.connections.find((c) => c.arriveAirport === g.to && c.departAirport === s.segments[i + 1].from) : null
        return (
          <React.Fragment key={i}>
            <div className="fm-seg-row">
              <div className="fm-seg-rail">
                <i />
                <span />
              </div>
              <div className="fm-seg-body">
                <div>
                  <b>{fmtLocal(g.departLocal)}</b> {g.from}
                  {g.terminalFrom ? ` · T${g.terminalFrom}` : ''} → <b>{fmtLocal(g.arriveLocal)}</b> {g.to}
                  {g.terminalTo ? ` · T${g.terminalTo}` : ''}
                </div>
                <div className="fm-small">
                  {g.marketingCarrier}
                  {g.flightNumber} {g.operatingCarrier && g.operatingCarrier !== g.marketingCarrier ? `· operado por ${g.operatingCarrier}` : ''} · {fmtMinutes(g.durationMin)}
                  {g.aircraft ? ` · ${g.aircraft}` : ''} · horários locais
                </div>
              </div>
            </div>
            {conn && (
              <div className={`fm-layover ${conn.airportChange || (conn.minutes != null && conn.minutes < 60) ? 'danger' : conn.overnight ? 'warn' : conn.stopover ? 'stopover' : ''}`}>
                Conexão em <b>{conn.airport}</b>: {fmtMinutes(conn.minutes)}
                {conn.airportChange && ` · ⚠️ troca de aeroporto ${conn.arriveAirport} → ${conn.departAirport} (deslocamento por sua conta)`}
                {conn.overnight && ' · madrugada'}
                {conn.minutes != null && conn.minutes < 60 && ' · conexão curta'}
                {conn.stopover && ' · 🌏 dá para um stopover — verifique regras de entrada/visto e se a bagagem segue despachada'}
                {o.selfTransfer === true && ' · self-transfer: retirar e despachar a mala de novo'}
                {o.selfTransfer == null && ' · bilhete único não verificado'}
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function OfferDetail(props: { o: OfferView }): React.ReactElement {
  const { o } = props
  const c = o.cost
  return (
    <div className="fm-detail">
      <div>
        <Leg s={o.slices[0]} o={o} title="Ida" />
        {o.slices[1] && <Leg s={o.slices[1]} o={o} title="Volta" />}
        <div className="fm-small" style={{ marginTop: 6 }}>
          Condições de trânsito/visto não são verificadas pelo app. Confirme com a companhia e as autoridades antes de comprar.
        </div>
      </div>
      <div>
        <dl className="fm-kv">
          <dt>Tarifa</dt>
          <dd>
            {formatMoney(o.price)}
            {c.fareInCurrency && c.fareInCurrency.currency !== o.price.currency ? ` ≈ ${formatMoney(c.fareInCurrency)}` : ''}
            {o.previousPrice && ` (antes ${formatMoney(o.previousPrice)})`}
          </dd>
          <dt>Bagagem</dt>
          <dd>{bagText(o)}</dd>
          <dt>Terrestre</dt>
          <dd>
            {c.ground.status === 'none'
              ? '—'
              : `até ${c.ground.label}: ${fmtMinutes(c.ground.minutes)} · ${c.ground.amount ? formatMoney(c.ground.amount) : 'custo desconhecido'} (${c.ground.status === 'manual' ? 'informado' : c.ground.status === 'estimated' ? 'estimado' : 'desconhecido'})`}
          </dd>
          <dt>Custo total</dt>
          <dd>
            {formatMoney(c.total)} <span className={`fm-pill ${c.totalStatus === 'verified' ? 'ok' : c.totalStatus === 'estimated' ? 'warn' : 'danger'}`}>{c.totalStatus === 'verified' ? 'verificado' : c.totalStatus === 'estimated' ? 'estimado' : 'incompleto'}</span>
          </dd>
          <dt>Porta a porta</dt>
          <dd>{fmtMinutes(c.doorToDoorMinutes)}</dd>
          <dt>Reembolso</dt>
          <dd>{o.refundable == null ? 'não verificado' : o.refundable ? 'permitido' : 'não reembolsável'}</dd>
          <dt>Fonte</dt>
          <dd>
            {o.sourceLabel} <VerificationBadge v={o.verification} stale={o.stale} /> · cotado {new Date(o.observedAt).toLocaleString('pt-BR')}
            {o.sources.length > 1 ? ` · visto também em: ${o.sources.join(', ')}` : ''}
          </dd>
          <dt>Pontuação</dt>
          <dd title={Object.entries(o.scoreParts).map(([k, v]) => `${k}: ${Math.round(v * 100)}%`).join('\n')}>
            {o.score} — {Object.entries(o.scoreParts).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ')}
          </dd>
        </dl>
        {o.checks.length > 0 && (
          <ul className="fm-checks" style={{ marginTop: 8 }}>
            {o.checks.map((ch, i) => (
              <li key={i}>
                <span>{ch.level === 'fail' ? '⛔' : ch.level === 'unknown' ? '❓' : ch.level === 'warn' ? '⚠️' : 'ℹ️'}</span>
                <span>{ch.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="fm-row" style={{ marginTop: 8 }}>
          {o.deepLink && (
            <button className="btn btn-primary btn-sm" type="button" onClick={() => openExternal(o.deepLink!)}>
              {o.linkKind === 'offer' ? 'Abrir oferta ↗' : `Abrir pesquisa em ${o.sourceLabel.split(' ')[0]} ↗`}
            </button>
          )}
          {o.searchLinks.map((l) => (
            <button key={l.url} className="btn btn-secondary btn-sm" type="button" onClick={() => openExternal(l.url)} title="Abre uma pesquisa equivalente — não necessariamente esta oferta/preço">
              {l.label} ↗
            </button>
          ))}
        </div>
        <div className="fm-small" style={{ marginTop: 4 }}>
          {o.linkKind === 'offer' ? 'Link direto informado pela fonte.' : 'Links de pesquisa abrem a busca da rota/data; o preço pode ser diferente.'}
        </div>
      </div>
    </div>
  )
}
