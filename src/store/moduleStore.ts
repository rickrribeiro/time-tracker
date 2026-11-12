import { create } from 'zustand'

const KEY = 'hidden_modules'

interface ModuleState {
  /** Chaves (`groupKey`) dos módulos ocultos na sidebar. */
  hidden: string[]
  load: () => Promise<void>
  setHidden: (keys: string[]) => Promise<void>
}

/** Módulos ocultos: guardado no servidor, vale para todos os dispositivos. */
export const useModuleStore = create<ModuleState>((set) => ({
  hidden: [],
  load: async () => {
    try {
      const v = await window.api.settings.get(KEY)
      const arr = v ? JSON.parse(v) : []
      set({ hidden: Array.isArray(arr) ? arr.map(String) : [] })
    } catch {
      set({ hidden: [] })
    }
  },
  setHidden: async (keys) => {
    set({ hidden: keys })
    await window.api.settings.set(KEY, JSON.stringify(keys))
  }
}))
