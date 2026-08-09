import { create } from 'zustand'
import { Agent } from '../../../types'

interface AgentState {
  agents: Agent[]
  refresh: () => Promise<void>
  create: (name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string[], tags: string[]) => Promise<void>
  update: (id: string, name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string[], tags: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  duplicate: (a: Agent) => Promise<void>
  exportOne: (id: string) => Promise<void>
  importOne: () => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],

  refresh: async () => set({ agents: await window.api.agents.getAll() }),

  create: async (name, description, role, systemPrompt, defaultSkillIds, tags) => {
    await window.api.agents.create(name, description, role, systemPrompt, JSON.stringify(defaultSkillIds), JSON.stringify(tags))
    await get().refresh()
  },
  update: async (id, name, description, role, systemPrompt, defaultSkillIds, tags) => {
    await window.api.agents.update(id, name, description, role, systemPrompt, JSON.stringify(defaultSkillIds), JSON.stringify(tags))
    await get().refresh()
  },
  remove: async (id) => {
    await window.api.agents.delete(id)
    await get().refresh()
  },
  toggleFavorite: async (id) => {
    await window.api.agents.toggleFavorite(id)
    await get().refresh()
  },
  duplicate: async (a) => {
    await window.api.agents.create(`${a.name} (cópia)`, a.description, a.role, a.systemPrompt, a.defaultSkillIds, a.tags)
    await get().refresh()
  },
  exportOne: async (id) => {
    await window.api.agents.export(id)
  },
  importOne: async () => {
    await window.api.agents.import()
    await get().refresh()
  }
}))
