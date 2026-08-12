import { localDateStr } from '../../utils/dates'

export interface PriorityDef {
  value: number
  label: string
  color: string
}

/** priority is an INTEGER column: higher = more important (sorts to the top). */
export const PRIORITIES: PriorityDef[] = [
  { value: 0, label: 'Nenhuma', color: 'var(--text-muted)' },
  { value: 1, label: 'Baixa', color: '#22c55e' },
  { value: 2, label: 'Média', color: '#f59e0b' },
  { value: 3, label: 'Alta', color: '#ef4444' }
]

export function priorityDef(value: number): PriorityDef {
  return PRIORITIES.find((p) => p.value === value) || PRIORITIES[0]
}

export const STATUSES = ['todo', 'doing', 'done'] as const
export type TodoStatus = (typeof STATUSES)[number]

export interface TodoTypeDef {
  value: string
  label: string
  icon: string
  color: string
}

/** Kind of task. `type` is a TEXT column; existing tasks default to 'projeto'. */
export const TODO_TYPES: TodoTypeDef[] = [
  { value: 'projeto', label: 'Projeto', icon: '📁', color: '#3b82f6' },
  { value: 'compra', label: 'A comprar', icon: '🛒', color: '#22c55e' },
  { value: 'urgente', label: 'Resolver urgente', icon: '🔥', color: '#ef4444' },
  { value: 'lembrete', label: 'Lembrete', icon: '🔔', color: '#a855f7' }
]

export function todoTypeDef(value: string | null | undefined): TodoTypeDef {
  return TODO_TYPES.find((t) => t.value === value) || TODO_TYPES[0]
}

export const STATUS_LABELS: Record<string, string> = {
  inbox: 'Caixa de entrada',
  todo: 'A fazer',
  doing: 'Fazendo',
  done: 'Concluído'
}

export interface DueMeta {
  label: string
  cls: 'due-overdue' | 'due-today' | 'due-future' | 'due-done'
}

/** Classify a due date relative to today (local time). */
export function dueMeta(dueDate: string | null, done: boolean): DueMeta | null {
  if (!dueDate) return null
  if (done) return { label: dueDate, cls: 'due-done' }
  const today = localDateStr(new Date())
  if (dueDate < today) return { label: 'Atrasada', cls: 'due-overdue' }
  if (dueDate === today) return { label: 'Hoje', cls: 'due-today' }
  return { label: dueDate, cls: 'due-future' }
}
