import { create } from 'zustand'
import { Trip } from '../../../types'

interface TripState {
  trips: Trip[]
  refresh: () => Promise<void>
  createTrip: (t: Omit<Trip, 'id'>) => Promise<void>
  updateTrip: (t: Trip) => Promise<void>
  removeTrip: (id: number) => Promise<void>
}

export const useTripStore = create<TripState>((set, get) => ({
  trips: [],

  refresh: async () => {
    set({ trips: await window.api.trips.getAll() })
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
  }
}))

/** Viagem ainda por acontecer (ou em curso): não concluída e sem volta no passado. */
export function isUpcoming(t: Trip): boolean {
  if (t.status === 'done') return false
  const end = t.endDate ?? t.startDate
  return !end || (daysUntil(end) ?? 0) >= 0
}

/** Days from today (local) until an ISO date string; null if no date. */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
