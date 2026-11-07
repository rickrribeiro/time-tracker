import { create } from 'zustand'
import { Page } from '../types'
import { localDateStr } from '../utils/dates'

interface UIState {
  currentPage: Page
  selectedDate: string // YYYY-MM-DD
  selectedMonth: { year: number; month: number }
  setPage: (page: Page) => void
  setSelectedDate: (date: string) => void
  setSelectedMonth: (year: number, month: number) => void
}

const today = new Date()

/** Page from the URL hash (#/todo) — App validates it against the page registry. */
function pageFromHash(): Page | null {
  const p = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return p ? (decodeURIComponent(p) as Page) : null
}
const todayStr = localDateStr(today)

export const useUIStore = create<UIState>((set) => ({
  currentPage: pageFromHash() ?? 'timeline',
  selectedDate: todayStr,
  selectedMonth: { year: today.getFullYear(), month: today.getMonth() },

  setPage: (page) => set({ currentPage: page }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedMonth: (year, month) => set({ selectedMonth: { year, month } })
}))
