import { create } from 'zustand'
import { CalendarEvent } from '../../../types'

interface CalendarState {
  upcoming: CalendarEvent[]
  refresh: () => Promise<void>
  create: (title: string, startISO: string, endISO: string | null, location: string | null) => Promise<void>
  remove: (id: number) => Promise<void>
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  upcoming: [],

  refresh: async () => {
    const now = new Date().toISOString()
    const upcoming = await window.api.calendar.upcoming(now, 10)
    set({ upcoming })
  },

  create: async (title, startISO, endISO, location) => {
    await window.api.calendar.create(title, startISO, endISO, location)
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.calendar.delete(id)
    await get().refresh()
  }
}))
