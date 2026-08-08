import React, { useEffect, useMemo, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore } from '../store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { TodoEditor } from '../components/TodoEditor'
import { PRIORITIES, STATUSES, STATUS_LABELS, priorityDef, dueMeta } from '../constants'
import { localDateStr } from '../../../utils/dates'

type StatusFilter = 'all' | 'todo' | 'doing' | 'done'

export function TodoPage(): React.ReactElement {
  const { todos, refresh, create, setStatus, update, remove } = useTodoStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all')
  const [editing, setEditing] = useState<Todo | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    refresh()
    refreshProjects()
  }, [])

  const projectName = (id: number | null): string | null =>
    id === null ? null : projects.find((p) => p.id === id)?.name ?? null

  const items = useMemo(() => {
    const q = search.trim().toLowerCase()
    return todos
      .filter((t) => t.status !== 'inbox')
      .filter((t) => statusFilter === 'all' || t.status === statusFilter)
      .filter((t) => projectFilter === 'all' || t.projectId === projectFilter)
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        const doneA = a.status === 'done' ? 1 : 0
        const doneB = b.status === 'done' ? 1 : 0
        if (doneA !== doneB) return doneA - doneB // done last
        if (b.priority !== a.priority) return b.priority - a.priority // higher priority first
        // due date asc, nulls last
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [todos, search, statusFilter, projectFilter])

  async function handleAdd(): Promise<void> {
    const v = text.trim()
    if (!v) return
    await create(v, 'todo')
    setText('')
  }

  function cyclePriority(t: Todo): void {
    const next = (t.priority + 1) % PRIORITIES.length
    update({ ...t, priority: next })
  }

  function postpone(t: Todo): void {
    const base = t.dueDate ? new Date(`${t.dueDate}T00:00:00`) : new Date()
    base.setDate(base.getDate() + 1)
    update({ ...t, dueDate: localDateStr(base) })
  }

  // Keyboard shortcuts on the list: ↑↓ select, Space toggle done, p postpone, e edit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (editing) return
      if (items.length === 0) return

      const idx = items.findIndex((t) => t.id === selectedId)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedId(items[Math.min(items.length - 1, idx < 0 ? 0 : idx + 1)].id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedId(items[Math.max(0, idx < 0 ? 0 : idx - 1)].id)
      } else if (idx >= 0) {
        const t = items[idx]
        if (e.key === ' ' || e.key === 'x') {
          e.preventDefault()
          setStatus(t.id, t.status === 'done' ? 'todo' : 'done')
        } else if (e.key === 'p') {
          e.preventDefault()
          postpone(t)
        } else if (e.key === 'e') {
          e.preventDefault()
          setEditing(t)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedId, editing])

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>✅ TODO</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {items.length} {items.length === 1 ? 'tarefa' : 'tarefas'}
            <span style={{ color: 'var(--text-muted)', marginLeft: 10 }}>
              ↑↓ navegar · espaço concluir · p adiar · e editar
            </span>
          </p>
        </div>
      </div>

      <div className="quick-add-row">
        <input
          type="text"
          placeholder="Nova tarefa"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn-primary" onClick={handleAdd}>
          + Adicionar
        </button>
      </div>

      <div className="todo-toolbar">
        <input
          type="text"
          placeholder="🔍 Buscar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">Todos os status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="list-stack">
        {items.length === 0 && <div className="empty-hint">Nenhuma tarefa encontrada.</div>}
        {items.map((t) => {
          const done = t.status === 'done'
          const prio = priorityDef(t.priority)
          const due = dueMeta(t.dueDate, done)
          const proj = projectName(t.projectId)
          return (
            <div
              key={t.id}
              className={`list-row ${selectedId === t.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(t.id)}
            >
              <input
                type="checkbox"
                checked={done}
                onChange={() => setStatus(t.id, done ? 'todo' : 'done')}
              />
              <button
                className="priority-dot"
                title={`Prioridade: ${prio.label} (clique p/ alternar)`}
                style={{ background: prio.color }}
                onClick={() => cyclePriority(t)}
              />
              <span
                className="list-row-title"
                style={{
                  textDecoration: done ? 'line-through' : 'none',
                  color: done ? 'var(--text-muted)' : 'var(--text-primary)'
                }}
              >
                {t.title}
              </span>
              {proj && <span className="project-chip">{proj}</span>}
              {due && <span className={`due-badge ${due.cls}`}>{due.label}</span>}
              <select
                value={t.status}
                onChange={(e) => setStatus(t.id, e.target.value)}
                style={{ fontSize: 12, padding: '2px 6px' }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <div className="list-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(t)}>
                  Editar
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>
                  Excluir
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && <TodoEditor todo={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
