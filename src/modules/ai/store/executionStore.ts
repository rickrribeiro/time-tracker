import { create } from 'zustand'
import { PromptExecution } from '../../../types'

interface ExecutionState {
  executions: PromptExecution[]
  refresh: () => Promise<void>
  save: (agentId: string | null, skillIds: string[], userPrompt: string, finalPrompt: string, response: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  executions: [],

  refresh: async () => set({ executions: await window.api.executions.getAll() }),

  save: async (agentId, skillIds, userPrompt, finalPrompt, response) => {
    await window.api.executions.create(agentId, JSON.stringify(skillIds), userPrompt, finalPrompt, response)
    await get().refresh()
  },
  remove: async (id) => {
    await window.api.executions.delete(id)
    await get().refresh()
  }
}))
