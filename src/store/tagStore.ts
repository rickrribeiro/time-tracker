import { create } from 'zustand'
import { Tag } from '../types'

interface TagState {
  tags: Tag[]
  refreshTags: () => Promise<void>
  createTag: (name: string, color: string, isProductive: number) => Promise<void>
  updateTag: (id: number, name: string, color: string, isProductive: number) => Promise<void>
  deleteTag: (id: number) => Promise<void>
  getTagById: (id: number | null) => Tag | undefined
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],

  refreshTags: async () => {
    const tags = await window.api.tags.getAll()
    set({ tags })
  },

  createTag: async (name, color, isProductive) => {
    await window.api.tags.create(name, color, isProductive)
    await get().refreshTags()
  },

  updateTag: async (id, name, color, isProductive) => {
    await window.api.tags.update(id, name, color, isProductive)
    await get().refreshTags()
  },

  deleteTag: async (id) => {
    await window.api.tags.delete(id)
    await get().refreshTags()
  },

  getTagById: (id) => {
    if (id === null) return undefined
    return get().tags.find((t) => t.id === id)
  }
}))
