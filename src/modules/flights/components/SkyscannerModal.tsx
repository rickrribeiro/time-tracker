import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { MonitorSummary, SkyPick, SkyPlace, SkyPreview } from '../../../../shared/flights'
import { formatMoney, skyKey } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'
import { Modal } from './Modal'

const dayLabel = (d: string): string => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '')
const dateText = (p: { depart: string; ret: string | null }): string => `${dayLabel(p.depart)}${p.ret ? ` → ${dayLabel(p.ret)}` : ''}`

const norm = (x: string): string => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Campo com busca (cidade, país ou IATA) e lista em ordem alfabética, agrupada por país. */
function PlacePicker(props: { places: SkyPlace[]; value: string; onChange: (iata: string) => void; placeholder: string }): React.ReactElement {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const current = props.places.find((p) => p.iata === props.value)
  const terms = norm(q).split(/\s+/).filter(Boolean)
  const match = (fields: (p: SkyPlace) => string): SkyPlace[] => props.places.filter((p) => terms.every((t) => norm(fields(p)).includes(t)))
  // cidade/IATA primeiro; país só se nenhuma cidade casar ("il" não deve listar tudo por causa de "Brasil")
  const byCity = match((p) => `${p.city} ${p.iata}`)
  const list = !terms.length ? props.places : byCity.length ? byCity : match((p) => `${p.city} ${p.iata} ${p.countryName}`)
  const multi = new Set(props.places.map((p) => p.country)).size > 1

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function pick(p: SkyPlace): void {
    props.onChange(p.iata)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="fm-picker" ref={box}>
      <input
        className="form-input"
        value={open ? q : current ? `${current.label} (${current.iata})` : ''}
        placeholder={props.placeholder}
        onFocus={() => (setOpen(true), setQ(''), setHi(0))}
        onChange={(e) => (setQ(e.target.value), setHi(0), setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(h + 1, list.length - 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(h - 1, 0)))
          else if (e.key === 'Enter' && list[hi]) (e.preventDefault(), pick(list[hi]))
          else if (e.key === 'Escape') (e.stopPropagation(), setOpen(false))
        }}
      />
      {open && (
        <div className="fm-suggest">
          {list.length === 0 && <div className="fm-muted" style={{ padding: '6px 10px' }}>Nada encontrado.</div>}
          {list.map((p, i) => (
            <React.Fragment key={p.iata}>
              {multi && (i === 0 || list[i - 1].country !== p.country) && <div className="fm-suggest-group">{p.countryName}</div>}
              <button type="button" className={`${i === hi ? 'hi' : ''} ${p.iata === props.value ? 'sel' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                <span>{p.city}</span>
                <small>{p.iata}</small>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Escolha das combinações para o Skyscanner pelo Chrome: sugestões (variando rota e data)
 * marcáveis uma a uma + seletor de rota com TODAS as datas do intervalo.
 */
export function SkyscannerModal(props: { m: MonitorSummary; initial?: SkyPick[]; onClose: () => void; onStarted: () => void }): React.ReactElement {
  const [pv, setPv] = useState<SkyPreview | null>(null)
  const [sel, setSel] = useState<Map<string, SkyPick>>(new Map())
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    window.api.flightMon
      .skyscannerPreview(props.m.id)
      .then((r) => {
        setPv(r)
        const start = props.initial?.length ? props.initial.slice(0, r.maxPerRun) : r.recommended.slice(0, 5)
        setSel(new Map(start.map((c) => [skyKey(c), { origin: c.origin, destination: c.destination, depart: c.depart, ret: c.ret }])))
        const first = r.recommended[0] ?? (r.pairs[0] ? { origin: r.pairs[0].split('|')[0], destination: r.pairs[0].split('|')[1] } : null)
        if (first) (setOrigin(first.origin), setDest(first.destination))
      })
      .catch((e) => setErr(errMsg(e)))
  }, [])

  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of [...(pv?.origins ?? []), ...(pv?.destinations ?? [])]) map.set(p.iata, `${p.label} (${p.iata})`)
    return map
  }, [pv])
  const pairSet = useMemo(() => new Set(pv?.pairs ?? []), [pv])
  const destOptions = (pv?.destinations ?? []).filter((d) => pairSet.has(`${origin}|${d.iata}`))
  const pairOk = pairSet.has(`${origin}|${dest}`)
  const max = pv?.maxPerRun ?? 30
  const full = sel.size >= max

  function toggle(p: SkyPick, on?: boolean): void {
    setSel((prev) => {
      const next = new Map(prev)
      const k = skyKey(p)
      const want = on ?? !next.has(k)
      if (!want) next.delete(k)
      else if (next.size < max) next.set(k, { origin: p.origin, destination: p.destination, depart: p.depart, ret: p.ret })
      return next
    })
  }
  function setRecommended(n: number): void {
    if (!pv) return
    setSel((prev) => {
      const recKeys = new Set(pv.recommended.map(skyKey))
      const next = new Map([...prev].filter(([k]) => !recKeys.has(k)))
      for (const c of pv.recommended.slice(0, n)) if (next.size < max) next.set(skyKey(c), c)
      return next
    })
  }
  function setRouteDates(on: boolean): void {
    if (!pv || !pairOk) return
    setSel((prev) => {
      const next = new Map(prev)
      for (const d of pv.dates) {
        const p = { origin, destination: dest, depart: d.depart, ret: d.ret }
        const k = skyKey(p)
        if (!on) next.delete(k)
        else if (!next.has(k) && !pv.recent[k] && next.size < max) next.set(k, p)
      }
      return next
    })
  }

  function setTracked(on: boolean): void {
    if (!pv) return
    setSel((prev) => {
      const next = new Map(prev)
      for (const t of pv.tracked) {
        const k = skyKey(t)
        if (!on) next.delete(k)
        else if (next.size < max) next.set(k, t)
      }
      return next
    })
  }

  async function start(): Promise<void> {
    setStarting(true)
    setErr('')
    try {
      await window.api.flightMon.skyscanner(props.m.id, [...sel.values()])
      props.onStarted()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setStarting(false)
    }
  }

  const price = (k: string): string | null => (pv?.known[k] != null ? formatMoney({ amountMinor: pv.known[k], currency: pv.currency }) : null)
  const sessions = pv ? Math.ceil(sel.size / pv.perSession) : 0
  const recCount = pv ? pv.recommended.filter((c) => sel.has(skyKey(c))).length : 0

  return (
    <Modal
      title="Buscar no Skyscanner (Claude + Chrome)"
      size="wide"
      onClose={props.onClose}
      footer={
        <>
          <span className="fm-grow fm-small">
            {sel.size} de no máx. {max} · {sessions} sessão(ões) do Claude de até {pv?.perSession ?? 5} combinações, uma após a outra. Acompanhe pelo Chrome.
          </span>
          <button className="btn btn-primary btn-sm" disabled={starting || !sel.size || !!pv?.busy} onClick={start} type="button">
            {starting ? 'Iniciando…' : `Pesquisar ${sel.size} combinação(ões)`}
          </button>
        </>
      }
    >
      <div className="fm-small" style={{ marginBottom: 8 }}>
        Chrome aberto com a extensão <b>Claude in Chrome</b> conectada. Se o Skyscanner pedir verificação, o Claude para (o app não contorna) e o resto volta para a fila. Cada sessão custa ~US$ 0,10–0,25 (equivalente API) — só abrir as ferramentas do Chrome já custa isso.
      </div>
      {pv?.busy && <div className="fm-note warn">Já há uma busca no Chrome em andamento (uma por vez).</div>}
      {err && <div className="fm-error">{err}</div>}
      {!pv ? (
        !err && <div className="fm-muted">Montando combinações…</div>
      ) : (
        <>
          {pv.tracked.length > 0 && (
            <div className="fm-note" style={{ margin: '4px 0 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="fm-grow">
                <b>{pv.tracked.length}</b> combinação(ões) acompanhada(s) — {pv.tracked.filter((t) => sel.has(skyKey(t))).length} marcada(s). Tudo que você pesquisa entra na aba Acompanhadas.
              </span>
              <button className="fm-linkbtn" type="button" onClick={() => setTracked(true)}>
                marcar acompanhadas
              </button>
              <button className="fm-linkbtn" type="button" onClick={() => setTracked(false)}>
                desmarcar
              </button>
            </div>
          )}
          <div className="fm-row" style={{ margin: '4px 0 6px' }}>
            <span className="fm-label" style={{ margin: 0 }}>
              Sugestões ({recCount}/{pv.recommended.length})
            </span>
            <span className="fm-spacer" />
            <div className="fm-seg">
              {[5, 10, 20].filter((n) => n <= pv.recommended.length || n === 5).map((n) => (
                <button key={n} onClick={() => setRecommended(n)} type="button">
                  {n} primeiras
                </button>
              ))}
              <button onClick={() => setRecommended(pv.recommended.length)} type="button">
                todas
              </button>
              <button onClick={() => setRecommended(0)} type="button">
                nenhuma
              </button>
            </div>
          </div>
          {pv.recommended.length === 0 ? (
            <div className="fm-note">Nenhuma sugestão nova (o que havia foi consultado nas últimas 12 h). Escolha abaixo.</div>
          ) : (
            <div className="fm-sky-list">
              {pv.recommended.map((c) => {
                const k = skyKey(c)
                const p = price(k)
                return (
                  <label className={`fm-sky-row ${sel.has(k) ? 'on' : ''}`} key={k}>
                    <input type="checkbox" checked={sel.has(k)} disabled={!sel.has(k) && full} onChange={() => toggle(c)} />
                    <span className="fm-sky-route">
                      <b>{names.get(c.origin) ?? c.origin}</b> → {names.get(c.destination) ?? c.destination}
                    </span>
                    <span className="fm-sky-date">{dateText(c)}</span>
                    {p && <span className="fm-pill ok" title="Melhor tarifa já vista nesta combinação">{p}</span>}
                  </label>
                )
              })}
            </div>
          )}

          <div className="fm-label" style={{ margin: '12px 0 6px' }}>
            Escolher rota e datas
          </div>
          <div className="fm-sky-pick">
            <PlacePicker places={pv.origins} value={origin} onChange={setOrigin} placeholder="Buscar origem (cidade, país ou IATA)" />
            <span className="fm-muted">→</span>
            <PlacePicker places={destOptions} value={pairOk ? dest : ''} onChange={setDest} placeholder="Buscar destino (cidade, país ou IATA)" />
          </div>
          {pairOk && (
            <>
              <div className="fm-row" style={{ margin: '6px 0' }}>
                <span className="fm-small">
                  {pv.dates.length} data(s){pv.datesTotal > pv.dates.length ? ` (de ${pv.datesTotal}; estreite a duração para ver todas)` : ''} · clique para marcar
                </span>
                <span className="fm-spacer" />
                <button className="fm-linkbtn" type="button" disabled={full} onClick={() => setRouteDates(true)}>
                  marcar todas
                </button>
                <button className="fm-linkbtn" type="button" onClick={() => setRouteDates(false)}>
                  desmarcar
                </button>
              </div>
              <div className="fm-datechips">
                {pv.dates.map((d) => {
                  const p = { origin, destination: dest, depart: d.depart, ret: d.ret }
                  const k = skyKey(p)
                  const on = sel.has(k)
                  const pr = price(k)
                  const rc = pv.recent[k]
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`fm-datechip ${on ? 'on' : ''} ${rc ? 'recent' : ''}`}
                      disabled={!on && full}
                      onClick={() => toggle(p)}
                      title={rc ? `Consultado no Skyscanner às ${new Date(rc).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : undefined}
                    >
                      <span>{dateText(d)}</span>
                      <small>{pr ?? (rc ? 'consultado' : ' ')}</small>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {sel.size > 0 && (
            <>
              <div className="fm-label" style={{ margin: '12px 0 6px' }}>
                Selecionadas ({sel.size})
              </div>
              <div className="fm-chips">
                {[...sel.entries()].map(([k, p]) => (
                  <span className="fm-chip" key={k}>
                    {p.origin}→{p.destination} {dateText(p)}
                    <button className="fm-x" type="button" onClick={() => toggle(p, false)} aria-label="Remover">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
