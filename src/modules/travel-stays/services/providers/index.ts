import { SearchInput, ProviderStayResult, ProviderName, AccommodationType, Amenity } from '../../types'

export interface StayProvider {
  name: ProviderName
  search: (input: SearchInput) => Promise<ProviderStayResult[]>
}

// ── City centers for mock geolocation (fallback to a neutral point) ──
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  osaka: { lat: 34.6937, lng: 135.5023 },
  tokyo: { lat: 35.6762, lng: 139.6503 },
  kyoto: { lat: 35.0116, lng: 135.7681 },
  lisboa: { lat: 38.7223, lng: -9.1393 },
  lisbon: { lat: 38.7223, lng: -9.1393 },
  porto: { lat: 41.1579, lng: -8.6291 },
  berlin: { lat: 52.52, lng: 13.405 },
  'são paulo': { lat: -23.5505, lng: -46.6333 },
  'sao paulo': { lat: -23.5505, lng: -46.6333 }
}

const GENERIC_NEIGHBORHOODS = ['Centro', 'Downtown', 'Old Town', 'Riverside', 'Station Area']
const ROOM_POOL: AccommodationType[] = ['apartment', 'studio', 'hotel', 'aparthotel', 'hostel', 'private_room', 'shared_room']
const AMENITY_POOL: Amenity[] = ['wifi', 'gym', 'air_conditioning', 'kitchen', 'washing_machine', 'workspace', 'elevator', 'self_checkin', 'free_cancellation', 'private_bathroom']

/** Small seeded RNG so the same search yields stable mock results. */
function makeRng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function nights(input: SearchInput): number {
  const a = new Date(`${input.checkIn}T12:00:00`).getTime()
  const b = new Date(`${input.checkOut}T12:00:00`).getTime()
  return Math.max(1, Math.round((b - a) / 86400000))
}

/** Build a batch of plausible listings for a provider. */
function mockListings(provider: ProviderName, input: SearchInput, count: number): ProviderStayResult[] {
  const rng = makeRng(`${provider}|${input.city}|${input.checkIn}|${input.checkOut}`)
  const center = CITY_CENTERS[input.city.trim().toLowerCase()] ?? { lat: 0, lng: 0 }
  const hoods = [...input.neighborhoods, ...GENERIC_NEIGHBORHOODS]
  const n = nights(input)
  const base = input.maxPricePerNight ?? 15000
  const out: ProviderStayResult[] = []
  for (let i = 0; i < count; i++) {
    const price = Math.round((base * (0.45 + rng() * 0.7)) / 100) * 100
    const room = ROOM_POOL[Math.floor(rng() * ROOM_POOL.length)]
    const amenityCount = 4 + Math.floor(rng() * 6)
    const shuffled = [...AMENITY_POOL].sort(() => rng() - 0.5)
    const amenities = shuffled.slice(0, amenityCount)
    // bias: ensure required amenities appear on most listings so results aren't empty
    for (const a of input.requiredAmenities) if (rng() > 0.25 && !amenities.includes(a)) amenities.push(a)
    const hood = hoods[Math.floor(rng() * hoods.length)]
    const radius = (input.maxDistanceKm ?? 3) / 111 // deg approx
    const lat = center.lat + (rng() - 0.5) * radius * 2
    const lng = center.lng + (rng() - 0.5) * radius * 2
    out.push({
      id: `${provider}-${input.city}-${i}`,
      provider,
      title: `${['Cozy', 'Bright', 'Modern', 'Central', 'Quiet'][Math.floor(rng() * 5)]} ${room === 'hotel' ? 'Hotel' : 'stay'} in ${hood}`,
      neighborhood: hood,
      latitude: center.lat === 0 ? undefined : lat,
      longitude: center.lng === 0 ? undefined : lng,
      pricePerNight: price,
      totalPrice: price * n,
      currency: input.currency,
      rating: Math.round((7 + rng() * 3) * 10) / 10,
      reviewCount: Math.floor(rng() * 800),
      roomType: room,
      amenities,
      cancellationFree: amenities.includes('free_cancellation'),
      imageUrl: undefined,
      listingUrl: `https://example.com/${provider}/${input.city}/${i}`,
      badges: rng() > 0.7 ? ['Superhost'] : []
    })
  }
  return out
}

export const mockProvider: StayProvider = {
  name: 'mock',
  search: async (input) => mockListings('mock', input, 12)
}

// Real providers: structure ready, returning mock data until official APIs are wired.
export const bookingProvider: StayProvider = { name: 'booking', search: async (input) => mockListings('booking', input, 8) }
export const agodaProvider: StayProvider = { name: 'agoda', search: async (input) => mockListings('agoda', input, 6) }
export const tripProvider: StayProvider = { name: 'trip', search: async (input) => mockListings('trip', input, 6) }
export const airbnbProvider: StayProvider = { name: 'airbnb', search: async (input) => mockListings('airbnb', input, 8) }

export const ALL_PROVIDERS: StayProvider[] = [mockProvider, bookingProvider, agodaProvider, tripProvider, airbnbProvider]
