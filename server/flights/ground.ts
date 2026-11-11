import type { GroundEstimate, LocationRef, NearbyAirport } from '../../shared/flights'
import { getSetting } from '../database/queries'
import { airportsNear, getAirport, haversineKm, refCenter } from './geo'
import * as repo from './repo'

/**
 * Deslocamento terrestre aeroporto → destino final.
 * • OSRM (router.project-osrm.org por padrão; configurável): rota rodoviária real.
 *   Servidor de demonstração: uso pessoal, ≤ 1 req/s — por isso só sob demanda, com cache de 30 dias.
 * • Sem OSRM: linha reta × 1,3 a 70 km/h, marcado como aproximação ("straight").
 * Custo: só se o usuário configurar custo por km (Configurações → Passagens); senão desconhecido.
 */
const OSRM_DEFAULT = 'https://router.project-osrm.org'
let lastOsrmCall = 0

async function costPerKm(): Promise<{ minor: number; currency: string } | null> {
  const v = Number(await getSetting('flights_ground_cost_per_km_minor'))
  const cur = (await getSetting('flights_ground_cost_currency')) || 'BRL'
  return Number.isFinite(v) && v > 0 ? { minor: v, currency: cur } : null
}

async function osrm(from: { lat: number; lon: number }, to: { lat: number; lon: number }): Promise<{ km: number; minutes: number } | null> {
  if ((await getSetting('flights_osrm_enabled')) === '0') return null
  const base = ((await getSetting('flights_osrm_url')) || OSRM_DEFAULT).replace(/\/+$/, '')
  const key = `osrm:${from.lat.toFixed(3)},${from.lon.toFixed(3)};${to.lat.toFixed(3)},${to.lon.toFixed(3)}`
  const hit = await repo.cacheGet<{ km: number; minutes: number } | 'none'>(key)
  if (hit) return hit === 'none' ? null : hit
  const wait = lastOsrmCall + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastOsrmCall = Date.now()
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    const res = await fetch(`${base}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`, { signal: ctl.signal, headers: { 'User-Agent': 'rickOS-personal/1.0' } })
    clearTimeout(timer)
    if (!res.ok) return null
    const j = (await res.json()) as { code?: string; routes?: { distance: number; duration: number }[] }
    const r = j.code === 'Ok' ? j.routes?.[0] : undefined
    const out = r ? { km: Math.round(r.distance / 100) / 10, minutes: Math.round(r.duration / 60) } : null
    await repo.cacheSet(key, out ?? 'none', 30 * 86400_000)
    return out
  } catch {
    return null
  }
}

export async function estimateGround(fromIata: string, to: { lat: number; lon: number }, useRouting = true): Promise<GroundEstimate | null> {
  const a = getAirport(fromIata)
  if (!a) return null
  const route = useRouting ? await osrm(a, to) : null
  const km = route?.km ?? Math.round(haversineKm(a, to) * 1.3)
  const minutes = route?.minutes ?? Math.round((km / 70) * 60)
  const cpk = await costPerKm()
  return { km, minutes, source: route ? 'osrm' : 'straight', costMinor: cpk ? Math.round(km * cpk.minor) : null, currency: cpk?.currency ?? null }
}

/** Aeroportos próximos a uma cidade/aeroporto: distância real (haversine) + terrestre opcional. */
export async function nearbyAirports(ref: LocationRef, radiusKm: number, withGround: boolean): Promise<{ center: { lat: number; lon: number; label: string } | null; airports: NearbyAirport[] }> {
  const center = refCenter(ref)
  if (!center) return { center: null, airports: [] }
  const list = airportsNear(center, Math.max(10, Math.min(1000, radiusKm)), { limit: 20 })
  const out: NearbyAirport[] = []
  for (const [i, a] of list.entries()) {
    // rota só para os mais próximos (custo/limite do OSRM)
    const ground = withGround && i < 8 && a.distanceKm > 25 ? await estimateGround(a.iata, center) : null
    out.push({ ...a, ground })
  }
  return { center, airports: out }
}
