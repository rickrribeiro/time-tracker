import React, { useEffect, useRef, useState } from 'react'
import { TaskWithTag } from '../../types'
import { TimelineBlock } from './TimelineBlock'
import { useTaskStore } from '../../store/taskStore'
import { useTagStore } from '../../store/tagStore'
import { localDateStr } from '../../utils/dates'

const PIXELS_PER_MINUTE = 1.5
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface Props {
  tasks: TaskWithTag[]
  selectedDate: string
  onRefresh: () => void
}

interface FormState {
  task: TaskWithTag | null // null = creating new
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

export function Timeline({ tasks, selectedDate, onRefresh }: Props): React.ReactElement {
  const { updateTask, deleteTask } = useTaskStore()
  const { tags } = useTagStore()
  const [selected, setSelected] = useState<number | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const dayStart = new Date(`${selectedDate}T00:00:00`)
  const isToday = selectedDate === localDateStr()

  useEffect(() => {
    if (!isToday || !containerRef.current) return
    const nowMin = (Date.now() - dayStart.getTime()) / 60000
    containerRef.current.scrollTop = Math.max(0, nowMin * PIXELS_PER_MINUTE - 200)
  }, [selectedDate])

  const nowMinutes = isToday ? (Date.now() - dayStart.getTime()) / 60000 : null

  function openEdit(task: TaskWithTag) {
    setSelected(task.id)
    setForm({
      task,
      title: task.title,
      tagId: task.tagId,
      startTime: toLocalInput(task.startTime),
      endTime: task.endTime ? toLocalInput(task.endTime) : ''
    })
  }

  function openCreate() {
    // Pre-fill start time: now if today, else 09:00 of selected date
    const defaultStart = isToday
      ? toLocalInput(new Date().toISOString())
      : `${selectedDate}T09:00`
    setSelected(null)
    setForm({ task: null, title: '', tagId: null, startTime: defaultStart, endTime: '' })
  }

  function closeForm() {
    setForm(null)
    setSelected(null)
  }

  async function handleSave() {
    if (!form || !form.title.trim()) return
    if (!form.startTime) return

    const startISO = new Date(form.startTime).toISOString()
    const endISO = form.endTime ? new Date(form.endTime).toISOString() : null

    try {
      if (form.task) {
        await updateTask(form.task.id, form.title.trim(), form.tagId, startISO, endISO)
      } else {
        await window.api.tasks.add(form.title.trim(), form.tagId, startISO, endISO)
      }
      closeForm()
      onRefresh()
    } catch (err) {
      console.error('Failed to save task:', err)
      alert('Error saving task: ' + String(err))
    }
  }

  async function handleDelete() {
    if (!form?.task) return
    await deleteTask(form.task.id)
    closeForm()
    onRefresh()
  }

  async function handleBlockUpdate(task: TaskWithTag, startTime: string, endTime: string | null) {
    await updateTask(task.id, task.title, task.tagId, startTime, endTime)
    onRefresh()
  }

  const isCreating = form !== null && form.task === null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>
      {form && (
        <div className="task-edit-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{isCreating ? 'New Task' : 'Edit Task'}</h3>
            <button className="btn btn-secondary btn-sm" onClick={closeForm}>✕</button>
          </div>

          <div className="form-row">
            <label>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
              placeholder="Task name"
            />
          </div>
          <div className="form-row">
            <label>Tag</label>
            <select
              value={form.tagId ?? ''}
              onChange={(e) => setForm({ ...form, tagId: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">None</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Start</label>
            <input
              type="datetime-local"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <div className="form-row">
            <label>End</label>
            <input
              type="datetime-local"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              placeholder="Leave empty if still active"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              {isCreating ? 'Create' : 'Save'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={closeForm}>Cancel</button>
            {!isCreating && (
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          + Add Task
        </button>
      </div>

      <div className="timeline-container" ref={containerRef}>
        <div className="timeline-scroll" style={{ height: 1440 * PIXELS_PER_MINUTE }}>
          {HOURS.map((h) => (
            <React.Fragment key={h}>
              <div className="timeline-hour-label" style={{ top: h * 60 * PIXELS_PER_MINUTE }}>
                {String(h).padStart(2, '0')}:00
              </div>
              <div className="timeline-hour-line" style={{ top: h * 60 * PIXELS_PER_MINUTE }} />
            </React.Fragment>
          ))}

          {nowMinutes !== null && (
            <div className="timeline-now-line" style={{ top: nowMinutes * PIXELS_PER_MINUTE, left: 60 }}>
              <div className="timeline-now-dot" />
            </div>
          )}

          <div className="timeline-tasks">
            {tasks.map((task) => (
              <TimelineBlock
                key={task.id}
                task={task}
                pixelsPerMinute={PIXELS_PER_MINUTE}
                dayStart={dayStart}
                selected={selected === task.id}
                onClick={() => openEdit(task)}
                onUpdate={(st, et) => handleBlockUpdate(task, st, et)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
