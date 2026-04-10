import { create } from 'zustand'
import { Task, TaskWithTag } from '../types'
import { localDayStartISO, localDayEndISO } from '../utils/dates'

interface TaskState {
  activeTask: TaskWithTag | null
  todayTasks: TaskWithTag[]
  isLoading: boolean

  setActiveTask: (task: TaskWithTag | null) => void
  setTodayTasks: (tasks: TaskWithTag[]) => void
  setLoading: (v: boolean) => void

  startTask: (title: string, tagId: number | null) => Promise<void>
  stopActiveTask: () => Promise<void>
  switchTask: (title: string, tagId: number | null) => Promise<void>
  refreshTasks: (date: string) => Promise<void>
  refreshActive: () => Promise<void>
  deleteTask: (id: number) => Promise<void>
  updateTask: (
    id: number,
    title: string,
    tagId: number | null,
    startTime: string,
    endTime: string | null
  ) => Promise<void>
}

export const useTaskStore = create<TaskState>((set, get) => ({
  activeTask: null,
  todayTasks: [],
  isLoading: false,

  setActiveTask: (task) => set({ activeTask: task }),
  setTodayTasks: (tasks) => set({ todayTasks: tasks }),
  setLoading: (v) => set({ isLoading: v }),

  refreshActive: async () => {
    const active = await window.api.tasks.getActive()
    set({ activeTask: active })
  },

  refreshTasks: async (date: string) => {
    set({ isLoading: true })
    const tasks = await window.api.tasks.getForRange(localDayStartISO(date), localDayEndISO(date))
    set({ todayTasks: tasks, isLoading: false })
  },

  startTask: async (title: string, tagId: number | null) => {
    await window.api.tasks.start(title, tagId)
    await get().refreshActive()
  },

  stopActiveTask: async () => {
    const { activeTask } = get()
    if (!activeTask) return
    await window.api.tasks.stop(activeTask.id)
    await get().refreshActive()
  },

  switchTask: async (title: string, tagId: number | null) => {
    await window.api.tasks.start(title, tagId)
    await get().refreshActive()
  },

  deleteTask: async (id: number) => {
    await window.api.tasks.delete(id)
  },

  updateTask: async (
    id: number,
    title: string,
    tagId: number | null,
    startTime: string,
    endTime: string | null
  ) => {
    await window.api.tasks.update(id, title, tagId, startTime, endTime)
  }
}))
