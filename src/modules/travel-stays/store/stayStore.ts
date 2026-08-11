import { create } from 'zustand'
import { SearchInput, StayResult, StayFavorite, StayWatch } from '../types'
import { searchStaysFlexible, sortResults, SortMode } from '../services/searchStays'

const DEFAULT_INPUT: SearchInput = {
  city: '',
  neighborhoods: [],
  excludedNeighborhoods: [],
  checkIn: '',
  checkOut: '',
  flexibleDays: 0,
  currency: 'BRL',
  accommodationTypes: [],
  excludeSharedRoom: false,
  requiredAmenities: [],
  preferredAmenities: []
}

async function loadFx(): Promise<{ base: string; rates: Record<string, number> }> {
  const [base, ratesRaw] = await Promise.all([window.api.settings.get('finance_base'), window.api.settings.get('finance_rates')])
  let rates: Record<string, number> = {}
  try {
    rates = ratesRaw ? JSON.parse(ratesRaw) : {}
  } catch {
    rates = {}
  }
  return { base: base || 'BRL', rates }
}

interface StayState {
  input: SearchInput
  results: StayResult[]
  sort: SortMode
  loading: boolean
  error: string
  providersFailed: string[]
  favorites: StayFavorite[]
  watches: StayWatch[]

  setInput: (patch: Partial<SearchInput>) => void
  search: () => Promise<void>
  setSort: (s: SortMode) => void
  refreshFavorites: () => Promise<void>
  toggleFavorite: (r: StayResult) => Promise<void>
  isFavorite: (id: string) => boolean
  refreshWatches: () => Promise<void>
  createWatch: () => Promise<void>
  removeWatch: (id: string) => Promise<void>
}

export const useStayStore = create<StayState>((set, get) => ({
  input: DEFAULT_INPUT,
  results: [],
  sort: 'best',
  loading: false,
  error: '',
  providersFailed: [],
  favorites: [],
  watches: [],

  setInput: (patch) => set({ input: { ...get().input, ...patch } }),

  setSort: (s) => set({ sort: s, results: sortResults(get().results, s) }),

  search: async () => {
    const input = get().input
    if (!input.city.trim() || !input.checkIn || !input.checkOut) {
      set({ error: 'Preencha cidade, check-in e check-out.' })
      return
    }
    set({ loading: true, error: '', results: [] })
    try {
      const fx = await loadFx()
      const out = await searchStaysFlexible(input, fx)
      set({ results: sortResults(out.results, get().sort), providersFailed: out.providersFailed, loading: false })
      window.api.stays.addSearchHistory(JSON.stringify(input))
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  refreshFavorites: async () => set({ favorites: await window.api.stays.favorites() }),

  toggleFavorite: async (r) => {
    const existing = get().favorites.find((f) => f.id === r.id)
    if (existing) {
      await window.api.stays.removeFavorite(r.id)
    } else {
      await window.api.stays.addFavorite({
        id: r.id,
        tripId: null,
        provider: r.provider,
        listingUrl: r.listingUrl,
        title: r.title,
        pricePerNight: r.pricePerNight,
        currency: r.currency,
        data: JSON.stringify(r),
        createdAt: new Date().toISOString()
      })
    }
    await get().refreshFavorites()
  },

  isFavorite: (id) => get().favorites.some((f) => f.id === id),

  refreshWatches: async () => set({ watches: await window.api.stays.watches() }),

  createWatch: async () => {
    const { input, results } = get()
    const best = results.length ? Math.min(...results.map((r) => r.pricePerNight)) : 0
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await window.api.stays.addWatch({
      id,
      city: input.city,
      filters: JSON.stringify(input),
      currentPrice: best,
      bestPrice: best,
      currency: input.currency,
      lastCheckedAt: now,
      createdAt: now
    })
    if (best > 0) await window.api.stays.addPricePoint({ id: crypto.randomUUID(), watchId: id, checkedAt: now, price: best, currency: input.currency })
    await get().refreshWatches()
  },

  removeWatch: async (id) => {
    await window.api.stays.removeWatch(id)
    await get().refreshWatches()
  }
}))
