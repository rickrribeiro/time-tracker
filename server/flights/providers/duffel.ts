import type { NormalizedOffer, Segment, Slice } from '../../../shared/flights'
import { decimalToMinor, fetchJson, FlightProvider, isoDurationMin, ProviderError, SearchQuery } from './types'

/**
 * Duffel (API de NDC/GDS). Preços AO VIVO com trechos, companhia operadora, bagagem
 * incluída e condições de reembolso — ideal para APROFUNDAMENTO e VALIDAÇÃO.
 * • Token de teste (`duffel_test_…`) só devolve a companhia fictícia "Duffel Airways":
 *   o adaptador recusa usar isso em monitores (não é preço real).
 * • Busca é grátis até 1500 buscas por reserva; além disso ~US$ 0,005/busca (sem reservas,
 *   toda busca conta como excedente). O orçamento de consultas do monitor limita isso.
 * Docs: https://duffel.com/docs/api/v2/offer-requests/create-offer-request
 */
const URL_REQ = 'https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=20000'
const MAX_OFFERS = 60

interface DPlace {
  iata_code?: string
  time_zone?: string
}
interface DSegment {
  origin: DPlace
  destination: DPlace
  origin_terminal?: string | null
  destination_terminal?: string | null
  departing_at: string
  arriving_at: string
  duration?: string | null
  marketing_carrier?: { iata_code?: string; name?: string }
  operating_carrier?: { iata_code?: string; name?: string }
  marketing_carrier_flight_number?: string
  aircraft?: { name?: string } | null
  passengers?: { baggages?: { type: 'checked' | 'carry_on'; quantity: number }[] }[]
}
interface DOffer {
  id: string
  total_amount: string
  total_currency: string
  expires_at?: string
  slices: { origin: DPlace; destination: DPlace; duration?: string | null; segments: DSegment[] }[]
  conditions?: { refund_before_departure?: { allowed?: boolean } | null }
  owner?: { iata_code?: string; name?: string }
}

/** Menor franquia garantida entre trechos (se um trecho não informa, é desconhecida). */
function bagCount(segs: DSegment[], type: 'checked' | 'carry_on'): number | null {
  let min: number | null = Infinity
  for (const s of segs) {
    const b = s.passengers?.[0]?.baggages
    if (!b) return null
    const q = b.filter((x) => x.type === type).reduce((t, x) => t + (x.quantity ?? 0), 0)
    min = Math.min(min!, q)
  }
  return min === Infinity ? null : min
}

export function normalizeDuffelOffer(o: DOffer, observedAt: string): NormalizedOffer | null {
  if (!o?.slices?.length || !o.total_amount || !o.total_currency) return null
  const allSegs: DSegment[] = []
  const slices: Slice[] = o.slices.map((sl) => {
    const segments: Segment[] = sl.segments.map((s) => {
      allSegs.push(s)
      return {
        from: s.origin.iata_code ?? '',
        to: s.destination.iata_code ?? '',
        departLocal: s.departing_at.slice(0, 16),
        arriveLocal: s.arriving_at.slice(0, 16),
        durationMin: isoDurationMin(s.duration),
        marketingCarrier: s.marketing_carrier?.iata_code ?? null,
        operatingCarrier: s.operating_carrier?.iata_code ?? null,
        flightNumber: s.marketing_carrier_flight_number ?? null,
        terminalFrom: s.origin_terminal ?? null,
        terminalTo: s.destination_terminal ?? null,
        aircraft: s.aircraft?.name ?? null
      }
    })
    const first = segments[0]
    const last = segments[segments.length - 1]
    return {
      from: first?.from ?? sl.origin.iata_code ?? '',
      to: last?.to ?? sl.destination.iata_code ?? '',
      departLocal: first?.departLocal ?? '',
      arriveLocal: last?.arriveLocal ?? null,
      durationMin: isoDurationMin(sl.duration),
      stops: Math.max(0, segments.length - 1),
      carriers: [...new Set(segments.map((s) => s.marketingCarrier).filter((x): x is string => !!x))],
      firstFlightNumber: first?.flightNumber ?? null,
      segments
    }
  })
  const refund = o.conditions?.refund_before_departure
  return {
    provider: 'duffel',
    sourceLabel: 'Duffel (ao vivo)',
    externalId: o.id,
    slices,
    price: { amountMinor: decimalToMinor(o.total_amount, o.total_currency), currency: o.total_currency.toUpperCase() },
    baggage: { carryOn: bagCount(allSegs, 'carry_on'), checked: bagCount(allSegs, 'checked'), note: null },
    refundable: refund == null ? null : !!refund.allowed,
    // uma oferta Duffel é uma única reserva (bilhete único)
    selfTransfer: false,
    separateTickets: false,
    deepLink: null,
    linkKind: null,
    verification: 'live',
    observedAt,
    expiresAt: o.expires_at ?? null
  }
}

function passengers(q: SearchQuery): Record<string, unknown>[] {
  return [
    ...Array.from({ length: Math.max(1, q.adults) }, () => ({ type: 'adult' })),
    ...Array.from({ length: q.children }, () => ({ age: 8 })),
    ...Array.from({ length: q.infants }, () => ({ type: 'infant_without_seat' }))
  ]
}

async function token(getSetting: (k: string) => Promise<string | null>): Promise<string | null> {
  return (await getSetting('flights_duffel_token'))?.trim() || null
}

export const duffel: FlightProvider = {
  id: 'duffel',
  label: 'Duffel (preço ao vivo)',
  kind: 'api',
  capabilities: {
    oneWay: true,
    roundTrip: true,
    monthRange: false,
    multiAirport: true,
    livePrices: true,
    baggage: true,
    segments: true,
    deepLink: 'none',
    passengersMix: true,
    automated: true,
    dailyQuota: null
  },
  docs: 'https://duffel.com/docs/api/v2/offer-requests/create-offer-request',
  notes: [
    'Exige conta em modo LIVE (verificação de empresa/pagamento). Token de teste só traz a companhia fictícia Duffel Airways e não é usado nos monitores.',
    'Busca grátis até 1500 buscas por reserva; sem reservas cada busca pode custar ~US$ 0,005. Use orçamento baixo.',
    'Não há link público da oferta: o app mostra links de PESQUISA equivalentes (Google Flights/Skyscanner).'
  ],
  async status({ getSetting }) {
    const t = await token(getSetting)
    if (!t) return { configured: false, available: false, reason: 'Token não configurado.' }
    if (t.startsWith('duffel_test_')) return { configured: true, available: false, reason: 'Token de TESTE: só retorna dados fictícios (Duffel Airways). Use um token live.' }
    return { configured: true, available: true, reason: null }
  },
  async search(q, ctx) {
    const t = await token(ctx.getSetting)
    if (!t) throw new ProviderError('config', 'Token da Duffel não configurado.')
    if (t.startsWith('duffel_test_')) throw new ProviderError('config', 'Token de teste da Duffel retorna dados fictícios; não usado em monitores.')
    if (q.departDate.length !== 10) throw new ProviderError('bad_request', 'Duffel exige data exata.')
    const slices = [{ origin: q.origin, destination: q.destination, departure_date: q.departDate }]
    if (q.returnDate) slices.push({ origin: q.destination, destination: q.origin, departure_date: q.returnDate })
    const data: Record<string, unknown> = { slices, passengers: passengers(q), cabin_class: q.cabin }
    if (q.maxStops != null) data.max_connections = Math.min(2, Math.max(0, q.maxStops))
    const body = (await fetchJson(
      URL_REQ,
      {
        method: 'POST',
        timeoutMs: 45_000,
        headers: { Authorization: `Bearer ${t}`, 'Duffel-Version': 'v2', 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip' },
        body: JSON.stringify({ data })
      },
      ctx.signal
    )) as { data?: { offers?: DOffer[] } }
    const observedAt = ctx.now().toISOString()
    const offers = (body?.data?.offers ?? [])
      .sort((a, b) => Number(a.total_amount) - Number(b.total_amount))
      .slice(0, MAX_OFFERS)
      .map((o) => normalizeDuffelOffer(o, observedAt))
      .filter((x): x is NormalizedOffer => !!x)
    return { offers, note: offers.length ? undefined : 'Nenhuma oferta para essa data.' }
  },
  async test(ctx) {
    const t = await token(ctx.getSetting)
    if (!t) throw new ProviderError('config', 'Token não configurado.')
    await fetchJson('https://api.duffel.com/air/airlines?limit=1', { headers: { Authorization: `Bearer ${t}`, 'Duffel-Version': 'v2', Accept: 'application/json' } }, ctx.signal)
    return t.startsWith('duffel_test_') ? 'Token de TESTE válido — só dados fictícios; não será usado nos monitores.' : 'Token live válido.'
  }
}
