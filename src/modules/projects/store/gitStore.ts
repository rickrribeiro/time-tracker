import { create } from 'zustand'
import { GitScan } from '../../../types'

interface GitState {
  scan: GitScan | null
  loading: boolean
  error: string
  /** Full scan (with PRs). `refreshPrs` bypasses the server's 5-min PR cache. */
  refresh: (opts?: { refreshPrs?: boolean }) => Promise<void>
  /** Cheap: server returns its last scan if < 10 min old (Home card). */
  loadSummary: () => Promise<void>
}

export const useGitStore = create<GitState>((set, get) => ({
  scan: null,
  loading: false,
  error: '',
  refresh: async (opts) => {
    if (get().loading) return
    set({ loading: true, error: '' })
    try {
      set({ scan: await window.api.git.scan({ prs: true, refreshPrs: !!opts?.refreshPrs }) })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ loading: false })
    }
  },
  loadSummary: async () => {
    if (get().loading) return
    set({ loading: true, error: '' })
    try {
      set({ scan: await window.api.git.summary() })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ loading: false })
    }
  }
}))
