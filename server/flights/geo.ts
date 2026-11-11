import data from './data/airports.json'
import type { AirportInfo, LocationRef, LocationSet, PlaceSuggestion } from '../../shared/flights'
import { REGIONS, REGION_STATES } from '../../shared/flights'

/**
 * Base geográfica estruturada (OurAirports + fusos mwgg, ver scripts/build-airports.mjs).
 * Tudo aqui é determinístico: a IA nunca inventa aeroportos/códigos/distâncias —
 * qualquer código que ela sugira passa por `getAirport`/`resolveRef`.
 */
type Row = [string, string, string, string, string, number, number, string, 'L' | 'M' | 'S', number]

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' })
  } catch {
    return null
  }
})()

export function countryName(code: string): string {
  try {
    return countryNames?.of(code) ?? code
  } catch {
    return code
  }
}

/** Metrópoles com vários aeroportos (códigos de cidade IATA). */
export const METRO: Record<string, { label: string; airports: string[] }> = {
  TYO: { label: 'Tóquio', airports: ['HND', 'NRT'] },
  OSA: { label: 'Osaka', airports: ['KIX', 'ITM', 'UKB'] },
  SAO: { label: 'São Paulo', airports: ['GRU', 'CGH', 'VCP'] },
  RIO: { label: 'Rio de Janeiro', airports: ['GIG', 'SDU'] },
  BHZ: { label: 'Belo Horizonte', airports: ['CNF', 'PLU'] },
  BKK: { label: 'Bangkok', airports: ['BKK', 'DMK'] },
  KUL: { label: 'Kuala Lumpur', airports: ['KUL', 'SZB'] },
  JKT: { label: 'Jacarta', airports: ['CGK', 'HLP'] },
  SEL: { label: 'Seul', airports: ['ICN', 'GMP'] },
  BJS: { label: 'Pequim', airports: ['PEK', 'PKX'] },
  SHA: { label: 'Xangai', airports: ['PVG', 'SHA'] },
  TPE: { label: 'Taipé', airports: ['TPE', 'TSA'] },
  LON: { label: 'Londres', airports: ['LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN'] },
  PAR: { label: 'Paris', airports: ['CDG', 'ORY', 'BVA'] },
  MIL: { label: 'Milão', airports: ['MXP', 'LIN', 'BGY'] },
  ROM: { label: 'Roma', airports: ['FCO', 'CIA'] },
  STO: { label: 'Estocolmo', airports: ['ARN', 'BMA', 'NYO'] },
  MOW: { label: 'Moscou', airports: ['SVO', 'DME', 'VKO'] },
  IST: { label: 'Istambul', airports: ['IST', 'SAW'] },
  DXB: { label: 'Dubai', airports: ['DXB', 'DWC'] },
  NYC: { label: 'Nova York', airports: ['JFK', 'EWR', 'LGA'] },
  WAS: { label: 'Washington', airports: ['IAD', 'DCA', 'BWI'] },
  CHI: { label: 'Chicago', airports: ['ORD', 'MDW'] },
  BUE: { label: 'Buenos Aires', airports: ['EZE', 'AEP'] },
  YTO: { label: 'Toronto', airports: ['YYZ', 'YTZ'] }
}

const airports: AirportInfo[] = (data.airports as unknown as Row[]).map((r) => ({
  iata: r[0],
  name: r[1],
  city: r[2],
  country: r[3],
  countryName: countryName(r[3]),
  region: r[4],
  regionName: (data.regions as Record<string, string>)[r[4]] ?? r[4],
  lat: r[5],
  lon: r[6],
  tz: r[7] || null,
  size: r[8],
  scheduled: r[9] === 1
}))
const byIata = new Map(airports.map((a) => [a.iata, a]))

export function allAirports(): AirportInfo[] {
  return airports
}

export function getAirport(iata: string | null | undefined): AirportInfo | null {
  if (!iata) return null
  return byIata.get(iata.trim().toUpperCase()) ?? null
}

export function airportCountry(iata: string): string | null {
  return getAirport(iata)?.country ?? null
}

/** Distância de grande círculo (haversine), em km. */
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371.0088
  const rad = (d: number): number => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Ordem de relevância: grande > médio > pequeno; com voo regular antes. */
/**
 * Principais aeroportos internacionais por movimento de passageiros (lista curada, só para
 * PRIORIZAR quando um país/região tem dezenas de aeroportos — não cria nem remove nada da base).
 */
const HUB_LIST = (
    // Sudeste/Leste/Sul da Ásia e Oceania
    'BKK DMK HKT CNX SIN KUL PEN BKI KCH CGK DPS SUB MNL CEB CRK SGN HAN DAD CXR PQC VTE LPQ KTI SAI RGN MDL BWN DIL ' +
    'HND NRT KIX ITM NGO FUK CTS OKA ICN GMP PUS CJU PEK PKX PVG SHA CAN SZX CTU TFU CKG KMG XIY HGH XMN HKG MFM TPE KHH ' +
    'DEL BOM BLR MAA HYD CCU COK CMB MLE KTM DAC SYD MEL BNE PER AKL ADL CHC NAN PPT ' +
    // Oriente Médio / África
    'DXB AUH DOH SHJ RUH JED DMM MCT BAH KWI AMM TLV IST SAW AYT ESB CAI CMN RAK ADD NBO JNB CPT DUR LOS ACC DSS DAR ZNZ MRU SID RAI ALG TUN ' +
    // Europa
    'LHR LGW MAN STN DUB EDI CDG ORY NCE LYS MRS FRA MUC BER DUS HAM AMS BRU ZRH GVA VIE MAD BCN AGP PMI VLC LIS OPO FAO FCO MXP LIN VCE NAP BLQ CPH OSL ARN HEL KEF WAW KRK PRG BUD OTP SOF ATH SKG LCA ' +
    // Américas
    'JFK EWR LGA IAD BOS ATL MIA FLL MCO ORD DFW IAH LAX SFO SEA LAS DEN PHX YYZ YUL YVR MEX CUN GDL PTY SJO BOG MDE LIM SCL EZE AEP GRU GIG VCP CGH BSB CNF SSA REC FOR POA CWB FLN BEL MAO NAT MCZ AJU JPA SLZ IOS BPS MVD ASU UIO GYE HAV SDQ PUJ SJU'
).split(' ')
export const HUBS = new Set(HUB_LIST)
/** Ordem dentro da lista = importância relativa (desempata hubs do mesmo país). */
const HUB_RANK = new Map(HUB_LIST.map((c, i) => [c, 1 - i / HUB_LIST.length]))

export function airportWeight(a: AirportInfo): number {
  const hub = HUBS.has(a.iata)
  // entre hubs manda a ordem curada; o "International" no nome só desempata os demais
  return (hub ? 4 + (HUB_RANK.get(a.iata) ?? 0) : /international|internacional/i.test(a.name) ? 0.5 : 0) + (a.size === 'L' ? 3 : a.size === 'M' ? 2 : 1) + (a.scheduled ? 2 : 0)
}

function cityKey(a: AirportInfo): string {
  return `${a.country}:${a.city}`
}

/** Aeroportos que um LocationRef representa (antes de exclusões). */
export function expandRef(ref: LocationRef, includeSmall = false): AirportInfo[] {
  const big = (a: AirportInfo): boolean => a.scheduled && (includeSmall || a.size !== 'S')
  switch (ref.kind) {
    case 'airport': {
      const a = getAirport(ref.code)
      return a ? [a] : []
    }
    case 'city': {
      const metro = METRO[ref.code.toUpperCase()]
      if (metro) return metro.airports.map((c) => getAirport(c)).filter((a): a is AirportInfo => !!a)
      return airports.filter((a) => cityKey(a) === ref.code && a.scheduled)
    }
    case 'state':
      return airports.filter((a) => a.region === ref.code && big(a))
    case 'country':
      return airports.filter((a) => a.country === ref.code.toUpperCase() && big(a))
    case 'region': {
      const r = REGIONS.find((x) => x.id === ref.code)
      if (!r) return []
      const states = REGION_STATES[r.id]
      if (states?.length) return airports.filter((a) => states.includes(a.region) && big(a))
      return airports.filter((a) => r.countries.includes(a.country) && big(a))
    }
  }
}

/** Expande um conjunto de localidades em aeroportos únicos, ordenados por relevância. */
export function expandSet(set: LocationSet): AirportInfo[] {
  const excluded = new Set(set.exclude.map((c) => c.toUpperCase()))
  const out = new Map<string, AirportInfo>()
  for (const ref of set.include) {
    for (const a of expandRef(ref, !!set.includeSmall)) if (!excluded.has(a.iata)) out.set(a.iata, a)
  }
  return [...out.values()].sort((a, b) => airportWeight(b) - airportWeight(a) || a.iata.localeCompare(b.iata))
}

/** Valida/normaliza um LocationRef vindo de fora (IA, cliente). null = não existe na base. */
export function resolveRef(ref: { kind?: string; code?: string; label?: string }): LocationRef | null {
  const code = String(ref.code ?? '').trim()
  if (!code) return null
  switch (ref.kind) {
    case 'airport': {
      const a = getAirport(code)
      return a ? { kind: 'airport', code: a.iata, label: `${a.city || a.name} (${a.iata})` } : null
    }
    case 'city': {
      const m = METRO[code.toUpperCase()]
      if (m) return { kind: 'city', code: code.toUpperCase(), label: `${m.label} (todos)` }
      const hit = airports.find((a) => cityKey(a) === code)
      return hit ? { kind: 'city', code, label: `${hit.city}, ${hit.countryName}` } : null
    }
    case 'state': {
      const hit = airports.find((a) => a.region === code.toUpperCase())
      return hit ? { kind: 'state', code: hit.region, label: `${hit.regionName} (${hit.country})` } : null
    }
    case 'country': {
      const c = code.toUpperCase()
      return airports.some((a) => a.country === c) ? { kind: 'country', code: c, label: countryName(c) } : null
    }
    case 'region': {
      const r = REGIONS.find((x) => x.id === code)
      return r ? { kind: 'region', code: r.id, label: r.label } : null
    }
    default:
      return null
  }
}

/** Autocomplete: aeroportos, cidades, estados, países e regiões. */
export function searchPlaces(query: string, limit = 12): PlaceSuggestion[] {
  const q = norm(query)
  if (!q) return []
  const out: (PlaceSuggestion & { rank: number })[] = []
  const seen = new Set<string>()
  const push = (s: PlaceSuggestion, rank: number): void => {
    const k = `${s.kind}:${s.code}`
    if (seen.has(k)) return
    seen.add(k)
    out.push({ ...s, rank })
  }
  const starts = (s: string): number => {
    const n = norm(s)
    return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : -1
  }

  for (const r of REGIONS) {
    const m = starts(r.label)
    if (m >= 0) push({ kind: 'region', code: r.id, label: r.label, sub: 'Região', airports: expandRef({ kind: 'region', code: r.id, label: '' }).length }, m + 0.5)
  }
  for (const [code, m] of Object.entries(METRO)) {
    const s = q.length === 3 && code.toLowerCase() === q ? 0 : starts(m.label)
    if (s >= 0) push({ kind: 'city', code, label: `${m.label} (todos)`, sub: `Cidade · ${m.airports.join(', ')}`, airports: m.airports.length }, s)
  }
  const countries = new Set(airports.map((a) => a.country))
  for (const c of countries) {
    const s = q.length === 2 && c.toLowerCase() === q ? 0 : starts(countryName(c))
    if (s >= 0) push({ kind: 'country', code: c, label: countryName(c), sub: 'País', airports: expandRef({ kind: 'country', code: c, label: '' }).length }, s + 0.3)
  }
  const states = new Map<string, AirportInfo>()
  for (const a of airports) if (!states.has(a.region)) states.set(a.region, a)
  for (const [code, a] of states) {
    const s = starts(a.regionName)
    if (s >= 0 && s < 2 && a.regionName !== a.countryName)
      push({ kind: 'state', code, label: `${a.regionName}`, sub: `Estado/região · ${a.countryName}`, airports: expandRef({ kind: 'state', code, label: '' }).length }, s + 0.8)
  }
  const cities = new Map<string, AirportInfo[]>()
  for (const a of airports) {
    if (!a.city) continue
    const list = cities.get(cityKey(a)) ?? []
    list.push(a)
    cities.set(cityKey(a), list)
  }
  for (const a of airports) {
    let s = a.iata.toLowerCase() === q ? 0 : -1
    if (s < 0) {
      const c = starts(a.city)
      const n = starts(a.name)
      s = c >= 0 ? c + 0.2 : n >= 0 ? n + 0.6 : -1
    }
    if (s < 0) continue
    s -= airportWeight(a) * 0.05
    push({ kind: 'airport', code: a.iata, label: `${a.city || a.name} (${a.iata})`, sub: `${a.name} · ${a.countryName}${a.scheduled ? '' : ' · sem voo regular conhecido'}`, airports: 1 }, s)
    const sibling = cities.get(cityKey(a)) ?? []
    if (sibling.filter((x) => x.scheduled).length > 1 && starts(a.city) >= 0)
      push({ kind: 'city', code: cityKey(a), label: `${a.city}, ${a.countryName} (todos)`, sub: `Cidade · ${sibling.filter((x) => x.scheduled).map((x) => x.iata).join(', ')}`, airports: sibling.length }, s + 0.1)
  }
  return out
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ rank: _r, ...s }) => s)
}

/** Centro geográfico de uma localidade (cidade/aeroporto) — base da busca por aeroportos próximos. */
export function refCenter(ref: LocationRef): { lat: number; lon: number; label: string } | null {
  const list = expandRef(ref, true)
  if (!list.length) return null
  if (ref.kind === 'country' || ref.kind === 'region') return null
  const lat = list.reduce((s, a) => s + a.lat, 0) / list.length
  const lon = list.reduce((s, a) => s + a.lon, 0) / list.length
  return { lat, lon, label: ref.label }
}

/** Aeroportos num raio (km), mais próximos primeiro. Só os com voo regular, salvo `includeNoService`. */
export function airportsNear(
  center: { lat: number; lon: number },
  radiusKm: number,
  opts: { includeNoService?: boolean; limit?: number } = {}
): (AirportInfo & { distanceKm: number })[] {
  return airports
    .filter((a) => opts.includeNoService || a.scheduled)
    .map((a) => ({ ...a, distanceKm: Math.round(haversineKm(center, a)) }))
    .filter((a) => a.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, opts.limit ?? 25)
}

/** Resumo legível de um conjunto de localidades ("Tailândia, Vietnã +2"). */
export function summarizeSet(set: LocationSet): string {
  if (!set.include.length) return '—'
  const labels = set.include.map((r) => r.label.replace(/ \(todos\)$/, ''))
  const head = labels.slice(0, 3).join(', ')
  return labels.length > 3 ? `${head} +${labels.length - 3}` : head
}
