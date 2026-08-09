import { create } from 'zustand'
import { GithubIssue } from '../../../types'

export type BoardColumn = 'backlog' | 'in-progress' | 'blocked' | 'done'

interface GithubState {
  issues: GithubIssue[]
  syncing: boolean
  error: string | null
  lastCount: number | null
  refresh: () => Promise<void>
  sync: () => Promise<void>
  createLocal: (repo: string, title: string, body: string | null) => Promise<void>
  removeIssue: (id: number) => Promise<void>
  pushToGithub: (id: number) => Promise<void>
}

/** Map an issue to a Kanban column from its state + labels (read-only in MVP). */
export function columnFor(issue: GithubIssue): BoardColumn {
  if (issue.state === 'closed') return 'done'
  const labels = parseLabels(issue).map((l) => l.toLowerCase())
  if (labels.some((l) => l.includes('block') || l.includes('bloq'))) return 'blocked'
  if (labels.some((l) => l.includes('progress') || l.includes('doing') || l.includes('andamento')))
    return 'in-progress'
  return 'backlog'
}

/** Extract "owner/name" from a GitHub repo URL (to match against issue.repo). */
export function repoFromUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/github\.com[/:]([^/]+\/[^/#?]+?)(?:\.git)?\/?$/i)
  return m ? m[1] : null
}

export function parseLabels(issue: GithubIssue): string[] {
  if (!issue.labels) return []
  try {
    return JSON.parse(issue.labels) as string[]
  } catch {
    return []
  }
}

export const useGithubStore = create<GithubState>((set) => ({
  issues: [],
  syncing: false,
  error: null,
  lastCount: null,

  refresh: async () => {
    const issues = await window.api.github.getIssues()
    set({ issues })
  },

  sync: async () => {
    set({ syncing: true, error: null })
    try {
      const count = await window.api.github.sync()
      const issues = await window.api.github.getIssues()
      set({ issues, lastCount: count, syncing: false })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), syncing: false })
    }
  },

  createLocal: async (repo, title, body) => {
    await window.api.github.createLocal(repo, title, body)
    set({ issues: await window.api.github.getIssues() })
  },

  removeIssue: async (id) => {
    await window.api.github.deleteIssue(id)
    set({ issues: await window.api.github.getIssues() })
  },

  pushToGithub: async (id) => {
    set({ error: null })
    await window.api.github.createOnGithub(id) // may throw — caller handles
    set({ issues: await window.api.github.getIssues() })
  }
}))
