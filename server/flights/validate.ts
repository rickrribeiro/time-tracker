import type { DateWindow, GroundOption, LocationRef, LocationSet, MonitorConfig, Money, Need } from '../../shared/flights'
import { defaultMonitorConfig, DEFAULT_WEIGHTS } from '../../shared/flights'
import { isIsoDate, validateDates } from './dates'
import { getAirport, resolveRef } from './geo'

/**
 * "Schema" da configuração do monitor: tudo que entra (cliente, IA, banco antigo) passa por
 * `normalizeConfig`, que preenche padrões, corta valores absurdos e descarta códigos que não
 * existem na base. `configErrors` diz o que falta para o monitor poder buscar.
 */
type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const int = (v: unknown, d: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : d
}
const intOrNull = (v: unknown, min: number, max: number): number | null => (v == null || v === '' ? null : int(v, min, min, max))
const bool = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d)
const need = (v: unknown, d: Need = 'any'): Need => (v === 'required' || v === 'preferred' || v === 'any' ? v : d)
const codes = (v: unknown, len: number): string[] => [...new Set(arr(v).map((x) => str(x).trim().toUpperCase()).filter((x) => x.length === len && /^[A-Z0-9]+$/.test(x)))]
const currency = (v: unknown, d: string): string => {
  const c = str(v).trim().toUpperCase()
  return /^[A-Z]{3}$/.test(c) ? c : d
}

function money(v: unknown): Money | null {
  if (!isObj(v)) return null
  const amountMinor = int(v.amountMinor, -1, -1, 1e12)
  if (amountMinor <= 0) return null
  return { amountMinor, currency: currency(v.currency, 'BRL') }
}

export function normalizeLocationSet(v: unknown): { set: LocationSet; dropped: string[] } {
  const dropped: string[] = []
  const include: LocationRef[] = []
  const seen = new Set<string>()
  const o = isObj(v) ? v : {}
  for (const r of arr(o.include)) {
    if (!isObj(r)) continue
    const ref = resolveRef({ kind: str(r.kind), code: str(r.code), label: str(r.label) })
    if (!ref) {
      dropped.push(`${str(r.kind)}:${str(r.code)}`)
      continue
    }
    const k = `${ref.kind}:${ref.code}`
    if (seen.has(k)) continue
    seen.add(k)
    include.push(ref)
  }
  const exclude = codes(o.exclude, 3).filter((c) => !!getAirport(c))
  return { set: { include, exclude, includeSmall: bool(o.includeSmall) }, dropped }
}

function windows(v: unknown): DateWindow[] {
  const out: DateWindow[] = []
  for (const w of arr(v).slice(0, 6)) {
    if (!isObj(w)) continue
    const mode = str(w.mode)
    if (mode === 'exact' && isIsoDate(w.date)) out.push({ mode, date: w.date })
    else if (mode === 'flex' && isIsoDate(w.date)) out.push({ mode, date: w.date, flexDays: int(w.flexDays, 3, 0, 15) })
    else if (mode === 'range' && isIsoDate(w.from) && isIsoDate(w.to)) out.push({ mode, from: w.from, to: w.to })
    else if (mode === 'month' && /^\d{4}-\d{2}$/.test(str(w.month))) out.push({ mode, month: str(w.month) })
  }
  return out
}

function ground(v: unknown, cur: string): GroundOption[] {
  const out: GroundOption[] = []
  for (const g of arr(v).slice(0, 30)) {
    if (!isObj(g) || !getAirport(str(g.airport))) continue
    const src = str(g.source)
    out.push({
      airport: str(g.airport).toUpperCase(),
      toLabel: str(g.toLabel).slice(0, 80),
      minutes: intOrNull(g.minutes, 0, 72 * 60),
      costMinor: intOrNull(g.costMinor, 0, 1e9),
      currency: currency(g.currency, cur),
      source: src === 'osrm' || src === 'straight' ? src : 'manual'
    })
  }
  return out
}

export function normalizeConfig(raw: unknown, dropped: string[] = []): MonitorConfig {
  const d = defaultMonitorConfig()
  const r = isObj(raw) ? raw : {}
  const origins = normalizeLocationSet(r.origins)
  const destinations = normalizeLocationSet(r.destinations)
  dropped.push(...origins.dropped, ...destinations.dropped)
  const dates = isObj(r.dates) ? r.dates : {}
  const pax = isObj(r.passengers) ? r.passengers : {}
  const bag = isObj(r.baggage) ? r.baggage : {}
  const c = isObj(r.constraints) ? r.constraints : {}
  const p = isObj(r.preferences) ? r.preferences : {}
  const w = isObj(p.weights) ? p.weights : {}
  const b = isObj(r.budget) ? r.budget : {}
  const s = isObj(r.schedule) ? r.schedule : {}
  const a = isObj(r.alerts) ? r.alerts : {}
  const cur = currency(r.currency, d.currency)
  const cabin = str(pax.cabin)
  const strategy = str(p.strategy)
  const style = str(p.connectionStyle)
  const mode = str(s.mode)
  const aw = isObj(p.arrivalWindow) && /^\d{2}:\d{2}$/.test(str(p.arrivalWindow.from)) && /^\d{2}:\d{2}$/.test(str(p.arrivalWindow.to))
    ? { from: str(p.arrivalWindow.from), to: str(p.arrivalWindow.to) }
    : null
  const adults = int(pax.adults, 1, 1, 9)
  return {
    version: 1,
    origins: origins.set,
    destinations: destinations.set,
    dates: {
      tripType: dates.tripType === 'roundtrip' ? 'roundtrip' : 'oneway',
      windows: windows(dates.windows),
      returnWindows: windows(dates.returnWindows),
      minStayDays: intOrNull(dates.minStayDays, 0, 365),
      maxStayDays: intOrNull(dates.maxStayDays, 0, 365)
    },
    passengers: {
      adults,
      children: int(pax.children, 0, 0, 8),
      infants: int(pax.infants, 0, 0, adults),
      cabin: cabin === 'premium_economy' || cabin === 'business' || cabin === 'first' ? cabin : 'economy'
    },
    baggage: { carryOn: need(bag.carryOn), checked: need(bag.checked), checkedCount: int(bag.checkedCount, 1, 1, 4), refundable: need(bag.refundable) },
    constraints: {
      maxStops: intOrNull(c.maxStops, 0, 4),
      maxTotalDurationHours: intOrNull(c.maxTotalDurationHours, 1, 96),
      forbiddenConnectionCountries: codes(c.forbiddenConnectionCountries, 2),
      forbiddenConnectionAirports: codes(c.forbiddenConnectionAirports, 3),
      forbiddenCarriers: codes(c.forbiddenCarriers, 2),
      forbidSelfTransfer: bool(c.forbidSelfTransfer),
      forbidAirportChange: bool(c.forbidAirportChange),
      forbidOvernightConnections: bool(c.forbidOvernightConnections),
      minConnectionMinutes: intOrNull(c.minConnectionMinutes, 0, 24 * 60),
      maxConnectionMinutes: intOrNull(c.maxConnectionMinutes, 30, 72 * 60),
      maxPrice: money(c.maxPrice)
    },
    preferences: {
      strategy: ['value', 'price', 'total_cost', 'duration', 'door_to_door', 'stops'].includes(strategy) ? (strategy as MonitorConfig['preferences']['strategy']) : 'value',
      weights: {
        price: int(w.price, DEFAULT_WEIGHTS.price, 0, 10),
        duration: int(w.duration, DEFAULT_WEIGHTS.duration, 0, 10),
        stops: int(w.stops, DEFAULT_WEIGHTS.stops, 0, 10),
        connections: int(w.connections, DEFAULT_WEIGHTS.connections, 0, 10),
        schedule: int(w.schedule, DEFAULT_WEIGHTS.schedule, 0, 10),
        carriers: int(w.carriers, DEFAULT_WEIGHTS.carriers, 0, 10)
      },
      preferredCarriers: codes(p.preferredCarriers, 2),
      arrivalWindow: aw,
      preferNightFlights: bool(p.preferNightFlights),
      connectionStyle: style === 'short' || style === 'long_ok' || style === 'any' ? style : 'comfortable',
      stopoverMaxHours: intOrNull(p.stopoverMaxHours, 6, 96),
      avoidAirportChange: bool(p.avoidAirportChange, true),
      avoidSeparateTickets: bool(p.avoidSeparateTickets, true)
    },
    ground: ground(r.ground, cur),
    currency: cur,
    providers: arr(r.providers).map((x) => str(x)).filter(Boolean).slice(0, 10),
    budget: {
      maxQueriesPerRun: int(b.maxQueriesPerRun, d.budget.maxQueriesPerRun, 1, 500),
      maxQueriesPerDay: int(b.maxQueriesPerDay, d.budget.maxQueriesPerDay, 1, 2000),
      maxAiCallsPerRun: int(b.maxAiCallsPerRun, d.budget.maxAiCallsPerRun, 0, 10),
      maxTokensPerRun: intOrNull(b.maxTokensPerRun, 1000, 5_000_000),
      maxRunMinutes: int(b.maxRunMinutes, d.budget.maxRunMinutes, 1, 120)
    },
    schedule: {
      mode: mode === 'daily' || mode === 'hours' || mode === 'adaptive' ? mode : 'manual',
      everyHours: int(s.everyHours, 12, 3, 168),
      hour: int(s.hour, 8, 0, 23)
    },
    alerts: {
      priceBelow: money(a.priceBelow),
      dropPercent: intOrNull(a.dropPercent, 1, 90),
      newLow: bool(a.newLow, true),
      interesting: bool(a.interesting),
      favoriteChanges: bool(a.favoriteChanges, true),
      promoPosts: bool(a.promoPosts, true)
    },
    displayTarget: int(r.displayTarget, 0, 0, 100),
    notes: str(r.notes).slice(0, 2000)
  }
}

/** O que impede o monitor de buscar (vazio = pronto). */
export function configErrors(cfg: MonitorConfig, today: string): string[] {
  const errs: string[] = []
  if (!cfg.origins.include.length) errs.push('Escolha ao menos uma origem.')
  if (!cfg.destinations.include.length) errs.push('Escolha ao menos um destino.')
  errs.push(...validateDates(cfg.dates, today))
  return errs
}
