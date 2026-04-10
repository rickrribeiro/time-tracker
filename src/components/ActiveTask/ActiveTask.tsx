import React, { useEffect, useRef, useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useTagStore } from '../../store/tagStore'

function formatDuration(startTime: string): string {
  const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function ActiveTask(): React.ReactElement {
  const { activeTask, startTask, stopActiveTask, switchTask } = useTaskStore()
  const { tags } = useTagStore()
  const [timer, setTimer] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newTagId, setNewTagId] = useState<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (activeTask) {
      const update = () => setTimer(formatDuration(activeTask.startTime))
      update()
      intervalRef.current = setInterval(update, 1000)
    } else {
      setTimer('')
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeTask])

  const handleStart = async () => {
    if (!newTitle.trim()) return
    await startTask(newTitle.trim(), newTagId)
    setNewTitle('')
  }

  const handleSwitch = async () => {
    if (!newTitle.trim()) return
    await switchTask(newTitle.trim(), newTagId)
    setNewTitle('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (activeTask) handleSwitch()
      else handleStart()
    }
  }

  return (
    <div className="active-task-bar">
      {activeTask ? (
        <>
          <div className="active-task-info">
            <div className="active-task-dot" />
            <span className="active-task-title">{activeTask.title}</span>
            {activeTask.tagName && (
              <span
                className="active-task-tag"
                style={{ background: activeTask.tagColor || '#6b7280' }}
              >
                {activeTask.tagName}
              </span>
            )}
          </div>
          <div className="active-task-timer">{timer}</div>
          <div className="active-task-controls">
            <div className="task-input-row">
              <input
                type="text"
                placeholder="Switch to..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <select
                value={newTagId ?? ''}
                onChange={(e) => setNewTagId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">No tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={handleSwitch}>
                Switch
              </button>
            </div>
            <button className="btn btn-danger" onClick={stopActiveTask}>
              ■ Stop
            </button>
          </div>
        </>
      ) : (
        <div className="task-input-row" style={{ flex: 1 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No active task</span>
          <input
            type="text"
            placeholder="What are you working on?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ flex: 1 }}
            autoFocus
          />
          <select
            value={newTagId ?? ''}
            onChange={(e) => setNewTagId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No tag</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={handleStart}>
            ▶ Start
          </button>
        </div>
      )}
    </div>
  )
}
