import { create } from 'zustand'
import { Habit } from '../../../types'
import { localDateStr } from '../../../utils/dates'

/** YYYY-MM-DD for `daysAgo` days before today (local). */
function dateNDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return localDateStr(d)
}

const RANGE_DAYS = 60 // enough history to compute streaks

interface DayCell {
  date: string
  done: boolean
}

interface HabitState {
  habits: Habit[]
  completed: Set<string> // "habitId|date" for completed entries in the loaded range
  date: string // the day being viewed/edited (defaults to today)
  refresh: () => Promise<void>
  setDate: (date: string) => Promise<void>
  create: (name: string, frequency: string, target: number) => Promise<void>
  update: (habit: Habit) => Promise<void>
  remove: (id: number) => Promise<void>
  toggle: (habitId: number) => Promise<void>
  isDone: (habitId: number) => boolean
  streak: (habitId: number) => number
  weekRate: (habitId: number) => number // completions in the last 7 days
  last7: (habitId: number) => DayCell[]
}

export const useHabitStore = create<HabitState>((set, get) => ({
  habits: [],
  completed: new Set<string>(),
  date: localDateStr(new Date()),

  refresh: async () => {
    const today = localDateStr(new Date())
    const selected = get().date || today
    // Load a range that always covers both the recent history AND the selected day,
    // so navigating far back/forward still shows/persists that day's marks.
    const start60 = dateNDaysAgo(RANGE_DAYS)
    const start = selected < start60 ? selected : start60
    const end = selected > today ? selected : today
    const [habits, entries] = await Promise.all([
      window.api.habits.getAll(),
      window.api.habits.getEntriesRange(start, end)
    ])
    const completed = new Set(entries.map((e) => `${e.habitId}|${e.date}`))
    set({ habits, completed })
  },

  setDate: async (date) => {
    set({ date })
    await get().refresh()
  },

  create: async (name, frequency, target) => {
    await window.api.habits.create(name, frequency, target)
    await get().refresh()
  },

  update: async (habit) => {
    await window.api.habits.update(habit.id, habit.name, habit.frequency, habit.target, habit.active)
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

  isDone: (habitId) => get().completed.has(`${habitId}|${get().date}`),

  streak: (habitId) => {
    const { completed } = get()
    let count = 0
    const d = new Date()
    // count consecutive completed days ending today
    for (let i = 0; i < RANGE_DAYS; i++) {
      const key = `${habitId}|${localDateStr(d)}`
      if (completed.has(key)) count++
      else break
      d.setDate(d.getDate() - 1)
    }
    return count
  },

  weekRate: (habitId) => {
    const { completed } = get()
    let n = 0
    for (let i = 0; i < 7; i++) {
      if (completed.has(`${habitId}|${dateNDaysAgo(i)}`)) n++
    }
    return n
  },

  last7: (habitId) => {
    const { completed } = get()
    const cells: DayCell[] = []
    for (let i = 6; i >= 0; i--) {
      const date = dateNDaysAgo(i)
      cells.push({ date, done: completed.has(`${habitId}|${date}`) })
    }
    return cells
  }
}))
