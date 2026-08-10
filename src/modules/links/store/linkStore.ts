import { create } from 'zustand'
import { Link } from '../../../types'

interface LinkState {
  links: Link[]
  refresh: () => Promise<void>
  create: (title: string, url: string) => Promise<void>
  update: (id: number, title: string, url: string) => Promise<void>
  remove: (id: number) => Promise<void>
  setChecked: (id: number, checked: boolean) => Promise<void>
}

export const useLinkStore = create<LinkState>((set, get) => ({
  links: [],

  refresh: async () => set({ links: await window.api.links.getAll() }),

  create: async (title, url) => {
    await window.api.links.create(title, url)
    await get().refresh()
  },
  update: async (id, title, url) => {
    await window.api.links.update(id, title, url)
    await get().refresh()
  },
  remove: async (id) => {
    await window.api.links.delete(id)
    await get().refresh()
  },
  setChecked: async (id, checked) => {
    await window.api.links.setChecked(id, checked ? 1 : 0)
    // optimistic local update (avoids a full refetch flicker on the checkbox)
    set({ links: get().links.map((l) => (l.id === id ? { ...l, checked: checked ? 1 : 0 } : l)) })
  }
}))

/** Ensure a URL has a scheme so the OS opens it in the browser. */
export function normalizeUrl(url: string): string {
  const u = url.trim()
  return /^[a-z]+:\/\//i.test(u) ? u : `https://${u}`
}
