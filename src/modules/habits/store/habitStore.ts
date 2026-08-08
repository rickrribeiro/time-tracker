import { create } from 'zustand'
import { Habit, HabitEntry } from '../../../types'
import { localDateStr } from '../../../utils/dates'

interface HabitState {
  habits: Habit[]
  entries: HabitEntry[] // entries for `date`
  date: string
  refresh: () => Promise<void>
  create: (name: string, frequency: string, target: number) => Promise<void>
  remove: (id: number) => Promise<void>
  toggle: (habitId: number) => Promise<void>
  isDone: (habitId: number) => boolean
}

export const useHabitStore = create<HabitState>((set, get) => ({
  habits: [],
  entries: [],
  date: localDateStr(new Date()),

  refresh: async () => {
    const [habits, entries] = await Promise.all([
      window.api.habits.getAll(),
      window.api.habits.getEntries(get().date)
    ])
    set({ habits, entries })
  },

  create: async (name, frequency, target) => {
    await window.api.habits.create(name, frequency, target)
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.habits.delete(id)
    await get().refresh()
  },

  toggle: async (habitId) => {
    const done = get().isDone(habitId)
    await window.api.habits.toggleEntry(habitId, get().date, done ? 0 : 1)
    await get().refresh()
  },

  isDone: (habitId) =>
    get().entries.some((e) => e.habitId === habitId && e.completed === 1)
}))
