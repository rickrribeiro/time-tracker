import { create } from 'zustand';
export const useTagStore = create((set, get) => ({
    tags: [],
    refreshTags: async () => {
        const tags = await window.api.tags.getAll();
        set({ tags });
    },
    createTag: async (name, color, isProductive) => {
        await window.api.tags.create(name, color, isProductive);
        await get().refreshTags();
    },
    updateTag: async (id, name, color, isProductive) => {
        await window.api.tags.update(id, name, color, isProductive);
        await get().refreshTags();
    },
    deleteTag: async (id) => {
        await window.api.tags.delete(id);
        await get().refreshTags();
    },
    getTagById: (id) => {
        if (id === null)
            return undefined;
        return get().tags.find((t) => t.id === id);
    }
}));
