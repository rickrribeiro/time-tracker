import { create } from 'zustand'
import { Page } from '../types'
import { localDateStr } from '../utils/dates'

interface UIState {
  currentPage: Page
  selectedDate: string // YYYY-MM-DD
  selectedMonth: { year: number; month: number }
  setPage: (page: Page) => void
  /** Projeto aberto na página de detalhe (#/project?id=N). */
  selectedProjectId: number | null
  openProject: (id: number) => void
  setSelectedDate: (date: string) => void
  setSelectedMonth: (year: number, month: number) => void
}

const today = new Date()

/** Page from the URL hash (#/todo) — App validates it against the page registry. */
function projectIdFromHash(): number | null {
  const m = window.location.hash.match(/[?&]id=(\d+)/)
  return m ? Number(m[1]) : null
}

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
  selectedProjectId: projectIdFromHash(),
  openProject: (id) => set({ selectedProjectId: id, currentPage: 'project' }),
  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedMonth: (year, month) => set({ selectedMonth: { year, month } })
}))
