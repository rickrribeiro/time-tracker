import { create } from 'zustand'
import { Contact } from '../../../types'

interface ContactState {
  contacts: Contact[]
  refresh: () => Promise<void>
  create: (c: Omit<Contact, 'id' | 'createdAt' | 'lastContactAt'>) => Promise<void>
  update: (c: Contact) => Promise<void>
  log: (id: number) => Promise<void>
  remove: (id: number) => Promise<void>
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  refresh: async () => set({ contacts: await window.api.contacts.getAll() }),
  create: async (c) => {
    await window.api.contacts.create(c.name, c.location, c.birthday, c.interests, c.context, c.nextFollowUp)
    await get().refresh()
  },
  update: async (c) => {
    await window.api.contacts.update(c.id, c.name, c.location, c.birthday, c.interests, c.context, c.lastContactAt, c.nextFollowUp)
    await get().refresh()
  },
  log: async (id) => {
    await window.api.contacts.log(id)
    await get().refresh()
  },
  remove: async (id) => {
    await window.api.contacts.delete(id)
    await get().refresh()
  }
}))
