import { create } from 'zustand'
import { Todo } from '../../../types'

interface TodoState {
  todos: Todo[]
  refresh: () => Promise<void>
  capture: (title: string, notes?: string | null) => Promise<void>
  create: (title: string, status?: string) => Promise<void>
  setStatus: (id: number, status: string) => Promise<void>
  update: (todo: Todo) => Promise<void>
  remove: (id: number) => Promise<void>
  inbox: () => Todo[]
  active: () => Todo[]
}

/** Single store backing both the Inbox and the TODO views (they share the `todos` table). */
export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],

  refresh: async () => {
    const todos = await window.api.todos.getAll()
    set({ todos })
  },

  capture: async (title, notes = null) => {
    await window.api.todos.create(title, notes, 'inbox', 'quick-capture')
    await get().refresh()
  },

  create: async (title, status = 'inbox') => {
    await window.api.todos.create(title, null, status, 'manual')
    await get().refresh()
  },

  setStatus: async (id, status) => {
    const t = get().todos.find((x) => x.id === id)
    if (!t) return
    await window.api.todos.update(id, t.title, t.notes, status, t.priority, t.dueDate, t.projectId)
    await get().refresh()
  },

  update: async (todo) => {
    await window.api.todos.update(
      todo.id,
      todo.title,
      todo.notes,
      todo.status,
      todo.priority,
      todo.dueDate,
      todo.projectId,
      todo.recurrence
    )
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.todos.delete(id)
    await get().refresh()
  },

  inbox: () => get().todos.filter((t) => t.status === 'inbox'),
  active: () => get().todos.filter((t) => t.status !== 'inbox')
}))
