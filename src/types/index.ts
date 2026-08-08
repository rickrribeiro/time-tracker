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

export interface Todo {
  id: number
  title: string
  notes: string | null
  status: string // inbox | todo | doing | done
  priority: number
  dueDate: string | null
  projectId: number | null
  source: string // manual | quick-capture | github
  createdAt: string
}

export interface Project {
  id: number
  name: string
  description: string | null
  githubRepoUrl: string | null
  color: string
  archived: number
}

export interface Habit {
  id: number
  name: string
  frequency: string
  target: number
  active: number
}

export interface HabitEntry {
  habitId: number
  date: string
  completed: number
}

export interface GithubIssue {
  id: number
  number: number
  title: string
  state: string // open | closed
  repo: string // owner/name
  url: string | null
  labels: string | null // JSON array of label names
  milestone: string | null
  updatedAt: string | null
}

export type Page =
  // Time Tracker (existente)
  | 'timeline'
  | 'calendar'
  | 'tags'
  | 'dashboard'
  | 'tasks'
  // Dashboard central
  | 'home'
  // Organização
  | 'inbox'
  | 'todo'
  | 'habits'
  // Projetos
  | 'projects'
  | 'issues'
  // Finanças
  | 'finance-dashboard'
  | 'transactions'
  | 'budget'
  | 'investments'
  | 'reports'
  // Viagens
  | 'trips'
  | 'trip-monitoring'
  | 'destinations'
  | 'documents'
  | 'recommendations'
  // Configurações
  | 'settings'

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
      todos: {
        getAll: (status?: string) => Promise<Todo[]>
        create: (
          title: string,
          notes: string | null,
          status: string,
          source: string,
          priority?: number,
          dueDate?: string | null,
          projectId?: number | null
        ) => Promise<Todo>
        update: (
          id: number,
          title: string,
          notes: string | null,
          status: string,
          priority: number,
          dueDate: string | null,
          projectId: number | null
        ) => Promise<Todo>
        delete: (id: number) => Promise<void>
      }
      projects: {
        getAll: () => Promise<Project[]>
        create: (
          name: string,
          description: string | null,
          githubRepoUrl: string | null,
          color: string
        ) => Promise<Project>
        update: (
          id: number,
          name: string,
          description: string | null,
          githubRepoUrl: string | null,
          color: string,
          archived: number
        ) => Promise<Project>
        delete: (id: number) => Promise<void>
      }
      habits: {
        getAll: () => Promise<Habit[]>
        create: (name: string, frequency: string, target: number) => Promise<Habit>
        update: (id: number, name: string, frequency: string, target: number, active: number) => Promise<Habit>
        delete: (id: number) => Promise<void>
        getEntries: (date: string) => Promise<HabitEntry[]>
        getEntriesRange: (startDate: string, endDate: string) => Promise<HabitEntry[]>
        toggleEntry: (habitId: number, date: string, completed: number) => Promise<void>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
        getAll: () => Promise<Record<string, string>>
      }
      github: {
        getIssues: () => Promise<GithubIssue[]>
        sync: () => Promise<number>
      }
      on: {
        quickCapture: (cb: () => void) => () => void
      }
      app: {
        exportDb: () => Promise<boolean>
        importDb: () => Promise<boolean>
        openExternal: (url: string) => Promise<void>
      }
    }
  }
}
