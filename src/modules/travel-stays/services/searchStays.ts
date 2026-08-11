import { SearchInput, StayResult, ProviderStayResult } from '../types'
import { ALL_PROVIDERS } from './providers'
import { haversineKm, convertCurrency, dedupe, scoreResults, passesFilters, flexibleRanges } from '../utils'

const PROVIDER_TIMEOUT_MS = 8000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
}

export interface SearchOutput {
  results: StayResult[]
  providersOk: string[]
  providersFailed: string[]
}

/** Run all providers in parallel, normalize, dedupe, score and sort. */
export async function searchStays(
  input: SearchInput,
  fx: { base: string; rates: Record<string, number> }
): Promise<SearchOutput> {
  const settled = await Promise.allSettled(ALL_PROVIDERS.map((p) => withTimeout(p.search(input), PROVIDER_TIMEOUT_MS)))
  const providersOk: string[] = []
  const providersFailed: string[] = []
  const raw: ProviderStayResult[] = []
  settled.forEach((s, i) => {
    const name = ALL_PROVIDERS[i].name
    if (s.status === 'fulfilled') {
      providersOk.push(name)
      raw.push(...s.value)
    } else {
      providersFailed.push(name)
    }
  })

  const ref = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null
  let results: StayResult[] = raw.map((r) => {
    const pricePerNight = convertCurrency(r.pricePerNight, r.currency, input.currency, fx.base, fx.rates)
    const totalPrice = convertCurrency(r.totalPrice, r.currency, input.currency, fx.base, fx.rates)
    const distanceKm = ref && r.latitude != null && r.longitude != null ? haversineKm(ref.lat, ref.lng, r.latitude, r.longitude) : undefined
    return { ...r, pricePerNight, totalPrice, currency: input.currency, distanceKm, score: 0 }
  })

  results = results.filter((r) => passesFilters(r, input))
  results = dedupe(results, input.preferredProvider)
  results = scoreResults(results, input)
  results.sort((a, b) => b.score - a.score)
  return { results, providersOk, providersFailed }
}

export type SortMode = 'best' | 'cheapest' | 'rating' | 'closest' | 'cheapestTotal'

export function sortResults(results: StayResult[], mode: SortMode): StayResult[] {
  const arr = [...results]
  switch (mode) {
    case 'cheapest':
      return arr.sort((a, b) => a.pricePerNight - b.pricePerNight)
    case 'cheapestTotal':
      return arr.sort((a, b) => a.totalPrice - b.totalPrice)
    case 'rating':
      return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    case 'closest':
      return arr.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    default:
      return arr.sort((a, b) => b.score - a.score)
  }
}

/**
 * Flexible-date search: run the base search for each date shift, keep the single
 * best (lowest total price) representative per listing id, tagging the dates.
 */
export async function searchStaysFlexible(
  input: SearchInput,
  fx: { base: string; rates: Record<string, number> }
): Promise<SearchOutput> {
  if (!input.flexibleDays) return searchStays(input, fx)
  const ranges = flexibleRanges(input.checkIn, input.checkOut, input.flexibleDays)
  const byId = new Map<string, StayResult>()
  let providersOk: string[] = []
  const providersFailed = new Set<string>()
  for (const range of ranges) {
    const out = await searchStays({ ...input, checkIn: range.checkIn, checkOut: range.checkOut, flexibleDays: 0 }, fx)
    providersOk = out.providersOk
    out.providersFailed.forEach((p) => providersFailed.add(p))
    for (const r of out.results) {
      const tagged = { ...r, bestDates: range }
      const prev = byId.get(r.id)
      if (!prev || r.totalPrice < prev.totalPrice) byId.set(r.id, tagged)
    }
  }
  const results = scoreResults([...byId.values()], input).sort((a, b) => b.score - a.score)
  return { results, providersOk, providersFailed: [...providersFailed] }
}
