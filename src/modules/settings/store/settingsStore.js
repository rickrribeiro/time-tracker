import { create } from 'zustand';
export const useSettingsStore = create((set, get) => ({
    values: {},
    refresh: async () => {
        const values = await window.api.settings.getAll();
        set({ values });
    },
    set: async (key, value) => {
        await window.api.settings.set(key, value);
        set({ values: { ...get().values, [key]: value } });
    },
    get: (key) => get().values[key] ?? ''
}));
