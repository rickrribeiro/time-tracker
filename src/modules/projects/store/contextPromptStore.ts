import { create } from 'zustand'

/** Pedido de "salvar contexto" ao encerrar uma sessão do timer vinculada a um projeto. */
export interface ContextPrompt {
  projectId: number
  taskTitle: string
  minutes: number
}

interface ContextPromptState {
  prompt: ContextPrompt | null
  ask: (p: ContextPrompt) => void
  dismiss: () => void
}

export const useContextPromptStore = create<ContextPromptState>((set) => ({
  prompt: null,
  ask: (p) => set({ prompt: p }),
  dismiss: () => set({ prompt: null })
}))

/** Sessões curtas (< 5 min) não pedem contexto. */
export function maybeAskContext(prev: { projectId?: number | null; title: string; startTime: string } | null, nextProjectId: number | null): void {
  if (!prev?.projectId || prev.projectId === nextProjectId) return
  const minutes = Math.round((Date.now() - new Date(prev.startTime).getTime()) / 60000)
  if (minutes < 5) return
  useContextPromptStore.getState().ask({ projectId: prev.projectId, taskTitle: prev.title, minutes })
}
