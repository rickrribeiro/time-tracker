import type { AirportInfo, Coverage, MonitorConfig, ProviderCapabilities, TaskStage, TaskStatus } from '../../shared/flights'
import { DatePair, datePairs, diffDays, monthsOf, sampleDates } from './dates'
import { airportWeight, expandSet, haversineKm } from './geo'

/**
 * Planejador: transforma "6 países × 2 destinos × 16 dias" em consultas priorizadas e
 * deduplicadas, em três estágios. Puro (sem banco/rede) para ser testável.
 *
 *  descoberta    — barato e amplo: 1 consulta por par de aeroportos e MÊS quando o
 *                  provedor tem calendário em cache; senão poucas datas espaçadas.
 *  aprofundamento — só os pares mais promissores, data a data, priorizando datas baratas.
 *  validação     — revalida ao vivo as melhores ofertas vindas de cache.
 *
 * A chave da tarefa NÃO inclui o estágio para provedores de data exata: a mesma consulta
 * nunca é feita duas vezes (aprofundar e validar compartilham a chave).
 */

export const MAX_AIRPORTS_PER_SIDE = 40
/** Pares a menos disso são o mesmo lugar para fins práticos. */
const MIN_PAIR_KM = 120

export interface ProviderLite {
  id: string
  capabilities: ProviderCapabilities
}

export interface Universe {
  origins: AirportInfo[]
  destinations: AirportInfo[]
  pairs: { o: AirportInfo; d: AirportInfo; weight: number }[]
  dates: DatePair[]
  departDates: string[]
  size: number
  warnings: string[]
}

export interface TaskSpec {
  key: string
  provider: string
  stage: TaskStage
  origin: string
  destination: string
  /** 'YYYY-MM-DD' ou 'YYYY-MM' (consulta de mês). */
  departDate: string
  returnDate: string | null
  priority: number
}

export interface TaskLite {
  key: string
  provider: string
  origin: string
  destination: string
  departDate: string
  returnDate: string | null
  status: TaskStatus
  finishedAt: string | null
  minPriceMinor: number | null
}

const sizeWeight = (a: AirportInfo): number => airportWeight(a)

/** Corte justo: rodízio entre países (cada um já ordenado por relevância), para não perder hubs. */
export function capFair(list: AirportInfo[], max: number): AirportInfo[] {
  const by = new Map<string, AirportInfo[]>()
  for (const a of list) by.set(a.country, [...(by.get(a.country) ?? []), a])
  const queues = [...by.values()]
  const out: AirportInfo[] = []
  while (out.length < max && queues.some((q) => q.length)) for (const q of queues) if (q.length && out.length < max) out.push(q.shift()!)
  return out
}

export function paxKey(cfg: MonitorConfig): string {
  const p = cfg.passengers
  return `${cfg.dates.tripType === 'roundtrip' ? 'rt' : 'ow'}.${p.adults}a${p.children}c${p.infants}i.${p.cabin}`
}

export function buildUniverse(cfg: MonitorConfig, today: string): Universe {
  const warnings: string[] = []
  let origins = expandSet(cfg.origins)
  let destinations = expandSet(cfg.destinations)
  if (origins.length > MAX_AIRPORTS_PER_SIDE) {
    warnings.push(`Origens limitadas aos ${MAX_AIRPORTS_PER_SIDE} aeroportos mais relevantes (de ${origins.length}), distribuídos entre os países. Selecione aeroportos para refinar.`)
    origins = capFair(origins, MAX_AIRPORTS_PER_SIDE)
  }
  if (destinations.length > MAX_AIRPORTS_PER_SIDE) {
    warnings.push(`Destinos limitados aos ${MAX_AIRPORTS_PER_SIDE} aeroportos mais relevantes (de ${destinations.length}).`)
    destinations = capFair(destinations, MAX_AIRPORTS_PER_SIDE)
  }
  const pairs: Universe['pairs'] = []
  for (const o of origins)
    for (const d of destinations) {
      if (o.iata === d.iata || haversineKm(o, d) < MIN_PAIR_KM) continue
      pairs.push({ o, d, weight: sizeWeight(o) + sizeWeight(d) })
    }
  const dates = datePairs(cfg.dates, today)
  const departDates = [...new Set(dates.map((p) => p.depart))]
  if (!origins.length) warnings.push('Nenhum aeroporto de origem válido.')
  if (!destinations.length) warnings.push('Nenhum aeroporto de destino válido.')
  if (!dates.length) warnings.push('Nenhuma data futura válida.')
  return { origins, destinations, pairs, dates, departDates, size: pairs.length * dates.length, warnings }
}

/**
 * Ordena pares intercalando países de origem (round-robin), para que mesmo uma
 * cobertura parcial já tenha diversidade geográfica.
 */
export function interleavePairs(pairs: Universe['pairs']): Universe['pairs'] {
  const byCountry = new Map<string, Universe['pairs']>()
  for (const p of [...pairs].sort((a, b) => b.weight - a.weight || a.o.iata.localeCompare(b.o.iata) || a.d.iata.localeCompare(b.d.iata))) {
    const list = byCountry.get(p.o.country) ?? []
    list.push(p)
    byCountry.set(p.o.country, list)
  }
  const out: Universe['pairs'] = []
  const queues = [...byCountry.values()]
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!)
  return out
}

function exactKey(provider: string, o: string, d: string, dep: string, ret: string | null, pk: string): string {
  return `${provider}|${o}|${d}|${dep}|${ret ?? '-'}|${pk}`
}

export function planDiscovery(u: Universe, providers: ProviderLite[], pk: string, roundTrip: boolean): TaskSpec[] {
  const out: TaskSpec[] = []
  const ordered = interleavePairs(u.pairs)
  const monthP = providers.find((p) => p.capabilities.monthRange && p.capabilities.automated)
  const exactP = providers.find((p) => !p.capabilities.monthRange && p.capabilities.automated)
  if (monthP) {
    // ida e volta: combina mês da ida com mês da volta efetivamente usados
    const monthPairs = new Set(u.dates.map((dp) => `${dp.depart.slice(0, 7)}|${dp.ret ? dp.ret.slice(0, 7) : '-'}`))
    ordered.forEach((p, i) => {
      for (const mp of monthPairs) {
        const [m, r] = mp.split('|')
        out.push({
          key: `${monthP.id}|M|${p.o.iata}|${p.d.iata}|${m}|${r}|${pk}`,
          provider: monthP.id,
          stage: 'discovery',
          origin: p.o.iata,
          destination: p.d.iata,
          departDate: m,
          returnDate: roundTrip && r !== '-' ? r : null,
          priority: 1000 - i
        })
      }
    })
    return out
  }
  if (exactP) {
    const sample = sampleDates(u.departDates, 3)
    ordered.forEach((p, i) => {
      sample.forEach((dep, j) => {
        const ret = u.dates.find((x) => x.depart === dep)?.ret ?? null
        out.push({
          key: exactKey(exactP.id, p.o.iata, p.d.iata, dep, ret, pk),
          provider: exactP.id,
          stage: 'discovery',
          origin: p.o.iata,
          destination: p.d.iata,
          departDate: dep,
          returnDate: ret,
          priority: 1000 - i - j * 0.1
        })
      })
    })
  }
  return out
}

/**
 * Aprofundamento: pares com melhor preço na descoberta, data a data.
 * `datePrices` = menor preço conhecido por "O|D" → data → centavos (das ofertas já obtidas).
 */
export function planDeepen(
  u: Universe,
  providers: ProviderLite[],
  pk: string,
  pairMin: Map<string, number>,
  datePrices: Map<string, Map<string, number>>,
  maxPairs: number
): TaskSpec[] {
  const exactP = providers.find((p) => p.capabilities.automated && p.capabilities.livePrices) ?? providers.find((p) => p.capabilities.automated)
  if (!exactP) return []
  const ranked = u.pairs
    .filter((p) => pairMin.has(`${p.o.iata}|${p.d.iata}`))
    .sort((a, b) => pairMin.get(`${a.o.iata}|${a.d.iata}`)! - pairMin.get(`${b.o.iata}|${b.d.iata}`)!)
    .slice(0, maxPairs)
  const out: TaskSpec[] = []
  ranked.forEach((p, i) => {
    const prices = datePrices.get(`${p.o.iata}|${p.d.iata}`) ?? new Map<string, number>()
    const best = Math.min(...[...prices.values(), Infinity])
    // ida e volta: no máx. 3 voltas por ida para não explodir
    const perDepart = new Map<string, DatePair[]>()
    for (const dp of u.dates) {
      const list = perDepart.get(dp.depart) ?? []
      if (list.length < 3) list.push(dp)
      perDepart.set(dp.depart, list)
    }
    for (const [dep, list] of perDepart) {
      const known = prices.get(dep)
      // datas sem preço conhecido ficam no meio; as baratas sobem
      const dateBoost = known != null && isFinite(best) ? 50 * (best / known) : 20
      for (const dp of list) {
        out.push({
          key: exactKey(exactP.id, p.o.iata, p.d.iata, dep, dp.ret, pk),
          provider: exactP.id,
          stage: 'deepen',
          origin: p.o.iata,
          destination: p.d.iata,
          departDate: dep,
          returnDate: dp.ret,
          priority: 500 - i * 10 + dateBoost
        })
      }
    }
  })
  return out
}

/** Validação ao vivo das melhores ofertas vindas de cache/importação. */
export function planValidate(
  candidates: { origin: string; destination: string; departDate: string; returnDate: string | null }[],
  providers: ProviderLite[],
  pk: string
): TaskSpec[] {
  const live = providers.find((p) => p.capabilities.automated && p.capabilities.livePrices)
  if (!live) return []
  return candidates.map((c, i) => ({
    key: exactKey(live.id, c.origin, c.destination, c.departDate, c.returnDate, pk),
    provider: live.id,
    stage: 'validate' as const,
    origin: c.origin,
    destination: c.destination,
    departDate: c.departDate,
    returnDate: c.returnDate,
    priority: 900 - i
  }))
}

/** Remove specs cujas chaves já existem (idempotência do plano). */
export function newSpecs(specs: TaskSpec[], existing: Set<string>): TaskSpec[] {
  const seen = new Set(existing)
  return specs.filter((s) => {
    if (seen.has(s.key)) return false
    seen.add(s.key)
    return true
  })
}

/** Tarefa concluída que já envelheceu e deve ser refeita num monitoramento recorrente. */
export function isStale(t: TaskLite, now: Date, hours: number): boolean {
  return t.status === 'done' && !!t.finishedAt && now.getTime() - Date.parse(t.finishedAt) > hours * 3600_000
}

/** Cobertura real: quais (par, data) do universo já tiveram consulta bem-sucedida. */
export function coverageOf(u: Universe, tasks: TaskLite[]): Coverage {
  const pairSet = new Set(u.pairs.map((p) => `${p.o.iata}|${p.d.iata}`))
  const covered = new Set<string>()
  const doneTasks = tasks.filter((t) => t.status === 'done')
  for (const t of doneTasks) {
    const pair = `${t.origin}|${t.destination}`
    if (!pairSet.has(pair)) continue
    for (const dp of u.dates) {
      const depOk = t.departDate.length === 7 ? dp.depart.startsWith(t.departDate) : dp.depart === t.departDate
      const retOk = t.returnDate == null ? true : t.returnDate.length === 7 ? (dp.ret ?? '').startsWith(t.returnDate) : dp.ret === t.returnDate
      if (depOk && retOk) covered.add(`${pair}|${dp.depart}|${dp.ret ?? ''}`)
    }
  }
  const count = (s: TaskStatus): number => tasks.filter((t) => t.status === s).length
  return {
    universe: u.size,
    covered: covered.size,
    pending: count('pending') + count('running'),
    failed: count('failed'),
    done: doneTasks.length,
    percent: u.size ? Math.round((covered.size / u.size) * 1000) / 10 : 0
  }
}

/** Intervalo de refresh adaptativo pela proximidade da viagem (horas). */
export function adaptiveHours(firstDepart: string | null, today: string): number {
  if (!firstDepart) return 24
  const days = diffDays(today, firstDepart)
  if (days > 90) return 48
  if (days > 45) return 24
  if (days > 14) return 12
  return 6
}

export { monthsOf }
