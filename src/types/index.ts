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
  claudeCommand: string | null
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

export interface CalendarEvent {
  id: number
  title: string
  startTime: string
  endTime: string | null
  location: string | null
  source: string // manual | google
}

export interface Account {
  id: number
  name: string
  currency: string
  balance: number
}

export interface Category {
  id: number
  name: string
  type: string // income | expense
  color: string
}

export interface Transaction {
  id: number
  accountId: number | null
  categoryId: number | null
  amount: number
  currency: string
  type: string // income | expense
  description: string | null
  date: string // YYYY-MM-DD
}

export interface Budget {
  id: number
  categoryId: number | null
  month: string // YYYY-MM
  amount: number
}

export interface Investment {
  id: number
  name: string
  type: string | null
  amount: number
  currency: string
}

export interface Trip {
  id: number
  origin: string | null
  destination: string
  startDate: string | null
  endDate: string | null
  budget: number | null
  currency: string
  status: string
}

export interface FlightWatch {
  id: number
  tripId: number | null
  origin: string | null
  destination: string | null
  price: number | null
  currency: string
  lastChecked: string | null
}

export interface TripDocument {
  tripId: number
  item: string
  checked: number
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
  // IA
  | 'ai'
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
          color: string,
          claudeCommand: string | null
        ) => Promise<Project>
        update: (
          id: number,
          name: string,
          description: string | null,
          githubRepoUrl: string | null,
          color: string,
          archived: number,
          claudeCommand: string | null
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
      calendar: {
        upcoming: (fromISO: string, limit: number) => Promise<CalendarEvent[]>
        range: (startISO: string, endISO: string) => Promise<CalendarEvent[]>
        create: (title: string, startTime: string, endTime: string | null, location: string | null) => Promise<CalendarEvent>
        delete: (id: number) => Promise<void>
      }
      google: {
        connect: () => Promise<boolean>
        status: () => Promise<boolean>
        disconnect: () => Promise<void>
        sync: () => Promise<number>
      }
      accounts: {
        getAll: () => Promise<Account[]>
        create: (name: string, currency: string, balance: number) => Promise<Account>
        update: (id: number, name: string, currency: string, balance: number) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      categories: {
        getAll: () => Promise<Category[]>
        create: (name: string, type: string, color: string) => Promise<Category>
        delete: (id: number) => Promise<void>
      }
      transactions: {
        getAll: (month?: string) => Promise<Transaction[]>
        create: (accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) => Promise<Transaction>
        update: (id: number, accountId: number | null, categoryId: number | null, amount: number, currency: string, type: string, description: string | null, date: string) => Promise<void>
        delete: (id: number) => Promise<void>
        bulk: (rows: Omit<Transaction, 'id'>[]) => Promise<number>
      }
      budgets: {
        getForMonth: (month: string) => Promise<Budget[]>
        set: (categoryId: number, month: string, amount: number) => Promise<void>
      }
      investments: {
        getAll: () => Promise<Investment[]>
        create: (name: string, type: string | null, amount: number, currency: string) => Promise<Investment>
        delete: (id: number) => Promise<void>
      }
      pluggy: {
        sync: () => Promise<{ imported: number; skipped: number }>
        status: () => Promise<boolean>
      }
      trips: {
        getAll: () => Promise<Trip[]>
        create: (origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) => Promise<Trip>
        update: (id: number, origin: string | null, destination: string, startDate: string | null, endDate: string | null, budget: number | null, currency: string, status: string) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      flights: {
        getAll: () => Promise<FlightWatch[]>
        create: (tripId: number | null, origin: string | null, destination: string | null, price: number | null, currency: string) => Promise<FlightWatch>
        delete: (id: number) => Promise<void>
        search: (origin: string, destination: string, currency: string, date?: string | null) => Promise<number>
        refreshWatch: (id: number) => Promise<FlightWatch>
      }
      tripDocs: {
        get: (tripId: number) => Promise<TripDocument[]>
        set: (tripId: number, item: string, checked: number) => Promise<void>
      }
      ai: {
        run: (prompt: string, projectId?: number, model?: string) => Promise<string>
        runStream: (prompt: string, projectId?: number, model?: string) => Promise<string>
        onChunk: (cb: (text: string) => void) => () => void
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
