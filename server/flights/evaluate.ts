import type {
  CheckResult,
  ConnectionInfo,
  CostBreakdown,
  EligibilityStatus,
  MonitorConfig,
  Money,
  NormalizedOffer,
  Slice,
  SortStrategy
} from '../../shared/flights'
import { fromMinor, minorDigits } from '../../shared/flights'
import { airportCountry, countryName, getAirport } from './geo'

/**
 * Motor determinístico: conexões → restrições obrigatórias → custo efetivo → pontuação
 * → diversificação. Nenhuma IA aqui. Regra de ouro: informação obrigatória ausente vira
 * "Verificação pendente" (unknown), nunca "compatível".
 */

export type Fx = (m: Money, to: string) => Money | null

// ── Tempo ─────────────────────────────────────────────────────────────────────

/** Offset (min) de um fuso IANA num instante. */
function tzOffsetMin(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUtc - utcMs) / 60000)
}

/** Hora local 'YYYY-MM-DDTHH:MM' de um aeroporto → epoch ms. Sem fuso conhecido → null. */
export function localToUtcMs(local: string, iata: string): number | null {
  const tz = getAirport(iata)?.tz
  const naive = Date.parse(`${local.slice(0, 16)}:00Z`)
  if (Number.isNaN(naive) || !tz) return null
  try {
    let off = tzOffsetMin(tz, naive)
    off = tzOffsetMin(tz, naive - off * 60000) // corrige perto da virada de horário de verão
    return naive - off * 60000
  } catch {
    return null
  }
}

function minutesBetween(aLocal: string, aIata: string, bLocal: string, bIata: string): number | null {
  if (aIata === bIata || getAirport(aIata)?.tz === getAirport(bIata)?.tz) {
    const a = Date.parse(`${aLocal.slice(0, 16)}:00Z`)
    const b = Date.parse(`${bLocal.slice(0, 16)}:00Z`)
    return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 60000)
  }
  const a = localToUtcMs(aLocal, aIata)
  const b = localToUtcMs(bLocal, bIata)
  return a == null || b == null ? null : Math.round((b - a) / 60000)
}

/** Cópia da oferta com durações ausentes calculadas pelos fusos dos aeroportos (para exibição). */
export function withDurations(o: NormalizedOffer): NormalizedOffer {
  return {
    ...o,
    slices: o.slices.map((s) => ({
      ...s,
      durationMin: sliceDuration(s),
      segments: s.segments.map((g) => ({ ...g, durationMin: g.durationMin ?? minutesBetween(g.departLocal, g.from, g.arriveLocal, g.to) }))
    }))
  }
}

export function sliceDuration(s: Slice): number | null {
  if (s.durationMin != null) return s.durationMin
  if (!s.arriveLocal) return null
  return minutesBetween(s.departLocal, s.from, s.arriveLocal, s.to)
}

/** Conexão "noturna": a espera cobre a madrugada (01h–05h locais). */
function isOvernight(arriveLocal: string, minutes: number): boolean {
  const start = Date.parse(`${arriveLocal.slice(0, 16)}:00Z`)
  if (Number.isNaN(start)) return false
  const end = start + minutes * 60000
  for (let t = start; t <= end; t += 30 * 60000) {
    const h = new Date(t).getUTCHours()
    if (h >= 1 && h < 5) return true
  }
  return false
}

export function connectionsOf(offer: NormalizedOffer, stopoverMaxHours: number | null): { list: ConnectionInfo[]; known: boolean } {
  const list: ConnectionInfo[] = []
  let known = true
  for (const s of offer.slices) {
    if (s.stops > 0 && s.segments.length < 2) {
      known = false
      // escalas conhecidas sem horário: servem para país/aeroporto, não para tempo/troca
      for (const ap of s.via ?? [])
        list.push({ airport: ap, arriveAirport: ap, departAirport: ap, minutes: null, airportChange: false, overnight: false, stopover: false, country: airportCountry(ap) ?? '??' })
      continue
    }
    for (let i = 0; i < s.segments.length - 1; i++) {
      const a = s.segments[i]
      const b = s.segments[i + 1]
      const minutes = minutesBetween(a.arriveLocal, a.to, b.departLocal, b.from)
      list.push({
        airport: a.to,
        arriveAirport: a.to,
        departAirport: b.from,
        minutes,
        airportChange: a.to !== b.from,
        overnight: minutes != null && isOvernight(a.arriveLocal, minutes),
        // só destaca stopover se o usuário pediu (preferência "stopovers de até X horas")
        stopover: minutes != null && stopoverMaxHours != null && minutes >= 6 * 60 && minutes <= stopoverMaxHours * 60,
        country: airportCountry(a.to) ?? '??'
      })
    }
  }
  return { list, known }
}

// ── Custo ─────────────────────────────────────────────────────────────────────

export function costOf(offer: NormalizedOffer, cfg: MonitorConfig, fx: Fx): CostBreakdown {
  const fareInCurrency = fx(offer.price, cfg.currency)
  const needBags = cfg.baggage.checked !== 'any'
  const checked = offer.baggage.checked
  const baggage: CostBreakdown['baggage'] = !needBags
    ? { status: 'not_needed', amount: null }
    : checked == null
      ? { status: 'unknown', amount: null }
      : checked >= Math.max(1, cfg.baggage.checkedCount)
        ? { status: 'included', amount: null }
        : { status: 'extra', amount: null }

  const arrival = offer.slices[0]?.to
  const g = cfg.ground.find((x) => x.airport === arrival)
  let ground: CostBreakdown['ground'] = { status: 'none', amount: null, minutes: null, label: null }
  if (g) {
    const amount = g.costMinor != null ? fx({ amountMinor: g.costMinor, currency: g.currency }, cfg.currency) : null
    ground = {
      status: g.costMinor == null ? 'unknown' : g.source === 'manual' ? 'manual' : 'estimated',
      amount,
      minutes: g.minutes,
      label: g.toLabel
    }
  }

  let total: Money | null = null
  if (fareInCurrency) {
    total = { amountMinor: fareInCurrency.amountMinor + (ground.amount?.amountMinor ?? 0), currency: cfg.currency }
  }
  const unknown = !fareInCurrency || baggage.status === 'unknown' || baggage.status === 'extra' || ground.status === 'unknown' || (g != null && g.costMinor != null && !ground.amount)
  const estimated = offer.verification === 'cached' || ground.status === 'estimated' || offer.price.currency !== cfg.currency
  const outbound = offer.slices[0] ? sliceDuration(offer.slices[0]) : null
  return {
    fare: offer.price,
    fareInCurrency,
    baggage,
    ground,
    total,
    totalStatus: unknown ? 'unknown' : estimated ? 'estimated' : 'verified',
    doorToDoorMinutes: outbound != null ? outbound + (ground.minutes ?? 0) : null
  }
}

// ── Restrições obrigatórias ───────────────────────────────────────────────────

export interface Evaluation {
  status: EligibilityStatus
  checks: CheckResult[]
  connections: ConnectionInfo[]
  cost: CostBreakdown
  totalDurationMin: number | null
  stops: number
  carriers: string[]
}

export function carriersOf(offer: NormalizedOffer): string[] {
  const set = new Set<string>()
  for (const s of offer.slices) {
    for (const c of s.carriers) if (c) set.add(c)
    for (const seg of s.segments) {
      if (seg.marketingCarrier) set.add(seg.marketingCarrier)
      if (seg.operatingCarrier) set.add(seg.operatingCarrier)
    }
  }
  return [...set]
}

export function evaluateOffer(offer: NormalizedOffer, cfg: MonitorConfig, fx: Fx, today: string): Evaluation {
  const c = cfg.constraints
  const checks: CheckResult[] = []
  const fail = (code: string, message: string): void => void checks.push({ code, level: 'fail', message })
  const unknown = (code: string, message: string): void => void checks.push({ code, level: 'unknown', message })
  const warn = (code: string, message: string): void => void checks.push({ code, level: 'warn', message })

  const stops = Math.max(0, ...offer.slices.map((s) => Math.max(s.stops, s.segments.length - 1)))
  const { list: connections, known: connKnown } = connectionsOf(offer, cfg.preferences.stopoverMaxHours)
  const durations = offer.slices.map(sliceDuration)
  const totalDurationMin = durations[0] ?? null
  const carriers = carriersOf(offer)

  if (offer.slices[0] && offer.slices[0].departLocal.slice(0, 10) < today) fail('past', 'Voo já partiu.')

  if (c.maxStops != null && stops > c.maxStops) fail('max_stops', `${stops} conexões (máximo ${c.maxStops}).`)

  if (c.maxTotalDurationHours != null) {
    durations.forEach((d, i) => {
      const leg = offer.slices.length > 1 ? (i === 0 ? ' (ida)' : ' (volta)') : ''
      if (d == null) unknown('duration', `Duração total desconhecida${leg}.`)
      else if (d > c.maxTotalDurationHours! * 60) fail('duration', `Duração ${Math.round(d / 60)}h${leg} acima do limite de ${c.maxTotalDurationHours}h.`)
    })
  }

  // escalas identificadas (com ou sem horário) bastam para checar país/aeroporto proibido
  const placesKnown = offer.slices.every((s) => s.stops === 0 || s.segments.length >= 2 || (s.via?.length ?? 0) >= s.stops)
  const needsPlaces = c.forbiddenConnectionCountries.length > 0 || c.forbiddenConnectionAirports.length > 0
  const needsTiming = c.forbidAirportChange || c.forbidOvernightConnections || c.minConnectionMinutes != null || c.maxConnectionMinutes != null
  if (needsPlaces && !placesKnown) unknown('connections', 'Aeroportos de conexão não informados pela fonte.')
  else if (needsTiming && !connKnown) unknown('connections_timing', 'Horários das conexões não informados pela fonte (tempo de conexão / troca de aeroporto não verificados).')

  const forbiddenC = new Set(c.forbiddenConnectionCountries.map((x) => x.toUpperCase()))
  const forbiddenA = new Set(c.forbiddenConnectionAirports.map((x) => x.toUpperCase()))
  for (const conn of connections) {
    for (const ap of new Set([conn.arriveAirport, conn.departAirport])) {
      const country = airportCountry(ap)
      if (country && forbiddenC.has(country)) fail('conn_country', `Conexão em ${ap} (${countryName(country)}) — país proibido.`)
      if (forbiddenA.has(ap)) fail('conn_airport', `Conexão em ${ap} — aeroporto proibido.`)
      if (!country && forbiddenC.size) unknown('conn_country', `País do aeroporto ${ap} desconhecido.`)
    }
    if (conn.airportChange && c.forbidAirportChange) fail('airport_change', `Troca de aeroporto ${conn.arriveAirport} → ${conn.departAirport}.`)
    else if (conn.airportChange) warn('airport_change', `Troca de aeroporto ${conn.arriveAirport} → ${conn.departAirport}.`)
    if (conn.minutes == null) {
      if (connKnown && (c.minConnectionMinutes != null || c.maxConnectionMinutes != null)) unknown('conn_time', `Tempo de conexão em ${conn.airport} desconhecido.`)
    } else {
      if (c.minConnectionMinutes != null && conn.minutes < c.minConnectionMinutes) fail('conn_short', `Conexão de ${conn.minutes} min em ${conn.airport} (mínimo ${c.minConnectionMinutes}).`)
      if (c.maxConnectionMinutes != null && conn.minutes > c.maxConnectionMinutes) fail('conn_long', `Conexão de ${Math.round(conn.minutes / 60)}h em ${conn.airport} (máximo ${Math.round(c.maxConnectionMinutes / 60)}h).`)
      if (conn.minutes < 0) fail('conn_negative', `Horários inconsistentes na conexão em ${conn.airport}.`)
    }
    if (conn.overnight && c.forbidOvernightConnections) fail('overnight', `Conexão noturna em ${conn.airport}.`)
  }

  if (c.forbiddenCarriers.length) {
    const bad = carriers.filter((x) => c.forbiddenCarriers.includes(x))
    if (bad.length) fail('carrier', `Companhia proibida: ${bad.join(', ')}.`)
    else if (!carriers.length) unknown('carrier', 'Companhia não informada.')
  }

  if (stops > 0) {
    if (offer.selfTransfer === true) {
      if (c.forbidSelfTransfer) fail('self_transfer', 'Self-transfer: bilhetes separados, retirar e despachar malas de novo.')
      else warn('self_transfer', 'Self-transfer: sem proteção em caso de atraso; pode exigir retirar malas.')
    } else if (offer.selfTransfer == null && c.forbidSelfTransfer) unknown('self_transfer', 'Não verificado se é bilhete único (self-transfer).')
  }

  const b = cfg.baggage
  if (b.checked === 'required') {
    if (offer.baggage.checked == null) unknown('bag_checked', 'Mala despachada: não verificado.')
    else if (offer.baggage.checked < Math.max(1, b.checkedCount))
      fail('bag_checked', offer.baggage.checked === 0 ? 'Tarifa sem mala despachada incluída.' : `Inclui ${offer.baggage.checked} mala(s), precisa de ${b.checkedCount}.`)
  }
  if (b.carryOn === 'required') {
    if (offer.baggage.carryOn == null) unknown('bag_carry', 'Bagagem de mão: não verificado.')
    else if (offer.baggage.carryOn < 1) fail('bag_carry', 'Tarifa sem bagagem de mão.')
  }
  if (b.refundable === 'required') {
    if (offer.refundable == null) unknown('refund', 'Reembolsável: não verificado.')
    else if (!offer.refundable) fail('refund', 'Tarifa não reembolsável.')
  }

  const cost = costOf(offer, cfg, fx)
  if (c.maxPrice) {
    const fare = fx(offer.price, c.maxPrice.currency)
    if (!fare) unknown('max_price', `Sem câmbio ${offer.price.currency}→${c.maxPrice.currency} para comparar com o preço máximo.`)
    else if (fare.amountMinor > c.maxPrice.amountMinor) fail('max_price', 'Acima do preço máximo.')
  }
  if (!cost.fareInCurrency) warn('fx', `Sem câmbio ${offer.price.currency}→${cfg.currency} configurado (Configurações → Finanças).`)
  if (offer.verification === 'cached') checks.push({ code: 'cached', level: 'info', message: 'Preço do cache do provedor (pode ter mudado). Revalide antes de comprar.' })

  const status: EligibilityStatus = checks.some((x) => x.level === 'fail') ? 'excluded' : checks.some((x) => x.level === 'unknown') ? 'pending' : 'eligible'
  return { status, checks, connections, cost, totalDurationMin, stops, carriers }
}

// ── Pontuação ─────────────────────────────────────────────────────────────────

export interface Scored {
  offer: NormalizedOffer
  ev: Evaluation
  score: number
  parts: Record<string, number>
  highlights: string[]
}

function comparableAmount(ev: Evaluation, useTotal: boolean): number | null {
  const m = useTotal ? ev.cost.total ?? ev.cost.fareInCurrency : ev.cost.fareInCurrency
  return m ? m.amountMinor : null
}

function connectionComfort(conns: ConnectionInfo[], style: MonitorConfig['preferences']['connectionStyle']): number {
  if (!conns.length) return 1
  const [lo, hi] = style === 'short' ? [50, 150] : style === 'comfortable' ? [90, 300] : style === 'long_ok' ? [60, 900] : [45, 1440]
  const each = conns.map((c) => {
    if (c.minutes == null) return 0.5
    let s = c.minutes < lo ? Math.max(0, c.minutes / lo) : c.minutes > hi ? Math.max(0.1, hi / c.minutes) : 1
    if (c.airportChange) s *= 0.5
    if (c.overnight) s *= 0.7
    return s
  })
  return each.reduce((a, b) => a + b, 0) / each.length
}

function inWindow(hhmm: string, w: { from: string; to: string }): boolean {
  return w.from <= w.to ? hhmm >= w.from && hhmm <= w.to : hhmm >= w.from || hhmm <= w.to
}

/** Pontua (0–100) um conjunto de ofertas avaliadas; normalização relativa ao conjunto. */
export function scoreAll(items: { offer: NormalizedOffer; ev: Evaluation }[], cfg: MonitorConfig): Scored[] {
  const p = cfg.preferences
  const w = p.weights
  const amounts = items.map((x) => comparableAmount(x.ev, true)).filter((x): x is number => x != null && x > 0)
  const minAmount = amounts.length ? Math.min(...amounts) : null
  const durs = items.map((x) => x.ev.cost.doorToDoorMinutes ?? x.ev.totalDurationMin).filter((x): x is number => x != null && x > 0)
  const minDur = durs.length ? Math.min(...durs) : null
  const wsum = w.price + w.duration + w.stops + w.connections + w.schedule + w.carriers || 1

  const scored = items.map(({ offer, ev }) => {
    const amt = comparableAmount(ev, true)
    const dur = ev.cost.doorToDoorMinutes ?? ev.totalDurationMin
    const lastSeg = offer.slices[0]
    const arrHHMM = lastSeg?.arriveLocal?.slice(11, 16) ?? null
    const depHHMM = lastSeg?.departLocal.slice(11, 16) ?? null
    let schedule = 0.6
    if (p.arrivalWindow && arrHHMM) schedule = inWindow(arrHHMM, p.arrivalWindow) ? 1 : 0.3
    if (p.preferNightFlights && depHHMM) schedule = (schedule + (depHHMM >= '19:00' || depHHMM <= '02:00' ? 1 : 0.3)) / 2
    const parts: Record<string, number> = {
      price: amt != null && minAmount ? minAmount / amt : 0.3,
      duration: dur != null && minDur ? minDur / dur : 0.4,
      stops: 1 / (1 + ev.stops),
      connections: connectionComfort(ev.connections, p.connectionStyle) * (p.avoidSeparateTickets && offer.selfTransfer ? 0.4 : 1),
      schedule,
      carriers: p.preferredCarriers.length ? (ev.carriers.some((c) => p.preferredCarriers.includes(c)) ? 1 : 0.4) : 0.7
    }
    // incerteza custa um pouco: preço de cache e custo total desconhecido
    const uncertainty = (offer.verification === 'cached' ? 0.03 : 0) + (ev.cost.totalStatus === 'unknown' ? 0.03 : 0)
    const raw = (w.price * parts.price + w.duration * parts.duration + w.stops * parts.stops + w.connections * parts.connections + w.schedule * parts.schedule + w.carriers * parts.carriers) / wsum
    const score = Math.round(Math.max(0, raw - uncertainty) * 1000) / 10
    const highlights: string[] = []
    for (const cn of ev.connections) if (cn.stopover) highlights.push(`Stopover ${Math.round((cn.minutes ?? 0) / 60)}h em ${cn.airport} (verifique regras de entrada/trânsito)`)
    if (ev.cost.ground.status !== 'none' && ev.cost.ground.label) highlights.push(`Chega por ${offer.slices[0]?.to} + terrestre até ${ev.cost.ground.label}`)
    return { offer, ev, score, parts, highlights }
  })
  // "menor tarifa"/"mais rápido" só entre opções que podem ser escolhidas (não excluídas)
  const pool = scored.filter((s) => s.ev.status !== 'excluded')
  const cheapest = Math.min(...pool.map((s) => comparableAmount(s.ev, false) ?? Infinity))
  const fastest = Math.min(...pool.map((s) => s.ev.totalDurationMin ?? Infinity))
  for (const s of pool) {
    if (isFinite(cheapest) && comparableAmount(s.ev, false) === cheapest) s.highlights.unshift('Menor tarifa')
    if (isFinite(fastest) && s.ev.totalDurationMin === fastest) s.highlights.unshift('Mais rápido')
  }
  return scored
}

export function sortScored(list: Scored[], strategy: SortStrategy | 'depart' | 'recent'): Scored[] {
  const big = Number.MAX_SAFE_INTEGER
  const fare = (s: Scored): number => s.ev.cost.fareInCurrency?.amountMinor ?? big
  const total = (s: Scored): number => s.ev.cost.total?.amountMinor ?? fare(s)
  const key: Record<string, (s: Scored) => number> = {
    price: fare,
    total_cost: total,
    duration: (s) => s.ev.totalDurationMin ?? big,
    door_to_door: (s) => s.ev.cost.doorToDoorMinutes ?? big,
    stops: (s) => s.ev.stops * 1e12 + fare(s),
    value: (s) => -s.score,
    depart: (s) => Date.parse(`${s.offer.slices[0]?.departLocal ?? '9999'}:00Z`) || big,
    recent: (s) => -Date.parse(s.offer.observedAt)
  }
  const k = key[strategy] ?? key.value
  return [...list].sort((a, b) => k(a) - k(b) || fare(a) - fare(b) || a.offer.price.amountMinor - b.offer.price.amountMinor)
}

// ── Diversificação ────────────────────────────────────────────────────────────

/**
 * Reordena para que o topo não seja "30 variações da mesma rota": escolha gulosa que
 * penaliza repetir origem, país, destino, data, companhia, nº de conexões e faixa de duração.
 * Só muda a ordem (o banco guarda tudo); depois de `limit` posições, segue a ordem original.
 */
export function diversify(sorted: Scored[], limit: number): Scored[] {
  if (sorted.length <= 2) return sorted
  const n = sorted.length
  const pool = sorted.map((s, i) => ({ s, i }))
  const picked: Scored[] = []
  const counts = new Map<string, number>()
  const attrs = (s: Scored): [string, number][] => {
    const f = s.offer.slices[0]
    const dur = s.ev.totalDurationMin
    return [
      [`o:${f?.from}`, 0.25],
      [`oc:${airportCountry(f?.from ?? '')}`, 0.2],
      [`d:${f?.to}`, 0.1],
      [`dt:${f?.departLocal.slice(0, 10)}`, 0.05],
      [`c:${s.ev.carriers[0] ?? '?'}`, 0.06],
      [`st:${s.ev.stops}`, 0.04],
      [`du:${dur == null ? '?' : Math.round(dur / 240)}`, 0.03]
    ]
  }
  const target = Math.min(limit, n)
  while (picked.length < target && pool.length) {
    let best = 0
    let bestVal = -Infinity
    const windowSize = Math.min(pool.length, target * 4)
    // vantagem de posição relativa à janela: em listas longas, vizinhos quase empatam e a diversidade decide
    const span = Math.max(n, target * 4)
    for (let j = 0; j < windowSize; j++) {
      const { s, i } = pool[j]
      const base = 1 - i / span
      const penalty = attrs(s).reduce((t, [k, wgt]) => t + wgt * (counts.get(k) ?? 0), 0)
      const val = base - penalty
      if (val > bestVal) {
        bestVal = val
        best = j
      }
    }
    const [{ s }] = pool.splice(best, 1)
    picked.push(s)
    for (const [k] of attrs(s)) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...picked, ...pool.map((x) => x.s)]
}

/** Meta de exibição pela amplitude da pesquisa (10 a 30), mais o que o usuário pediu a mais. */
export function displayTargetFor(originCountries: number, destAirports: number, dateSpanDays: number, configured: number, extra: number): number {
  if (configured > 0) return configured + extra
  let t = 10
  t += Math.min(12, Math.max(0, originCountries - 1) * 3)
  t += destAirports > 2 ? 3 : 0
  t += dateSpanDays > 10 ? 5 : 0
  return Math.min(30, t) + extra
}

// ── Deduplicação ──────────────────────────────────────────────────────────────

/**
 * Identidade de itinerário independente de provedor e preço: por perna, origem→destino,
 * minuto de partida, primeiro voo e nº de conexões. Duas fontes que acham o mesmo voo
 * caem na mesma oferta (o histórico guarda cada observação com sua fonte).
 */
export function fingerprint(offer: NormalizedOffer, paxKey: string): string {
  const legs = offer.slices.map((s) => {
    const first = s.segments[0]
    const flight = first ? `${first.marketingCarrier ?? ''}${first.flightNumber ?? ''}` : `${s.carriers[0] ?? ''}${s.firstFlightNumber ?? ''}`
    const stops = Math.max(s.stops, s.segments.length - 1)
    return `${s.from}>${s.to}@${s.departLocal.slice(0, 16)}#${flight}/${stops}`
  })
  return `${paxKey}|${legs.join('|')}`
}

/** Hierarquia de confiança ao mesclar observações do mesmo itinerário. */
export const VERIFICATION_RANK: Record<string, number> = { live: 4, assisted: 3, imported: 2, cached: 1 }

/** Converte Money via tabela "1 unidade da moeda = X na base" (Configurações → Finanças). Sem taxa → null. */
export function makeFx(base: string, rates: Record<string, number>): Fx {
  const toBase = (cur: string): number | null => (cur === base ? 1 : rates[cur] ?? null)
  return (m, to) => {
    if (m.currency === to) return m
    const a = toBase(m.currency)
    const b = toBase(to)
    if (a == null || b == null || b === 0) return null
    const major = (fromMinor(m.amountMinor, m.currency) * a) / b
    const digits = minorDigits(to)
    return { amountMinor: Math.round(major * 10 ** digits), currency: to }
  }
}
