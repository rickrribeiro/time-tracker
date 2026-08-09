import { create } from 'zustand'
import { Trip, FlightWatch } from '../../../types'

interface TripState {
  trips: Trip[]
  watches: FlightWatch[]
  refresh: () => Promise<void>
  createTrip: (t: Omit<Trip, 'id'>) => Promise<void>
  updateTrip: (t: Trip) => Promise<void>
  removeTrip: (id: number) => Promise<void>
  addWatch: (tripId: number | null, origin: string | null, destination: string | null, price: number | null, currency: string) => Promise<void>
  removeWatch: (id: number) => Promise<void>
  refreshWatchPrice: (id: number) => Promise<void>
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],
  watches: [],

  refresh: async () => {
    const [trips, watches] = await Promise.all([window.api.trips.getAll(), window.api.flights.getAll()])
    set({ trips, watches })
  },

  createTrip: async (t) => {
    await window.api.trips.create(t.origin, t.destination, t.startDate, t.endDate, t.budget, t.currency, t.status)
    await get().refresh()
  },
  updateTrip: async (t) => {
    await window.api.trips.update(t.id, t.origin, t.destination, t.startDate, t.endDate, t.budget, t.currency, t.status)
    await get().refresh()
  },
  removeTrip: async (id) => {
    await window.api.trips.delete(id)
    await get().refresh()
  },
  addWatch: async (tripId, origin, destination, price, currency) => {
    await window.api.flights.create(tripId, origin, destination, price, currency)
    await get().refresh()
  },
  removeWatch: async (id) => {
    await window.api.flights.delete(id)
    await get().refresh()
  },
  refreshWatchPrice: async (id) => {
    await window.api.flights.refreshWatch(id)
    await get().refresh()
  }
}))

/** Days from today (local) until an ISO date string; null if no date. */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
