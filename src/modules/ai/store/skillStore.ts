import { create } from 'zustand'
import { Skill } from '../../../types'

interface SkillState {
  skills: Skill[]
  refresh: () => Promise<void>
  create: (name: string, description: string | null, category: string | null, tags: string[], content: string) => Promise<void>
  update: (id: string, name: string, description: string | null, category: string | null, tags: string[], content: string) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  duplicate: (s: Skill) => Promise<void>
  exportOne: (id: string) => Promise<void>
  importOne: () => Promise<void>
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skills: [],

  refresh: async () => set({ skills: await window.api.skills.getAll() }),

  create: async (name, description, category, tags, content) => {
    await window.api.skills.create(name, description, category, JSON.stringify(tags), content)
    await get().refresh()
  },
  update: async (id, name, description, category, tags, content) => {
    await window.api.skills.update(id, name, description, category, JSON.stringify(tags), content)
    await get().refresh()
  },
  remove: async (id) => {
    await window.api.skills.delete(id)
    await get().refresh()
  },
  toggleFavorite: async (id) => {
    await window.api.skills.toggleFavorite(id)
    await get().refresh()
  },
  duplicate: async (s) => {
    await window.api.skills.create(`${s.name} (cópia)`, s.description, s.category, s.tags, s.content)
    await get().refresh()
  },
  exportOne: async (id) => {
    await window.api.skills.export(id)
  },
  importOne: async () => {
    await window.api.skills.import()
    await get().refresh()
  }
}))

export function parseTags(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
