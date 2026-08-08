import { create } from 'zustand'

interface SettingsState {
  values: Record<string, string>
  refresh: () => Promise<void>
  set: (key: string, value: string) => Promise<void>
  get: (key: string) => string
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  values: {},

  refresh: async () => {
    const values = await window.api.settings.getAll()
    set({ values })
  },

  set: async (key, value) => {
    await window.api.settings.set(key, value)
    set({ values: { ...get().values, [key]: value } })
  },

  get: (key) => get().values[key] ?? ''
}))
