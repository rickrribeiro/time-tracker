import type { StayFavorite, StayWatch, StayPricePoint, StaySearchHistory } from '../modules/travel-stays/types'

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
  studyNodeId: number | null
}

export interface TaskWithTag extends Task {
  tagName: string | null
  tagColor: string | null
  tagIsProductive: number | null
  secondaryTagName: string | null
  secondaryTagColor: string | null
  studyNodeTitle: string | null
  studyTopicId: number | null
  studyTopicName: string | null
  studyTopicColor: string | null
}

export interface StudyTopicHours {
  topicId: number
  topicName: string
  minutes: number
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
  aiGenerated: number // 0 | 1 — created by AI
  recurrence: string | null // JSON: { type, n?, day? } | null
  type: string // projeto | compra | urgente | lembrete
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
  localPath: string | null
  stage: string
  businessModel: string | null
  pricing: string | null
  audience: string | null
}
export interface ProjectMilestone {
  id: number
  projectId: number
  title: string
  targetDate: string | null
  doneAt: string | null
  createdAt: string
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
  completedAt?: string | null
}
export interface HabitCompletion {
  habitId: number
  name: string
  completedAt: string
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
  local: number // 1 = criada no app (ainda pode não estar no GitHub)
  body: string | null
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
export interface InvestmentHistory {
  id: number
  investmentId: number
  month: string // YYYY-MM
  amount: number
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

export interface Skill {
  id: string
  name: string
  description: string | null
  category: string | null
  tags: string // JSON array
  content: string
  isFavorite: number
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: string
  name: string
  description: string | null
  role: string | null
  systemPrompt: string
  defaultSkillIds: string // JSON array
  tags: string // JSON array
  isFavorite: number
  createdAt: string
  updatedAt: string
}

export interface PromptExecution {
  id: string
  createdAt: string
  agentId: string | null
  skillIds: string // JSON array
  userPrompt: string
  finalPrompt: string
  response: string | null
}

export interface Link {
  id: number
  title: string
  url: string
  checked: number
  tags: string // JSON array
  lastOpenedAt: string | null
  createdAt: string
}

export interface StudyTopic {
  id: number
  name: string
  category: string | null
  status: string // studying | planned | paused | completed
  targetDate: string | null
  priority: number
  color: string
  createdAt: string
}
export interface StudyNode {
  id: number
  topicId: number
  parentId: number | null
  title: string
  description: string | null
  status: string // todo | doing | done
  orderIndex: number
  estimatedHours: number | null
  completedAt: string | null
  createdAt: string
}
export interface StudyNote {
  id: number
  topicId: number
  nodeId: number | null
  content: string
  updatedAt: string
}
export interface StudyFlashcard {
  id: number
  topicId: number
  nodeId: number | null
  front: string
  back: string
  easeFactor: number
  intervalDays: number
  repetitions: number
  nextReviewAt: string | null
  lastReviewedAt: string | null
  createdAt: string
}
export interface StudyBundle {
  topic: StudyTopic
  nodes: StudyNode[]
  notes: StudyNote[]
  flashcards: StudyFlashcard[]
}
export interface StudyQuizAttempt {
  id: number
  topicId: number
  score: number
  total: number
  durationMs: number | null
  createdAt: string
}
export interface Contact {
  id: number
  name: string
  location: string | null
  birthday: string | null
  interests: string | null
  context: string | null
  lastContactAt: string | null
  nextFollowUp: string | null
  createdAt: string
}
export interface Rule {
  id: number
  type: string
  enabled: number
  params: string
  lastFiredAt: string | null
  createdAt: string
}
export interface ScheduledJob {
  id: number
  name: string
  prompt: string
  hour: number
  enabled: number
  lastRunAt: string | null
  createdAt: string
}
export interface Goal {
  id: number
  month: string // YYYY-MM
  title: string
  kind: string // free | project | study
  refId: number | null
  target: number
  current: number
  unit: string | null
  done: number
  createdAt: string
}
export type StudyIoResult = { ok: boolean; topicId?: number; message?: string; error?: string }

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
  | 'braindump'
  | 'habits'
  | 'knowledge'
  | 'goals'
  | 'automations'
  | 'weekly-review'
  | 'crm'
  // Estudos (Learning OS)
  | 'estudos'
  | 'estudos-topic'
  | 'estudos-review'
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
  | 'stays'
  | 'trip-monitoring'
  | 'destinations'
  | 'documents'
  | 'recommendations'
  // IA
  | 'ai'
  | 'ai-skills'
  | 'ai-agents'
  | 'ai-runner'
  | 'ai-history'
  // Configurações
  | 'settings'
  | 'links'

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
        start: (title: string, tagId: number | null, secondaryTagId: number | null, startTime?: string, studyNodeId?: number | null) => Promise<Task>
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
          endTime: string | null,
          studyNodeId?: number | null
        ) => Promise<Task>
        stopAll: (endTime: string) => Promise<void>
        fillGaps: (date: string) => Promise<void>
        studyHours: () => Promise<StudyTopicHours[]>
      }
      stats: {
        daily: (startDate: string, endDate: string) => Promise<DailyStats[]>
        byTag: (startDate: string, endDate: string) => Promise<TagStats[]>
      }
      dayConfig: {
        update: (date: string, isWorkDay: number) => Promise<void>
      }
      inbox: {
        ocr: (base64: string, ext: string) => Promise<{ ok: boolean; output?: string; error?: string }>
      }
      stays: {
        favorites: () => Promise<StayFavorite[]>
        addFavorite: (f: StayFavorite) => Promise<void>
        removeFavorite: (id: string) => Promise<void>
        watches: () => Promise<StayWatch[]>
        addWatch: (w: StayWatch) => Promise<void>
        updateWatchPrice: (id: string, current: number, best: number, at: string) => Promise<void>
        removeWatch: (id: string) => Promise<void>
        priceHistory: (watchId: string) => Promise<StayPricePoint[]>
        addPricePoint: (p: StayPricePoint) => Promise<void>
        searchHistory: () => Promise<StaySearchHistory[]>
        addSearchHistory: (filters: string) => Promise<void>
      }
      contacts: {
        getAll: () => Promise<Contact[]>
        create: (name: string, location: string | null, birthday: string | null, interests: string | null, context: string | null, nextFollowUp: string | null) => Promise<Contact>
        update: (id: number, name: string, location: string | null, birthday: string | null, interests: string | null, context: string | null, lastContactAt: string | null, nextFollowUp: string | null) => Promise<Contact>
        log: (id: number) => Promise<Contact>
        delete: (id: number) => Promise<void>
      }
      rules: {
        getAll: () => Promise<Rule[]>
        create: (type: string, params: string) => Promise<Rule>
        update: (id: number, enabled: number, params: string) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      jobs: {
        getAll: () => Promise<ScheduledJob[]>
        create: (name: string, prompt: string, hour: number) => Promise<ScheduledJob>
        update: (id: number, name: string, prompt: string, hour: number, enabled: number) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      goals: {
        getForMonth: (month: string) => Promise<Goal[]>
        create: (month: string, title: string, kind: string, refId: number | null, target: number, unit: string | null) => Promise<Goal>
        update: (id: number, title: string, target: number, current: number, unit: string | null, done: number) => Promise<Goal>
        delete: (id: number) => Promise<void>
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
          projectId?: number | null,
          aiGenerated?: number,
          recurrence?: string | null,
          type?: string
        ) => Promise<Todo>
        update: (
          id: number,
          title: string,
          notes: string | null,
          status: string,
          priority: number,
          dueDate: string | null,
          projectId: number | null,
          recurrence?: string | null,
          type?: string
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
          claudeCommand: string | null,
          localPath?: string | null,
          stage?: string,
          businessModel?: string | null,
          pricing?: string | null,
          audience?: string | null
        ) => Promise<Project>
        update: (
          id: number,
          name: string,
          description: string | null,
          githubRepoUrl: string | null,
          color: string,
          archived: number,
          claudeCommand: string | null,
          localPath?: string | null,
          stage?: string,
          businessModel?: string | null,
          pricing?: string | null,
          audience?: string | null
        ) => Promise<Project>
        setStage: (id: number, stage: string) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      milestones: {
        getAll: () => Promise<ProjectMilestone[]>
        create: (projectId: number, title: string, targetDate: string | null) => Promise<ProjectMilestone>
        toggle: (id: number, done: number) => Promise<void>
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
        completionsForDate: (date: string) => Promise<HabitCompletion[]>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
        getAll: () => Promise<Record<string, string>>
      }
      github: {
        getIssues: () => Promise<GithubIssue[]>
        sync: () => Promise<number>
        createLocal: (repo: string, title: string, body: string | null) => Promise<GithubIssue>
        deleteIssue: (id: number) => Promise<void>
        createOnGithub: (id: number) => Promise<GithubIssue>
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
        accounts: () => Promise<string[]>
        disconnect: () => Promise<void>
        disconnectAccount: (email: string) => Promise<void>
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
        history: () => Promise<InvestmentHistory[]>
        create: (name: string, type: string | null, amount: number, currency: string) => Promise<Investment>
        setValue: (investmentId: number, month: string, amount: number) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      pluggy: {
        sync: () => Promise<{ imported: number; skipped: number }>
        status: () => Promise<boolean>
        connectToken: () => Promise<string>
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
        runStream: (prompt: string, projectId?: number, model?: string, runId?: string) => Promise<string>
        start: (params: {
          prompt: string
          projectId?: number | null
          model?: string
          agentId?: string | null
          skillIds?: string
          userPrompt?: string
          save?: boolean
          permission?: 'allowlist' | 'execute'
        }) => Promise<string>
        getRun: (runId: string) => Promise<{ status: 'running' | 'done' | 'error' | 'cancelled'; output: string; error: string | null } | null>
        cancel: (runId: string) => Promise<boolean>
        onChunk: (cb: (runId: string | undefined, text: string) => void) => () => void
        onDone: (cb: (payload: { runId: string; ok: boolean; output: string; error: string | null }) => void) => () => void
      }
      skills: {
        getAll: () => Promise<Skill[]>
        create: (name: string, description: string | null, category: string | null, tags: string, content: string) => Promise<Skill>
        update: (id: string, name: string, description: string | null, category: string | null, tags: string, content: string) => Promise<Skill>
        delete: (id: string) => Promise<void>
        toggleFavorite: (id: string) => Promise<void>
        export: (id: string) => Promise<boolean>
        import: () => Promise<Skill | null>
      }
      agents: {
        getAll: () => Promise<Agent[]>
        create: (name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) => Promise<Agent>
        update: (id: string, name: string, description: string | null, role: string | null, systemPrompt: string, defaultSkillIds: string, tags: string) => Promise<Agent>
        delete: (id: string) => Promise<void>
        toggleFavorite: (id: string) => Promise<void>
        export: (id: string) => Promise<boolean>
        import: () => Promise<Agent | null>
      }
      executions: {
        getAll: () => Promise<PromptExecution[]>
        create: (agentId: string | null, skillIds: string, userPrompt: string, finalPrompt: string, response: string | null) => Promise<PromptExecution>
        delete: (id: string) => Promise<void>
      }
      links: {
        getAll: () => Promise<Link[]>
        create: (title: string, url: string, tags?: string) => Promise<Link>
        update: (id: number, title: string, url: string, tags?: string) => Promise<void>
        setChecked: (id: number, checked: number) => Promise<void>
        markOpened: (id: number) => Promise<void>
        delete: (id: number) => Promise<void>
      }
      study: {
        topics: () => Promise<StudyTopic[]>
        createTopic: (name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) => Promise<StudyTopic>
        updateTopic: (id: number, name: string, category: string | null, status: string, targetDate: string | null, priority: number, color: string) => Promise<StudyTopic>
        deleteTopic: (id: number) => Promise<void>
        nodes: (topicId: number) => Promise<StudyNode[]>
        allNodes: () => Promise<StudyNode[]>
        allNotes: () => Promise<StudyNote[]>
        createNode: (topicId: number, parentId: number | null, title: string, description: string | null, estimatedHours: number | null) => Promise<StudyNode>
        updateNode: (id: number, title: string, description: string | null, status: string, estimatedHours: number | null) => Promise<StudyNode>
        deleteNode: (id: number) => Promise<void>
        moveNode: (id: number, dir: 'up' | 'down') => Promise<void>
        reorderNode: (id: number, newParentId: number | null, newIndex: number) => Promise<void>
        getNote: (topicId: number, nodeId: number | null) => Promise<StudyNote | null>
        saveNote: (topicId: number, nodeId: number | null, content: string) => Promise<StudyNote>
        flashcards: (topicId?: number) => Promise<StudyFlashcard[]>
        due: (nowISO: string) => Promise<StudyFlashcard[]>
        createFlashcard: (topicId: number, nodeId: number | null, front: string, back: string) => Promise<StudyFlashcard>
        updateFlashcard: (id: number, front: string, back: string) => Promise<StudyFlashcard>
        deleteFlashcard: (id: number) => Promise<void>
        reviewFlashcard: (id: number, easeFactor: number, intervalDays: number, repetitions: number, nextReviewAt: string, lastReviewedAt: string) => Promise<StudyFlashcard>
        quizAttempts: (topicId: number) => Promise<StudyQuizAttempt[]>
        saveQuizAttempt: (topicId: number, score: number, total: number, durationMs: number | null) => Promise<StudyQuizAttempt>
        exportMarkdown: (topicId: number) => Promise<StudyIoResult>
        exportJson: (topicId: number) => Promise<boolean>
        importJson: () => Promise<StudyIoResult>
        exportFolder: (topicId: number) => Promise<StudyIoResult>
        importFolder: () => Promise<StudyIoResult>
      }
      on: {
        quickCapture: (cb: () => void) => () => void
        calendarUpdated: (cb: () => void) => () => void
      }
      app: {
        exportDb: () => Promise<{ ok: boolean; target?: 'local' | 'drive'; message?: string; error?: string; link?: string | null }>
        importDb: () => Promise<boolean>
        snapshots: () => Promise<{ name: string; path: string; date: string; size: number }[]>
        restoreSnapshot: (snapPath: string) => Promise<boolean>
        openExternal: (url: string) => Promise<void>
      }
    }
  }
}
