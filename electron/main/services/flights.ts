import {
  getSetting,
  getFlightWatches,
  getTrips,
  updateFlightWatchPrice,
  DbFlightWatch
} from '../database/queries'
import { decodeSecret } from './secrets'

// Skyscanner is accessed through RapidAPI (aggregates many sources). The host is
// configurable because different RapidAPI Skyscanner providers exist; the default
// targets `sky-scanner3.p.rapidapi.com`. Price extraction is schema-agnostic
// (deep-scans for the minimum price), so it tolerates provider differences.
const DEFAULT_HOST = 'sky-scanner3.p.rapidapi.com'

async function cfg(): Promise<{ key: string; host: string }> {
  const key = decodeSecret(await getSetting('skyscanner_rapidapi_key')) ?? ''
  const host = (await getSetting('skyscanner_rapidapi_host')) || DEFAULT_HOST
  if (!key) throw new Error('Configure a RapidAPI Key do Skyscanner em Configurações.')
  return { key, host }
}

function headers(key: string, host: string): Record<string, string> {
  return { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host }
}

function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Resolve a place (city name or IATA) to Skyscanner sky/entity ids via auto-complete. */
async function resolvePlace(query: string, key: string, host: string): Promise<{ skyId?: string; entityId: string }> {
  const res = await fetch(`https://${host}/flights/auto-complete?query=${encodeURIComponent(query)}`, {
    headers: headers(key, host)
  })
  if (!res.ok) throw new Error(`auto-complete falhou (${res.status}).`)
  const json = (await res.json()) as { data?: unknown[] }
  const first = (json.data ?? [])[0] as Record<string, unknown> | undefined
  if (!first) throw new Error(`Local não encontrado: "${query}".`)
  // entityId may live in a few places depending on the provider
  const nav = (first.navigation ?? {}) as Record<string, unknown>
  const rel = (nav.relevantFlightParams ?? {}) as Record<string, unknown>
  const entityId = (rel.entityId ?? nav.entityId ?? first.entityId) as string | undefined
  const skyId = (rel.skyId ?? first.skyId) as string | undefined
  if (!entityId) throw new Error(`Não consegui resolver o ID de "${query}".`)
  return { skyId, entityId }
}

/** Recursively find the minimum positive price in any Skyscanner-ish response. */
export function deepMinPrice(obj: unknown): number | null {
  let min = Infinity
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) {
      o.forEach(walk)
      return
    }
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === 'price' && v && typeof v === 'object' && typeof (v as { raw?: unknown }).raw === 'number') {
        const raw = (v as { raw: number }).raw
        if (raw > 0) min = Math.min(min, raw)
      } else if (k === 'price' && typeof v === 'number' && v > 0) {
        min = Math.min(min, v)
      } else {
        walk(v)
      }
    }
  }
  walk(obj)
  return isFinite(min) ? Math.round(min * 100) / 100 : null
}

/** Cheapest one-way price for a route on a date, in the given currency. */
export async function searchFlightPrice(
  origin: string,
  destination: string,
  currency = 'BRL',
  date?: string | null
): Promise<number> {
  const { key, host } = await cfg()
  const dep = date || defaultDate()
  const from = await resolvePlace(origin, key, host)
  const to = await resolvePlace(destination, key, host)
  const params = new URLSearchParams({
    fromEntityId: from.entityId,
    toEntityId: to.entityId,
    departDate: dep,
    currency
  })
  const res = await fetch(`https://${host}/flights/search-one-way?${params.toString()}`, {
    headers: headers(key, host)
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Busca de voos falhou (${res.status}). ${body.slice(0, 120)}`)
  }
  const min = deepMinPrice(await res.json())
  if (min == null) throw new Error('Nenhum preço encontrado para essa rota/data.')
  return min
}

/** Re-price a monitored leg: searches (using the trip's start date if any) and stores the price. */
export async function refreshWatchPrice(id: number): Promise<DbFlightWatch> {
  const w = (await getFlightWatches()).find((x) => x.id === id)
  if (!w) throw new Error('Trecho não encontrado.')
  if (!w.origin || !w.destination) throw new Error('O trecho precisa de origem e destino para buscar.')
  let date: string | null = null
  if (w.tripId != null) {
    const trip = (await getTrips()).find((t) => t.id === w.tripId)
    date = trip?.startDate ?? null
  }
  const price = await searchFlightPrice(w.origin, w.destination, w.currency, date)
  await updateFlightWatchPrice(id, price, new Date().toISOString())
  return (await getFlightWatches()).find((x) => x.id === id)!
}
