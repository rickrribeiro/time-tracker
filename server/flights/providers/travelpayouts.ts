import type { NormalizedOffer, Slice } from '../../../shared/flights'
import { getAirport } from '../geo'
import { decimalToMinor, fetchJson, FlightProvider, ProviderError, SearchQuery } from './types'

/**
 * Travelpayouts / Aviasales **Data API** (gratuita, token pessoal).
 * São preços em CACHE de buscas feitas por usuários da Aviasales nas últimas ~48h:
 * ótimos para DESCOBERTA (um mês inteiro por consulta), mas não são cotação ao vivo,
 * não informam bagagem nem trechos — só nº de conexões, companhia e 1º voo.
 * Os termos permitem acesso automatizado com token (diferente da Search API, que proíbe).
 * Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163
 */
const BASE = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates'

interface TpTicket {
  origin: string
  destination: string
  origin_airport?: string
  destination_airport?: string
  price: number
  airline?: string
  flight_number?: string | number
  departure_at: string
  return_at?: string
  transfers?: number
  return_transfers?: number
  duration?: number
  duration_to?: number
  duration_back?: number
  link?: string
}

/** '2026-12-10T07:00:00+07:00' → hora local 'YYYY-MM-DDTHH:MM' (o ISO já vem na hora local). */
function localPart(iso: string): string {
  return iso.slice(0, 16)
}

/** Hora local de chegada = partida (UTC) + duração, no fuso do aeroporto de destino. */
export function arrivalLocal(departIso: string, minutes: number | undefined, destIata: string): string | null {
  const t = Date.parse(departIso)
  const tz = getAirport(destIata)?.tz
  if (Number.isNaN(t) || minutes == null || !tz) return null
  const d = new Date(t + minutes * 60000)
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

export function normalizeTicket(t: TpTicket, currency: string, observedAt: string): NormalizedOffer | null {
  if (!t || typeof t.price !== 'number' || !(t.price > 0) || !t.departure_at) return null
  const from = (t.origin_airport || t.origin || '').toUpperCase()
  const to = (t.destination_airport || t.destination || '').toUpperCase()
  if (!from || !to) return null
  const carriers = t.airline ? [t.airline] : []
  const flightNo = t.flight_number != null ? String(t.flight_number) : null
  const outbound: Slice = {
    from,
    to,
    departLocal: localPart(t.departure_at),
    arriveLocal: arrivalLocal(t.departure_at, t.duration_to ?? (t.return_at ? undefined : t.duration), to),
    durationMin: t.duration_to ?? (t.return_at ? null : t.duration ?? null),
    stops: t.transfers ?? 0,
    carriers,
    firstFlightNumber: flightNo,
    segments: []
  }
  const slices = [outbound]
  if (t.return_at) {
    slices.push({
      from: to,
      to: from,
      departLocal: localPart(t.return_at),
      arriveLocal: arrivalLocal(t.return_at, t.duration_back, from),
      durationMin: t.duration_back ?? null,
      stops: t.return_transfers ?? 0,
      carriers,
      firstFlightNumber: null,
      segments: []
    })
  }
  return {
    provider: 'travelpayouts',
    sourceLabel: 'Aviasales (cache ≤48h)',
    externalId: null,
    slices,
    price: { amountMinor: decimalToMinor(t.price, currency), currency },
    baggage: { carryOn: null, checked: null, note: 'A fonte não informa bagagem.' },
    refundable: null,
    selfTransfer: null,
    separateTickets: null,
    // o link abre a BUSCA na Aviasales com esses parâmetros — não garante a mesma tarifa
    deepLink: t.link ? `https://www.aviasales.com${t.link.startsWith('/') ? '' : '/'}${t.link}` : null,
    linkKind: t.link ? 'search' : null,
    verification: 'cached',
    observedAt,
    expiresAt: null
  }
}

export const travelpayouts: FlightProvider = {
  id: 'travelpayouts',
  label: 'Aviasales Data API (Travelpayouts)',
  kind: 'api',
  capabilities: {
    oneWay: true,
    roundTrip: true,
    monthRange: true,
    multiAirport: true,
    livePrices: false,
    baggage: false,
    segments: false,
    deepLink: 'search',
    passengersMix: false,
    automated: true,
    dailyQuota: null
  },
  docs: 'https://support.travelpayouts.com/hc/en-us/articles/203956163',
  notes: [
    'Gratuita: crie uma conta em travelpayouts.com e copie o token da API em Profile → API token.',
    'Preços em cache (buscas de usuários nas últimas ~48h). Rotas pouco buscadas podem não ter dados.',
    'Sem bagagem nem aeroportos de conexão → restrições desse tipo ficam "Verificação pendente".',
    'Preço por 1 adulto; não considera crianças/bebês nem cabine.'
  ],
  async status({ getSetting }) {
    const token = await getSetting('flights_travelpayouts_token')
    if (!token) return { configured: false, available: false, reason: 'Token não configurado.' }
    return { configured: true, available: true, reason: null }
  },
  async search(q: SearchQuery, ctx) {
    const token = await ctx.getSetting('flights_travelpayouts_token')
    if (!token) throw new ProviderError('config', 'Token da Travelpayouts não configurado.')
    const market = (await ctx.getSetting('flights_travelpayouts_market')) || 'br'
    const params = new URLSearchParams({
      origin: q.origin,
      destination: q.destination,
      departure_at: q.departDate,
      currency: q.currency.toLowerCase(),
      sorting: 'price',
      limit: q.departDate.length === 7 ? '100' : '30',
      unique: 'false',
      market,
      one_way: q.returnDate ? 'false' : 'true'
    })
    if (q.returnDate) params.set('return_at', q.returnDate)
    if (q.maxStops === 0) params.set('direct', 'true')
    const body = (await fetchJson(`${BASE}?${params}`, { headers: { 'X-Access-Token': token, 'Accept-Encoding': 'gzip' } }, ctx.signal)) as {
      success?: boolean
      data?: TpTicket[]
      error?: string
      currency?: string
    }
    if (body && body.success === false) throw new ProviderError('bad_request', body.error || 'Resposta sem sucesso.')
    const currency = (body?.currency || q.currency).toUpperCase()
    const observedAt = ctx.now().toISOString()
    const offers = (body?.data ?? []).map((t) => normalizeTicket(t, currency, observedAt)).filter((x): x is NormalizedOffer => !!x)
    return { offers, note: offers.length ? undefined : 'Sem preços em cache para essa rota/período.' }
  },
  async test(ctx) {
    const r = await this.search!(
      { origin: 'GRU', destination: 'LIS', departDate: new Date(ctx.now().getTime() + 45 * 86400000).toISOString().slice(0, 7), returnDate: null, adults: 1, children: 0, infants: 0, cabin: 'economy', maxStops: null, currency: 'BRL' },
      ctx
    )
    return `Conectado. Rota de teste GRU→LIS: ${r.offers.length} preço(s) em cache.`
  }
}
