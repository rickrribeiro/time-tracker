import React, { useEffect, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore } from '../store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { PRIORITIES, STATUSES, STATUS_LABELS } from '../constants'

interface TodoEditorProps {
  todo: Todo
  onClose: () => void
}

/** Modal to edit every field of a todo. Shared by the TODO list and Inbox processing. */
export function TodoEditor({ todo, onClose }: TodoEditorProps): React.ReactElement {
  const { update } = useTodoStore()
  const { projects, refresh: refreshProjects } = useProjectStore()

  const [title, setTitle] = useState(todo.title)
  const [notes, setNotes] = useState(todo.notes ?? '')
  // Keep the real status (inbox stays inbox until the user explicitly promotes it).
  const [status, setStatus] = useState(todo.status)
  const [priority, setPriority] = useState(todo.priority)

  // Inbox items can be promoted; show 'inbox' as an option so it can also be kept.
  const statusOptions = todo.status === 'inbox' ? ['inbox', ...STATUSES] : STATUSES
  const [dueDate, setDueDate] = useState(todo.dueDate ?? '')
  const [projectId, setProjectId] = useState<number | null>(todo.projectId)

  // recurrence: '' (none) | 'everyNDays' | 'dayOfMonth' | 'afterCompletion'
  const parsedRec = (() => {
    try {
      return todo.recurrence ? (JSON.parse(todo.recurrence) as { type: string; n?: number; day?: number }) : null
    } catch {
      return null
    }
  })()
  const [recType, setRecType] = useState<string>(parsedRec?.type ?? '')
  const [recN, setRecN] = useState<number>(parsedRec?.n ?? 7)
  const [recDay, setRecDay] = useState<number>(parsedRec?.day ?? 1)

  useEffect(() => {
    if (projects.length === 0) refreshProjects()
  }, [])

  function buildRecurrence(): string | null {
    if (!recType) return null
    if (recType === 'everyNDays') return JSON.stringify({ type: 'everyNDays', n: recN })
    if (recType === 'afterCompletion') return JSON.stringify({ type: 'afterCompletion', n: recN })
    if (recType === 'dayOfMonth') return JSON.stringify({ type: 'dayOfMonth', day: recDay })
    return null
  }

  async function handleSave(): Promise<void> {
    if (!title.trim()) return
    await update({
      ...todo,
      title: title.trim(),
      notes: notes.trim() || null,
      status,
      priority,
      dueDate: dueDate || null,
      projectId,
      recurrence: buildRecurrence()
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>{todo.status === 'inbox' ? 'Processar item' : 'Editar tarefa'}</h2>

        <div className="editor-field">
          <label>Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="editor-field">
          <label>Notas</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="editor-row">
          <div className="editor-field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="editor-field">
            <label>Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-field">
            <label>Vencimento</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="editor-field">
            <label>Projeto</label>
            <select
              value={projectId ?? ''}
              onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Nenhum</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-field">
            <label>Repetir</label>
            <select value={recType} onChange={(e) => setRecType(e.target.value)}>
              <option value="">Não repetir</option>
              <option value="everyNDays">A cada N dias</option>
              <option value="dayOfMonth">Dia X do mês</option>
              <option value="afterCompletion">N dias após concluir</option>
            </select>
          </div>
          {(recType === 'everyNDays' || recType === 'afterCompletion') && (
            <div className="editor-field">
              <label>N (dias)</label>
              <input type="number" min={1} value={recN} onChange={(e) => setRecN(Number(e.target.value) || 1)} />
            </div>
          )}
          {recType === 'dayOfMonth' && (
            <div className="editor-field">
              <label>Dia do mês</label>
              <input type="number" min={1} max={31} value={recDay} onChange={(e) => setRecDay(Number(e.target.value) || 1)} />
            </div>
          )}
        </div>
        {recType && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Ao concluir, uma nova tarefa nasce automaticamente com o próximo prazo.
          </p>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
