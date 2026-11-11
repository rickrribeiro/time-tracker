import type { ImportPreview, NormalizedOffer, Segment, Slice, Verification } from '../../shared/flights'
import { isIsoDate } from './dates'
import { getAirport } from './geo'
import { decimalToMinor } from './providers/types'

/**
 * Importação de resultados de fontes legítimas (export de outra ferramenta, alerta de
 * e-mail já estruturado, saída da busca assistida). Formato simples, documentado em
 * docs/passagens.md. Tudo é validado contra a base de aeroportos; nada é inventado —
 * campo ausente fica desconhecido (null).
 *
 * JSON: [{ origin, destination, depart: 'YYYY-MM-DDTHH:MM', arrive?, price, currency,
 *          stops?, carrier?, flight?, segments?: [{from,to,depart,arrive,carrier,flight}],
 *          return?: { depart, arrive?, stops?, segments? }, checked_bags?, carry_on?,
 *          refundable?, self_transfer?, link?, link_kind?: 'offer'|'search',
 *          source?, observed_at? }]
 * CSV: cabeçalho com as mesmas chaves planas (sem segments/return).
 */

type Obj = Record<string, unknown>
const s = (v: unknown): string => (v == null ? '' : String(v).trim())
const numOrNull = (v: unknown): number | null => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const boolOrNull = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v
  const t = s(v).toLowerCase()
  return ['1', 'true', 'sim', 'yes', 's'].includes(t) ? true : ['0', 'false', 'nao', 'não', 'no', 'n'].includes(t) ? false : null
}
const localTime = (v: unknown): string | null => {
  const t = s(v).replace(' ', 'T')
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) ? t.slice(0, 16) : isIsoDate(t) ? `${t}T00:00` : null
}

function parseCsv(text: string): Obj[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const split = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (c === '"') q = false
        else cur += c
      } else if (c === '"') q = true
      else if (c === sep) {
        out.push(cur)
        cur = ''
      } else cur += c
    }
    out.push(cur)
    return out
  }
  const head = split(lines[0]).map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])))
}

function segmentsOf(v: unknown, errs: string[], ctx: string): Segment[] {
  if (!Array.isArray(v)) return []
  const out: Segment[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Obj
    const from = s(r.from).toUpperCase()
    const to = s(r.to).toUpperCase()
    const dep = localTime(r.depart)
    const arr = localTime(r.arrive)
    if (!getAirport(from) || !getAirport(to) || !dep || !arr) {
      errs.push(`${ctx}: trecho inválido (${from}→${to}).`)
      return []
    }
    out.push({ from, to, departLocal: dep, arriveLocal: arr, durationMin: numOrNull(r.duration_min), marketingCarrier: s(r.carrier).toUpperCase() || null, operatingCarrier: s(r.operating_carrier).toUpperCase() || null, flightNumber: s(r.flight) || null, terminalFrom: s(r.terminal_from) || null, terminalTo: s(r.terminal_to) || null, aircraft: null })
  }
  return out
}

/** Escalas sem horário: só códigos IATA existentes na base. */
function viaOf(v: unknown): string[] | undefined {
  const list = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;/|]+/) : []).map((x) => s(x).toUpperCase()).filter((x) => !!getAirport(x))
  return list.length ? list : undefined
}

function sliceOf(r: Obj, from: string, to: string, errs: string[], ctx: string): Slice | null {
  const segs = segmentsOf(r.segments, errs, ctx)
  const dep = localTime(r.depart) ?? segs[0]?.departLocal ?? null
  if (!dep) {
    errs.push(`${ctx}: data/hora de partida ausente ou inválida.`)
    return null
  }
  const carrier = s(r.carrier).toUpperCase()
  return {
    from: segs[0]?.from ?? from,
    to: segs[segs.length - 1]?.to ?? to,
    departLocal: dep,
    arriveLocal: localTime(r.arrive) ?? segs[segs.length - 1]?.arriveLocal ?? null,
    durationMin: numOrNull(r.duration_min),
    stops: segs.length ? segs.length - 1 : Math.max(0, numOrNull(r.stops) ?? 0),
    carriers: carrier ? [carrier] : [...new Set(segs.map((x) => x.marketingCarrier).filter((x): x is string => !!x))],
    firstFlightNumber: s(r.flight) || segs[0]?.flightNumber || null,
    via: segs.length ? undefined : viaOf(r.via),
    segments: segs
  }
}

export function parseImport(text: string, defaults: { source: string; verification?: Verification; observedAt?: string }): ImportPreview {
  const errors: string[] = []
  let rows: Obj[] = []
  const t = text.trim()
  if (!t) return { offers: [], errors: ['Nada para importar.'] }
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const j = JSON.parse(t)
      rows = Array.isArray(j) ? j : Array.isArray(j?.offers) ? j.offers : [j]
    } catch (e) {
      return { offers: [], errors: [`JSON inválido: ${e instanceof Error ? e.message : String(e)}`] }
    }
  } else rows = parseCsv(t)

  const offers: NormalizedOffer[] = []
  rows.slice(0, 500).forEach((r, i) => {
    const ctx = `Linha ${i + 1}`
    if (!r || typeof r !== 'object') return
    const origin = s(r.origin).toUpperCase()
    const destination = s(r.destination).toUpperCase()
    if (!getAirport(origin) || !getAirport(destination)) {
      errors.push(`${ctx}: aeroporto desconhecido (${origin || '?'}→${destination || '?'}). Use códigos IATA.`)
      return
    }
    const currency = s(r.currency).toUpperCase()
    if (!/^[A-Z]{3}$/.test(currency)) {
      errors.push(`${ctx}: moeda ausente/inválida.`)
      return
    }
    let amountMinor: number
    try {
      amountMinor = decimalToMinor(s(r.price).replace(',', '.'), currency)
      if (amountMinor <= 0) throw new Error('≤ 0')
    } catch {
      errors.push(`${ctx}: preço inválido.`)
      return
    }
    const out = sliceOf(r, origin, destination, errors, ctx)
    if (!out) return
    const slices = [out]
    if (r.return && typeof r.return === 'object') {
      const back = sliceOf(r.return as Obj, destination, origin, errors, `${ctx} (volta)`)
      if (back) slices.push(back)
    } else if (r.return_depart) {
      const back = sliceOf({ depart: r.return_depart, arrive: r.return_arrive, stops: r.return_stops, carrier: r.carrier }, destination, origin, errors, `${ctx} (volta)`)
      if (back) slices.push(back)
    }
    const link = s(r.link)
    const validLink = /^https:\/\/[^\s]+$/i.test(link) ? link : null
    const observed = s(r.observed_at)
    offers.push({
      provider: 'import',
      sourceLabel: s(r.source) || defaults.source,
      externalId: null,
      slices,
      price: { amountMinor, currency },
      baggage: { checked: numOrNull(r.checked_bags), carryOn: numOrNull(r.carry_on), note: null },
      refundable: boolOrNull(r.refundable),
      selfTransfer: boolOrNull(r.self_transfer),
      separateTickets: boolOrNull(r.self_transfer),
      deepLink: validLink,
      // sem prova de que abre a oferta exata, link importado é tratado como pesquisa
      linkKind: validLink ? (s(r.link_kind) === 'offer' ? 'offer' : 'search') : null,
      verification: defaults.verification ?? 'imported',
      observedAt: !Number.isNaN(Date.parse(observed)) && observed ? new Date(observed).toISOString() : defaults.observedAt ?? new Date().toISOString(),
      expiresAt: null
    })
  })
  if (rows.length > 500) errors.push('Só as primeiras 500 linhas foram lidas.')
  return { offers, errors }
}
