import type {
  CalendarDay,
  EligibilityStatus,
  FlightMonitor,
  HistoryPoint,
  HistoryView,
  MonitorSummary,
  NormalizedOffer,
  OfferPage,
  OfferQuery,
  OfferView,
  PlanView,
  TaskStage,
  TaskStatus
} from '../../shared/flights'
import { getSetting } from '../database/queries'
import { diffDays, expandWindows, summarizeDates, todayLocal } from './dates'
import { diversify, displayTargetFor, evaluateOffer, Fx, makeFx, scoreAll, Scored, sortScored, withDurations } from './evaluate'
import { airportCountry, summarizeSet } from './geo'
import { searchLinks } from './links'
import { buildUniverse, coverageOf, paxKey } from './planner'
import * as repo from './repo'
import { configErrors } from './validate'

export async function loadFx(): Promise<Fx> {
  const base = (await getSetting('finance_base')) || 'BRL'
  let rates: Record<string, number> = {}
  try {
    rates = JSON.parse((await getSetting('finance_rates')) || '{}')
  } catch {
    rates = {}
  }
  return makeFx(base, rates)
}

/** Ofertas guardadas → avaliadas (restrições/custo) → pontuadas. Tudo determinístico, em código. */
export async function scoredOffers(m: FlightMonitor, fx?: Fx): Promise<{ scored: Scored[]; rows: Map<NormalizedOffer, repo.OfferRow> }> {
  const f = fx ?? (await loadFx())
  const today = todayLocal()
  const rows = await repo.listOffers(m.id)
  const map = new Map<NormalizedOffer, repo.OfferRow>()
  const items = rows.map((r) => {
    const offer = JSON.parse(r.data) as NormalizedOffer
    map.set(offer, r)
    return { offer, ev: evaluateOffer(offer, m.config, f, today) }
  })
  return { scored: scoreAll(items, m.config), rows: map }
}

function toView(s: Scored, r: repo.OfferRow, m: FlightMonitor): OfferView {
  const o = withDurations(s.offer)
  const s0 = o.slices[0]
  const s1 = o.slices[1]
  const staleHours = o.verification === 'live' ? 12 : 72
  return {
    ...o,
    id: r.id,
    monitorId: r.monitorId,
    fingerprint: r.fingerprint,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    available: !!r.available,
    favorite: !!r.favorite,
    previousPrice: r.prevPriceMinor != null && r.prevCurrency ? { amountMinor: r.prevPriceMinor, currency: r.prevCurrency } : null,
    origin: s0.from,
    destination: s0.to,
    originCountry: airportCountry(s0.from) ?? '',
    destinationCountry: airportCountry(s0.to) ?? '',
    departDate: s0.departLocal.slice(0, 10),
    returnDate: s1 ? s1.departLocal.slice(0, 10) : null,
    totalDurationMin: s.ev.totalDurationMin,
    stops: s.ev.stops,
    carriers: s.ev.carriers,
    connections: s.ev.connections,
    status: r.available ? s.ev.status : 'excluded',
    checks: r.available ? s.ev.checks : [{ code: 'gone', level: 'fail', message: 'A oferta não apareceu mais na última consulta à fonte.' }, ...s.ev.checks],
    cost: s.ev.cost,
    score: s.score,
    scoreParts: s.parts,
    highlights: s.highlights,
    stale: Date.now() - Date.parse(r.lastSeenAt) > staleHours * 3600_000,
    searchLinks: searchLinks(s0.from, s0.to, s0.departLocal.slice(0, 10), s1 ? s1.departLocal.slice(0, 10) : null, m.config.currency, m.config.passengers.adults),
    sources: JSON.parse(r.sources || '[]')
  }
}

export function displayTarget(m: FlightMonitor): number {
  const u = buildUniverse(m.config, todayLocal())
  const countries = new Set(u.origins.map((a) => a.country)).size
  const span = u.departDates.length ? diffDays(u.departDates[0], u.departDates[u.departDates.length - 1]) + 1 : 0
  return displayTargetFor(countries, u.destinations.length, span, m.config.displayTarget, m.extraDisplay)
}

export async function queryOffers(m: FlightMonitor, q: OfferQuery): Promise<OfferPage> {
  const { scored, rows } = await scoredOffers(m)
  const views = scored.map((s) => ({ s, v: toView(s, rows.get(s.offer)!, m) }))
  const counts: Record<EligibilityStatus, number> = { eligible: 0, pending: 0, excluded: 0 }
  for (const { v } of views) counts[v.status]++
  const status = q.status ?? 'eligible'
  const text = (q.search ?? '').trim().toUpperCase()
  const filtered = views.filter(({ v }) => {
    if (status !== 'all' && v.status !== status) return false
    if (!q.includeUnavailable && !v.available && status !== 'excluded' && status !== 'all') return false
    if (q.favoritesOnly && !v.favorite) return false
    if (q.origins?.length && !q.origins.includes(v.origin)) return false
    if (q.destinations?.length && !q.destinations.includes(v.destination)) return false
    if (q.maxStops != null && v.stops > q.maxStops) return false
    if (q.carriers?.length && !v.carriers.some((c) => q.carriers!.includes(c))) return false
    if (q.providers?.length && !v.sources.some((p) => q.providers!.includes(p))) return false
    if (q.verification?.length && !q.verification.includes(v.verification)) return false
    if (text) {
      const hay = [v.origin, v.destination, ...v.carriers, ...v.connections.map((c) => c.airport), v.departDate, v.sourceLabel].join(' ').toUpperCase()
      if (!hay.includes(text)) return false
    }
    return true
  })
  const target = displayTarget(m)
  const sort = q.sort ?? m.config.preferences.strategy
  let ordered = sortScored(filtered.map((x) => x.s), sort)
  if (q.diversify !== false && (sort === 'value' || sort === m.config.preferences.strategy)) ordered = diversify(ordered, Math.max(target, 30))
  const byOffer = new Map(filtered.map((x) => [x.s, x.v]))
  const pageSize = Math.max(5, Math.min(100, q.pageSize ?? target))
  const page = Math.max(1, q.page ?? 1)
  const items = ordered.slice((page - 1) * pageSize, page * pageSize).map((s) => byOffer.get(s)!)
  const cov = await coverage(m)
  return {
    items,
    total: ordered.length,
    page,
    pageSize,
    counts,
    displayTarget: target,
    facets: {
      origins: [...new Set(views.map((x) => x.v.origin))].sort(),
      destinations: [...new Set(views.map((x) => x.v.destination))].sort(),
      carriers: [...new Set(views.flatMap((x) => x.v.carriers))].sort(),
      providers: [...new Set(views.flatMap((x) => x.v.sources))].sort()
    },
    coverageNote:
      cov.universe && cov.percent < 100
        ? `Cobertura parcial: ${cov.percent}% das combinações pesquisadas. O menor preço exibido é o menor ENCONTRADO, não necessariamente o menor existente.`
        : null
  }
}

export async function coverage(m: FlightMonitor): Promise<ReturnType<typeof coverageOf>> {
  const u = buildUniverse(m.config, todayLocal())
  return coverageOf(u, await repo.listTasks(m.id))
}

export async function summarize(m: FlightMonitor, fx: Fx): Promise<MonitorSummary> {
  const today = todayLocal()
  const [{ scored, rows }, run, cov] = await Promise.all([scoredOffers(m, fx), repo.activeRun(m.id), coverage(m)])
  const live = scored.filter((s) => rows.get(s.offer)!.available)
  const eligible = live.filter((s) => s.ev.status === 'eligible')
  const pending = live.filter((s) => s.ev.status === 'pending')
  const cheapest = (list: Scored[]): Scored | null =>
    list.reduce<Scored | null>((best, s) => (s.ev.cost.fareInCurrency && (!best || s.ev.cost.fareInCurrency.amountMinor < best.ev.cost.fareInCurrency!.amountMinor) ? s : best), null)
  const minAll = cheapest(eligible.length ? eligible : pending)
  const minVerified = cheapest(eligible.filter((s) => s.offer.verification === 'live'))
  const errs = configErrors(m.config, today)
  const state: MonitorSummary['state'] = run ? 'running' : m.status === 'paused' ? 'paused' : m.status === 'draft' || errs.length ? 'needs_config' : m.lastError ? 'error' : 'active'
  return {
    ...m,
    state,
    stateDetail: state === 'needs_config' ? errs[0] ?? 'Revise e ative o monitoramento.' : state === 'error' ? m.lastError : null,
    originSummary: summarizeSet(m.config.origins),
    destinationSummary: summarizeSet(m.config.destinations),
    dateSummary: summarizeDates(m.config.dates),
    minPrice: minAll?.ev.cost.fareInCurrency ?? null,
    minVerifiedPrice: minVerified?.ev.cost.fareInCurrency ?? null,
    eligibleCount: eligible.length,
    pendingCount: pending.length,
    offerCount: live.length,
    trend: await trend(m),
    coverage: cov,
    activeRun: run
  }
}

/** Tendência: menor preço comparável dos últimos 3 dias vs os 7 anteriores. Exige histórico. */
async function trend(m: FlightMonitor): Promise<MonitorSummary['trend']> {
  const since = new Date(Date.now() - 10 * 86400_000).toISOString()
  const pk = paxKey(m.config)
  const obs = (await repo.listObservations(m.id, since)).filter((o) => o.paxKey === pk && o.currency === m.config.currency)
  const cut = Date.now() - 3 * 86400_000
  const recent = obs.filter((o) => Date.parse(o.observedAt) >= cut)
  const before = obs.filter((o) => Date.parse(o.observedAt) < cut)
  if (recent.length < 3 || before.length < 3) return null
  const a = Math.min(...before.map((o) => o.priceMinor))
  const b = Math.min(...recent.map((o) => o.priceMinor))
  const delta = Math.round(((b - a) / a) * 1000) / 10
  return { direction: Math.abs(delta) < 2 ? 'flat' : delta < 0 ? 'down' : 'up', deltaPercent: delta }
}

export async function calendar(m: FlightMonitor): Promise<CalendarDay[]> {
  const today = todayLocal()
  const dates = expandWindows(m.config.dates.windows, today)
  const [{ scored, rows }, tasks] = await Promise.all([scoredOffers(m), repo.listTasks(m.id)])
  const days: CalendarDay[] = dates.map((date) => {
    const offers = scored.filter((s) => s.ev.status !== 'excluded' && rows.get(s.offer)!.available && s.offer.slices[0].departLocal.startsWith(date))
    const min = offers.reduce<number | null>((b, s) => (s.ev.cost.fareInCurrency ? Math.min(b ?? Infinity, s.ev.cost.fareInCurrency.amountMinor) : b), null)
    const relevant = tasks.filter((t) => (t.departDate.length === 7 ? date.startsWith(t.departDate) : t.departDate === date))
    const cov: CalendarDay['coverage'] = relevant.some((t) => t.status === 'done') ? 'searched' : relevant.some((t) => t.status === 'failed') ? 'failed' : 'none'
    return { date, minPrice: min != null ? { amountMinor: min, currency: m.config.currency } : null, coverage: cov, offers: offers.length }
  })
  return days
}

/**
 * Histórico: menor preço diário por grupo, SÓ entre observações comparáveis (mesma
 * configuração de passageiros/cabine e mesma moeda — não mistura tarifas diferentes).
 */
export async function history(m: FlightMonitor, days = 60): Promise<HistoryView> {
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const pk = paxKey(m.config)
  const [obsAll, offers] = await Promise.all([repo.listObservations(m.id, since), repo.listOffers(m.id)])
  const byId = new Map(offers.map((o) => [o.id, o]))
  const obs = obsAll.filter((o) => o.paxKey === pk && o.currency === m.config.currency)
  const otherCurrency = obsAll.length - obs.length
  const reduce = (list: repo.ObservationRow[]): HistoryPoint[] => {
    const per = new Map<string, number>()
    for (const o of list) {
      const day = todayLocal(new Date(o.observedAt)) // dia local da leitura
      per.set(day, Math.min(per.get(day) ?? Infinity, o.priceMinor))
    }
    return [...per.entries()].sort().map(([day, minor]) => ({ day, minor }))
  }
  const group = (key: (o: repo.OfferRow) => string): Record<string, HistoryPoint[]> => {
    const g = new Map<string, repo.ObservationRow[]>()
    for (const o of obs) {
      const row = byId.get(o.offerId)
      if (!row) continue
      const k = key(row)
      g.set(k, [...(g.get(k) ?? []), o])
    }
    return Object.fromEntries([...g.entries()].map(([k, v]) => [k, reduce(v)]))
  }
  const changes = offers
    .filter((o) => o.prevPriceMinor != null && o.prevCurrency === o.currency)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 20)
    .map((o) => ({
      offerId: o.id,
      label: `${o.origin}→${o.destination} ${o.departDate}`,
      from: { amountMinor: o.prevPriceMinor!, currency: o.currency },
      to: { amountMinor: o.priceMinor, currency: o.currency },
      at: o.lastSeenAt
    }))
  return {
    currency: m.config.currency,
    overall: reduce(obs),
    byOrigin: group((o) => o.origin),
    byDestination: group((o) => o.destination),
    changes,
    note: otherCurrency
      ? `${otherCurrency} observação(ões) em outra moeda/configuração de passageiros ficaram fora dos gráficos para não misturar tarifas.`
      : obs.length < 2
        ? 'Histórico ainda curto: o gráfico ganha sentido depois de algumas buscas em dias diferentes.'
        : null
  }
}

export async function plan(m: FlightMonitor): Promise<PlanView> {
  const u = buildUniverse(m.config, todayLocal())
  const [tasks, runs] = await Promise.all([repo.listTasks(m.id), repo.listRuns(m.id)])
  const statuses: TaskStatus[] = ['pending', 'running', 'done', 'failed', 'skipped']
  const empty = (): Record<TaskStatus, number> => Object.fromEntries(statuses.map((s) => [s, 0])) as Record<TaskStatus, number>
  const byStage: Record<TaskStage, Record<TaskStatus, number>> = { discovery: empty(), deepen: empty(), validate: empty() }
  const byProvider: Record<string, Record<TaskStatus, number>> = {}
  for (const t of tasks) {
    byStage[t.stage][t.status]++
    byProvider[t.provider] = byProvider[t.provider] ?? empty()
    byProvider[t.provider][t.status]++
  }
  return {
    coverage: coverageOf(u, tasks),
    byStage,
    byProvider,
    tasks: tasks.slice(0, 400).map((t) => ({
      id: t.id,
      provider: t.provider,
      stage: t.stage,
      origin: t.origin,
      destination: t.destination,
      departDate: t.departDate,
      returnDate: t.returnDate,
      status: t.status,
      attempts: t.attempts,
      resultCount: t.resultCount,
      minPrice: t.minPriceMinor != null && t.currency ? { amountMinor: t.minPriceMinor, currency: t.currency } : null,
      lastError: t.lastError,
      finishedAt: t.finishedAt,
      priority: t.priority
    })),
    runs,
    airports: { origins: u.origins.map((a) => a.iata), destinations: u.destinations.map((a) => a.iata) },
    warnings: u.warnings
  }
}
