import React, { useEffect, useRef, useState } from 'react'
import type { GroundOption, LocationRef, LocationSet, NearbyAirport, PlaceSuggestion } from '../../../../shared/flights'
import { fmtMinutes, formatMoney } from '../../../../shared/flights'
import { errMsg } from '../store/flightStore'

const KIND_LABEL: Record<string, string> = { airport: 'aeroporto', city: 'cidade', state: 'estado', country: 'país', region: 'região' }

/** Campo de busca com autocomplete da base de aeroportos (aeroporto/cidade/estado/país/região). */
export function PlaceSearch(props: { placeholder: string; onPick: (s: PlaceSuggestion) => void; kinds?: string[]; autoFocus?: boolean }): React.ReactElement {
  const [q, setQ] = useState('')
  const [list, setList] = useState<PlaceSuggestion[]>([])
  const [hi, setHi] = useState(0)
  const [open, setOpen] = useState(false)
  const seq = useRef(0)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setList([])
      return
    }
    const n = ++seq.current
    const t = setTimeout(async () => {
      const r = await window.api.flightMon.places(term).catch(() => [])
      if (n === seq.current) {
        setList(props.kinds ? r.filter((x) => props.kinds!.includes(x.kind)) : r)
        setHi(0)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [q])
  const pick = (s: PlaceSuggestion): void => {
    props.onPick(s)
    setQ('')
    setList([])
  }
  return (
    <div className="fm-picker fm-grow">
      <input
        value={q}
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, list.length - 1))
          else if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0))
          else if (e.key === 'Enter' && list[hi]) {
            e.preventDefault()
            pick(list[hi])
          }
        }}
        style={{ width: '100%' }}
        aria-autocomplete="list"
      />
      {open && list.length > 0 && (
        <div className="fm-suggest" role="listbox">
          {list.map((s, i) => (
            <button key={`${s.kind}:${s.code}`} className={i === hi ? 'hi' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} type="button">
              <span className="fm-kind">{KIND_LABEL[s.kind]}</span>
              <span>{s.label}</span>
              <small>
                {s.sub}
                {s.kind !== 'airport' ? ` · ${s.airports} aerop.` : ''}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Seletor de localidades em chips: inclui aeroportos/cidades/países/regiões, exclui
 * aeroportos específicos e sugere aeroportos próximos (distância real + rota terrestre).
 */
export function LocationPicker(props: {
  label: string
  value: LocationSet
  onChange: (v: LocationSet) => void
  advanced: boolean
  /** Destino: alternativas próximas viram opções de deslocamento terrestre. */
  onGround?: (g: GroundOption) => void
  currency: string
}): React.ReactElement {
  const { value, onChange } = props
  const [nearFor, setNearFor] = useState<LocationRef | null>(null)
  const add = (r: LocationRef): void => {
    if (value.include.some((x) => x.kind === r.kind && x.code === r.code)) return
    onChange({ ...value, include: [...value.include, { kind: r.kind, code: r.code, label: r.label }] })
  }
  const remove = (r: LocationRef): void => onChange({ ...value, include: value.include.filter((x) => !(x.kind === r.kind && x.code === r.code)) })
  const nearCandidates = value.include.filter((r) => r.kind === 'airport' || r.kind === 'city')
  const hasBroad = value.include.some((r) => r.kind !== 'airport')
  return (
    <div className="fm-field">
      <span className="fm-label">{props.label}</span>
      <div className="fm-chips">
        {value.include.map((r) => (
          <span className="fm-chip" key={`${r.kind}:${r.code}`} title={`${KIND_LABEL[r.kind]} ${r.code}`}>
            <i>{KIND_LABEL[r.kind]}</i>
            <span>{r.label}</span>
            <button className="fm-x" onClick={() => remove(r)} aria-label={`Remover ${r.label}`} type="button">
              ✕
            </button>
          </span>
        ))}
        {value.exclude.map((c) => (
          <span className="fm-chip exclude" key={`x:${c}`} title="Excluído">
            <span>{c}</span>
            <button className="fm-x" onClick={() => onChange({ ...value, exclude: value.exclude.filter((x) => x !== c) })} aria-label={`Voltar a incluir ${c}`} type="button">
              ✕
            </button>
          </span>
        ))}
        <PlaceSearch placeholder={value.include.length ? 'Adicionar…' : 'Cidade, aeroporto, país ou região…'} onPick={add} />
      </div>
      <div className="fm-row" style={{ marginTop: 4 }}>
        {nearCandidates.length > 0 && (
          <button className="fm-linkbtn" type="button" onClick={() => setNearFor(nearFor ? null : nearCandidates[0])}>
            📍 Sugerir aeroportos próximos
          </button>
        )}
        {props.advanced && hasBroad && (
          <span className="fm-row" style={{ gap: 4 }}>
            <span className="fm-small">Excluir aeroporto:</span>
            <div style={{ width: 180 }}>
              <PlaceSearch
                placeholder="IATA ou nome"
                kinds={['airport']}
                onPick={(s) => !value.exclude.includes(s.code) && onChange({ ...value, exclude: [...value.exclude, s.code] })}
              />
            </div>
          </span>
        )}
        {props.advanced && hasBroad && (
          <label className="fm-check fm-small">
            <input type="checkbox" checked={!!value.includeSmall} onChange={(e) => onChange({ ...value, includeSmall: e.target.checked })} />
            incluir aeroportos pequenos
          </label>
        )}
      </div>
      {nearFor && (
        <NearbyPanel
          refs={nearCandidates}
          current={nearFor}
          setCurrent={setNearFor}
          selected={new Set(value.include.filter((r) => r.kind === 'airport').map((r) => r.code))}
          currency={props.currency}
          onAdd={(list) => {
            const fresh = list.filter((a) => !value.include.some((x) => x.kind === 'airport' && x.code === a.iata))
            onChange({ ...value, include: [...value.include, ...fresh.map((a) => ({ kind: 'airport' as const, code: a.iata, label: `${a.city || a.name} (${a.iata})` }))] })
            if (props.onGround)
              for (const a of list)
                if (a.ground && a.distanceKm > 25)
                  props.onGround({
                    airport: a.iata,
                    toLabel: nearFor.label.replace(/ \(.*\)$/, ''),
                    minutes: a.ground.minutes,
                    costMinor: a.ground.costMinor,
                    currency: a.ground.currency ?? props.currency,
                    source: a.ground.source
                  })
          }}
          onClose={() => setNearFor(null)}
        />
      )}
    </div>
  )
}

function NearbyPanel(props: {
  refs: LocationRef[]
  current: LocationRef
  setCurrent: (r: LocationRef) => void
  selected: Set<string>
  currency: string
  onAdd: (list: NearbyAirport[]) => void
  onClose: () => void
}): React.ReactElement {
  const [radius, setRadius] = useState(350)
  const [withGround, setWithGround] = useState(true)
  const [list, setList] = useState<NearbyAirport[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())

  async function load(): Promise<void> {
    setBusy(true)
    setErr('')
    try {
      const r = await window.api.flightMon.nearby(props.current, radius, withGround)
      setList(r.airports)
      setChecked(new Set(r.airports.filter((a) => !props.selected.has(a.iata) && a.size !== 'S').slice(0, 4).map((a) => a.iata)))
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void load()
  }, [props.current.code])

  return (
    <div className="fm-nearby">
      <div className="fm-row">
        <b style={{ fontSize: 12 }}>Aeroportos perto de</b>
        <select value={`${props.current.kind}:${props.current.code}`} onChange={(e) => props.setCurrent(props.refs.find((r) => `${r.kind}:${r.code}` === e.target.value)!)}>
          {props.refs.map((r) => (
            <option key={`${r.kind}:${r.code}`} value={`${r.kind}:${r.code}`}>
              {r.label}
            </option>
          ))}
        </select>
        <label className="fm-row fm-small" style={{ gap: 4 }}>
          raio
          <input type="number" min={25} max={1000} step={25} value={radius} onChange={(e) => setRadius(Number(e.target.value) || 300)} style={{ width: 72 }} /> km
        </label>
        <label className="fm-check fm-small">
          <input type="checkbox" checked={withGround} onChange={(e) => setWithGround(e.target.checked)} /> rota terrestre
        </label>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={busy} type="button">
          {busy ? 'Calculando…' : 'Atualizar'}
        </button>
        <span className="fm-spacer" />
        <button className="fm-x" onClick={props.onClose} type="button" aria-label="Fechar">
          ✕
        </button>
      </div>
      {err && <div className="fm-error">{err}</div>}
      {list && (
        <>
          <div className="fm-nearby-list">
            {list.length === 0 && <div className="fm-muted">Nenhum aeroporto com voo regular nesse raio.</div>}
            {list.map((a) => (
              <label className="fm-nearby-item" key={a.iata}>
                <input
                  type="checkbox"
                  disabled={props.selected.has(a.iata)}
                  checked={props.selected.has(a.iata) || checked.has(a.iata)}
                  onChange={(e) => {
                    const n = new Set(checked)
                    if (e.target.checked) n.add(a.iata)
                    else n.delete(a.iata)
                    setChecked(n)
                  }}
                />
                <span>
                  <b>{a.iata}</b> {a.city || a.name} <span className="fm-small">· {a.name}</span>
                  {!a.scheduled && <span className="fm-pill warn">sem voo regular conhecido</span>}
                </span>
                <span className="fm-small" style={{ textAlign: 'right' }}>
                  {a.distanceKm} km em linha reta
                  {a.ground && (
                    <>
                      <br />
                      {a.ground.source === 'osrm' ? '🚗' : '≈'} {a.ground.km} km · {fmtMinutes(a.ground.minutes)}
                      {a.ground.costMinor != null && a.ground.currency ? ` · ${formatMoney({ amountMinor: a.ground.costMinor, currency: a.ground.currency })} (estim.)` : ''}
                    </>
                  )}
                </span>
              </label>
            ))}
          </div>
          <div className="fm-row" style={{ marginTop: 6 }}>
            <button className="btn btn-primary btn-sm" type="button" disabled={!checked.size} onClick={() => props.onAdd(list.filter((a) => checked.has(a.iata)))}>
              Adicionar {checked.size || ''} selecionado(s)
            </button>
            <button className="fm-linkbtn" type="button" onClick={() => setChecked(new Set(list.filter((a) => !props.selected.has(a.iata)).map((a) => a.iata)))}>
              selecionar todos
            </button>
            <span className="fm-small">
              Distâncias da base OurAirports. {withGround ? 'Rotas: OSRM (estimativa; ≈ = aproximação em linha reta). Custo só se configurado.' : ''}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
