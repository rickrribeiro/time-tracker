export interface Tag {
  id: number
  name: string
  color: string
  isProductive: number // 1 = true, 0 = false, 2 = semi-productive, 3 = productive-eros
}

export interface Task {
  id: number
  title: string
  tagId: number | null
  secondaryTagId: number | null
  startTime: string
  endTime: string | null
}

export interface TaskWithTag extends Task {
  tagName: string | null
  tagColor: string | null
  tagIsProductive: number | null
  secondaryTagName: string | null
  secondaryTagColor: string | null
}

export interface DailyStats {
  date: string
  totalMinutes: number
  productiveMinutes: number
  semiProductiveMinutes: number
  productiveErosMinutes: number
  isWorkDay: number
}

export interface TagStats {
  tagId: number | null
  tagName: string | null
  tagColor: string | null
  isProductive: number | null
  totalMinutes: number
}

export type Page = 'timeline' | 'calendar' | 'tags' | 'dashboard' | 'tasks'

declare global {
  interface Window {
    api: {
      tags: {
        getAll: () => Promise<Tag[]>
        create: (name: string, color: string, isProductive: number) => Promise<Tag>
        update: (id: number, name: string, color: string, isProductive: number) => Promise<Tag>
        delete: (id: number) => Promise<void>
      }
      tasks: {
        getAll: () => Promise<TaskWithTag[]>
        getForRange: (startDate: string, endDate: string) => Promise<TaskWithTag[]>
        getActive: () => Promise<TaskWithTag | null>
        start: (title: string, tagId: number | null, secondaryTagId: number | null, startTime?: string) => Promise<Task>
        stop: (id: number, endTime?: string) => Promise<Task>
        update: (
          id: number,
          title: string,
          tagId: number | null,
          secondaryTagId: number | null,
          startTime: string,
          endTime: string | null
        ) => Promise<Task>
        delete: (id: number) => Promise<void>
        add: (
          title: string,
          tagId: number | null,
          secondaryTagId: number | null,
          startTime: string,
          endTime: string | null
        ) => Promise<Task>
        stopAll: (endTime: string) => Promise<void>
        fillGaps: (date: string) => Promise<void>
      }
      stats: {
        daily: (startDate: string, endDate: string) => Promise<DailyStats[]>
        byTag: (startDate: string, endDate: string) => Promise<TagStats[]>
      }
      dayConfig: {
        update: (date: string, isWorkDay: number) => Promise<void>
      }
      app: {
        exportDb: () => Promise<boolean>
      }
    }
  }
}
