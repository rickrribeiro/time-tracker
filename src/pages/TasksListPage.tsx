import React, { useEffect, useState, useMemo } from 'react'
import { TaskWithTag } from '../types'
import { useTagStore } from '../store/tagStore'
import { useUIStore } from '../store/uiStore'
import { localDateStr } from '../utils/dates'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'active'
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatDateHeader(dateStr: string): string {
  const today = localDateStr()
  const yesterday = localDateStr(new Date(new Date().setDate(new Date().getDate() - 1)))
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
}

interface EditState {
  task: TaskWithTag
  title: string
  tagId: number | null
  startTime: string
  endTime: string
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TasksListPage(): React.ReactElement {
  const [tasks, setTasks] = useState<TaskWithTag[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editState, setEditState] = useState<EditState | null>(null)
  const { tags } = useTagStore()
  const { setSelectedDate, setPage } = useUIStore()

  async function load() {
    setLoading(true)
    const all = await window.api.tasks.getAll()
    setTasks(all)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.tagName ?? '').toLowerCase().includes(q)
    )
  }, [tasks, search])

  // Group by local date
  const grouped = useMemo(() => {
    const map = new Map<string, TaskWithTag[]>()
    for (const t of filtered) {
      const date = localDateStr(new Date(t.startTime))
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(t)
    }
    return map
  }, [filtered])

  function openEdit(task: TaskWithTag) {
    setEditState({
      task,
      title: task.title,
      tagId: task.tagId,
      startTime: toLocalInput(task.startTime),
      endTime: task.endTime ? toLocalInput(task.endTime) : ''
    })
  }

  async function handleSave() {
    if (!editState) return
    const startISO = new Date(editState.startTime).toISOString()
    const endISO = editState.endTime ? new Date(editState.endTime).toISOString() : null
    await window.api.tasks.update(editState.task.id, editState.title, editState.tagId, startISO, endISO)
    setEditState(null)
    load()
  }

  async function handleDelete() {
    if (!editState) return
    if (!confirm(`Delete "${editState.task.title}"?`)) return
    await window.api.tasks.delete(editState.task.id)
    setEditState(null)
    load()
  }

  function goToDate(dateStr: string) {
    setSelectedDate(dateStr)
    setPage('timeline')
  }

  const totalTasks = tasks.length
  const totalDays = grouped.size

  return (
    <div className="tasks-list-page">
      <div className="tasks-list-header">
        <div>
          <h2 className="tasks-list-title">All Tasks</h2>
          <span className="tasks-list-meta">{totalTasks} tasks across {totalDays} days</span>
        </div>
        <input
          className="tasks-list-search"
          type="text"
          placeholder="Search by title or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {editState && (
        <div className="task-edit-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Edit Task</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditState(null)}>✕</button>
          </div>
          <div className="form-row">
            <label>Title</label>
            <input
              type="text"
              value={editState.title}
              onChange={(e) => setEditState({ ...editState, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
          </div>
          <div className="form-row">
            <label>Tag</label>
            <select
              value={editState.tagId ?? ''}
              onChange={(e) => setEditState({ ...editState, tagId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">None</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Start</label>
            <input type="datetime-local" value={editState.startTime}
              onChange={(e) => setEditState({ ...editState, startTime: e.target.value })} />
          </div>
          <div className="form-row">
            <label>End</label>
            <input type="datetime-local" value={editState.endTime}
              onChange={(e) => setEditState({ ...editState, endTime: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>Save</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditState(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={handleDelete}>Delete</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          {search ? 'No tasks match your search.' : 'No tasks yet.'}
        </div>
      ) : (
        <div className="tasks-list-groups">
          {Array.from(grouped.entries()).map(([date, dayTasks]) => (
            <div key={date} className="tasks-day-group">
              <div className="tasks-day-header">
                <span className="tasks-day-label">{formatDateHeader(date)}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => goToDate(date)}
                  title="Open this day in Timeline"
                >
                  Open timeline →
                </button>
              </div>
              <div className="tasks-day-list">
                {dayTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`task-row ${editState?.task.id === task.id ? 'selected' : ''}`}
                    onClick={() => openEdit(task)}
                  >
                    <div
                      className="task-row-color"
                      style={{ background: task.tagColor || 'var(--bg-tertiary)' }}
                    />
                    <div className="task-row-main">
                      <span className="task-row-title">{task.title}</span>
                      {task.tagName && (
                        <span className="task-row-tag" style={{ background: task.tagColor + '33', color: task.tagColor || undefined }}>
                          {task.tagName}
                        </span>
                      )}
                    </div>
                    <div className="task-row-times">
                      <span>{formatTime(task.startTime)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>→</span>
                      <span>{task.endTime ? formatTime(task.endTime) : <span style={{ color: 'var(--success)' }}>active</span>}</span>
                    </div>
                    <div className="task-row-duration">
                      {formatDuration(task.startTime, task.endTime)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
