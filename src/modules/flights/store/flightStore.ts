import { create } from 'zustand'
import type { MonitorSummary, ProviderStatus } from '../../../../shared/flights'

interface FlightState {
  monitors: MonitorSummary[]
  providers: ProviderStatus[]
  loaded: boolean
  error: string | null
  /** Monitor aberto na página de detalhe (#/flight-monitor?id=N). */
  selectedId: number | null
  refresh: () => Promise<void>
  refreshProviders: () => Promise<void>
  open: (id: number | null) => void
}

function idFromHash(): number | null {
  if (!window.location.hash.startsWith('#/flight-monitor')) return null
  const m = window.location.hash.match(/[?&]id=(\d+)/)
  return m ? Number(m[1]) : null
}

export const useFlightStore = create<FlightState>((set) => ({
  monitors: [],
  providers: [],
  loaded: false,
  error: null,
  selectedId: idFromHash(),
  refresh: async () => {
    try {
      set({ monitors: await window.api.flightMon.list(), loaded: true, error: null })
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) })
    }
  },
  refreshProviders: async () => {
    set({ providers: await window.api.flightMon.providers() })
  },
  open: (id) => set({ selectedId: id })
}))

/** Mensagem de erro amigável de uma chamada RPC. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
