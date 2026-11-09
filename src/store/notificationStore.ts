import { create } from 'zustand'
import { AppNotification } from '../types'
import { subscribe } from '../api/transport'

interface NotificationState {
  items: AppNotification[]
  unread: number
  loaded: boolean
  load: () => Promise<void>
  markRead: (id: number, read?: boolean) => Promise<void>
  markAllRead: () => Promise<void>
  remove: (id: number) => Promise<void>
  clear: (onlyRead?: boolean) => Promise<void>
}

const countUnread = (items: AppNotification[]): number => items.filter((n) => !n.readAt).length

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,

  load: async () => {
    const [items, unread] = await Promise.all([
      window.api.notifications.list(100),
      window.api.notifications.unreadCount()
    ])
    set({ items, unread, loaded: true })
  },

  // Otimista: atualiza a UI na hora; o evento 'notifications:updated' reconcilia depois.
  markRead: async (id, read = true) => {
    const items = get().items.map((n) =>
      n.id === id ? { ...n, readAt: read ? n.readAt ?? new Date().toISOString() : null } : n
    )
    set({ items, unread: countUnread(items) })
    await window.api.notifications.markRead(id, read)
  },

  markAllRead: async () => {
    const now = new Date().toISOString()
    set({ items: get().items.map((n) => ({ ...n, readAt: n.readAt ?? now })), unread: 0 })
    await window.api.notifications.markAllRead()
  },

  remove: async (id) => {
    const items = get().items.filter((n) => n.id !== id)
    set({ items, unread: countUnread(items) })
    await window.api.notifications.delete(id)
  },

  clear: async (onlyRead = false) => {
    const items = onlyRead ? get().items.filter((n) => !n.readAt) : []
    set({ items, unread: countUnread(items) })
    await window.api.notifications.clear(onlyRead)
  }
}))

// Mantém badge/lista em sincronia entre desktop e celular (SSE do servidor).
let wired = false
export function wireNotifications(): void {
  if (wired) return
  wired = true
  void useNotificationStore.getState().load().catch(() => undefined)
  subscribe('notifications:updated', () => {
    void useNotificationStore.getState().load().catch(() => undefined)
  })
}
