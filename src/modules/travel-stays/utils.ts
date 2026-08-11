import { ProviderStayResult, StayResult, SearchInput } from './types'

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Convert amount between currencies using finance-style rates (rate = value of 1 unit in base). */
export function convertCurrency(amount: number, from: string, to: string, base: string, rates: Record<string, number>): number {
  if (from === to) return amount
  const toBase = from === base ? amount : amount * (rates[from] ?? 1)
  return to === base ? toBase : toBase / (rates[to] ?? 1)
}

/** Rough title similarity [0..1] via token Jaccard. */
export function titleSimilarity(a: string, b: string): number {
  const norm = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
  const sa = norm(a)
  const sb = norm(b)
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  return inter / (sa.size + sb.size - inter)
}

/** Merge near-duplicate listings across providers. Keeps the best (rating, then price). */
export function dedupe(results: StayResult[], preferred?: string): StayResult[] {
  const kept: StayResult[] = []
  for (const r of results) {
    const dup = kept.find((k) => {
      const sim = titleSimilarity(k.title, r.title)
      const near =
        k.latitude != null && k.longitude != null && r.latitude != null && r.longitude != null
          ? haversineKm(k.latitude, k.longitude, r.latitude, r.longitude) < 0.1
          : false
      const priceClose = Math.abs(k.pricePerNight - r.pricePerNight) / Math.max(1, k.pricePerNight) < 0.1
      return sim > 0.85 && (near || priceClose)
    })
    if (!dup) {
      kept.push({ ...r, alsoOn: [] })
      continue
    }
    dup.alsoOn = Array.from(new Set([...(dup.alsoOn ?? []), r.provider]))
    // pick the better representative
    const better = (a: StayResult, b: StayResult): StayResult => {
      if (preferred && a.provider !== b.provider) {
        if (a.provider === preferred) return a
        if (b.provider === preferred) return b
      }
      if ((b.rating ?? 0) !== (a.rating ?? 0)) return (b.rating ?? 0) > (a.rating ?? 0) ? b : a
      return b.pricePerNight < a.pricePerNight ? b : a
    }
    const winner = better(dup, r)
    if (winner !== dup) {
      const also = dup.alsoOn
      Object.assign(dup, winner, { alsoOn: also })
    }
  }
  return kept
}

/** Generate up to 15 flexible date ranges keeping the trip length. */
export function flexibleRanges(checkIn: string, checkOut: string, flex: number): { checkIn: string; checkOut: string }[] {
  const inD = new Date(`${checkIn}T12:00:00`)
  const outD = new Date(`${checkOut}T12:00:00`)
  const nights = Math.max(1, Math.round((outD.getTime() - inD.getTime()) / 86400000))
  const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const out: { checkIn: string; checkOut: string }[] = []
  for (let d = -flex; d <= flex && out.length < 15; d++) {
    const ci = new Date(inD)
    ci.setDate(ci.getDate() + d)
    const co = new Date(ci)
    co.setDate(co.getDate() + nights)
    out.push({ checkIn: iso(ci), checkOut: iso(co) })
  }
  return out
}

/**
 * Score 0..100. Required amenities are eliminatory (filter before scoring).
 * Price 40 · Location 25 · Quality 20 · Preferred amenities 10 · Preferred provider 5.
 */
export function scoreResults(results: StayResult[], input: SearchInput): StayResult[] {
  if (!results.length) return results
  const prices = results.map((r) => r.pricePerNight)
  const minP = Math.min(...prices)
  const maxP = Math.max(...prices)
  const maxReviews = Math.max(1, ...results.map((r) => r.reviewCount ?? 0))
  return results.map((r) => {
    // price: cheapest = 40, most expensive = 0
    const price = maxP > minP ? (1 - (r.pricePerNight - minP) / (maxP - minP)) * 40 : 40
    // location: preferred neighborhood + proximity
    let loc = 0
    if (r.neighborhood && input.neighborhoods.some((n) => n.toLowerCase() === r.neighborhood?.toLowerCase())) loc += 15
    if (r.distanceKm != null && input.maxDistanceKm) loc += Math.max(0, 10 * (1 - Math.min(1, r.distanceKm / input.maxDistanceKm)))
    else loc += 5
    loc = Math.min(25, loc)
    // quality: rating (0..10 assumed) × review volume
    const ratingNorm = Math.min(1, (r.rating ?? 0) / 10)
    const reviewNorm = Math.min(1, (r.reviewCount ?? 0) / maxReviews)
    const quality = ratingNorm * 14 + reviewNorm * 6
    // preferred amenities
    const prefHit = input.preferredAmenities.filter((a) => r.amenities.includes(a)).length
    const pref = input.preferredAmenities.length ? (prefHit / input.preferredAmenities.length) * 10 : 5
    // preferred provider
    const provBonus = input.preferredProvider && r.provider === input.preferredProvider ? 5 : 0
    const score = Math.round(price + loc + quality + pref + provBonus)
    return { ...r, score: Math.max(0, Math.min(100, score)) }
  })
}

/** Apply hard filters (eliminatory). */
export function passesFilters(r: StayResult, input: SearchInput): boolean {
  if (input.excludeSharedRoom && r.roomType === 'shared_room') return false
  if (input.accommodationTypes.length && !input.accommodationTypes.includes(r.roomType)) return false
  if (input.maxPricePerNight != null && r.pricePerNight > input.maxPricePerNight) return false
  if (input.maxTotalPrice != null && r.totalPrice > input.maxTotalPrice) return false
  if (input.minRating != null && (r.rating ?? 0) < input.minRating) return false
  if (input.minReviews != null && (r.reviewCount ?? 0) < input.minReviews) return false
  if (input.maxDistanceKm != null && r.distanceKm != null && r.distanceKm > input.maxDistanceKm) return false
  if (r.neighborhood && input.excludedNeighborhoods.some((n) => n.toLowerCase() === r.neighborhood?.toLowerCase())) return false
  for (const a of input.requiredAmenities) if (!r.amenities.includes(a)) return false
  return true
}
