import React, { useEffect, useCallback } from 'react'
import { useUIStore } from '../store/uiStore'
import { useTaskStore } from '../store/taskStore'
import { useTagStore } from '../store/tagStore'
import { Timeline } from '../components/Timeline/Timeline'
import { localDateStr } from '../utils/dates'

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const todayStr = localDateStr()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = localDateStr(yesterday)

  if (dateStr === todayStr) return 'Today'
  if (dateStr === yesterdayStr) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function TimelinePage(): React.ReactElement {
  const { selectedDate, setSelectedDate } = useUIStore()
  const { todayTasks, refreshTasks, startTask } = useTaskStore()
  const { tags } = useTagStore()

  const load = useCallback(() => {
    refreshTasks(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    load()
  }, [load])

  const handleFillGaps = async () => {
    await window.api.tasks.fillGaps(selectedDate)
    load()
  }

  // Quick-start: most used task titles from today + yesterday
  const recentTitles = Array.from(
    new Set(todayTasks.map((t) => t.title).filter((t) => t !== 'Idle'))
  ).slice(0, 5)

  return (
    <div className="timeline-page">
      <div className="timeline-header">
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => setSelectedDate(offsetDate(selectedDate, -1))}>
            ‹
          </button>
          <span className="date-display">{formatDateDisplay(selectedDate)}</span>
          <button className="date-nav-btn" onClick={() => setSelectedDate(offsetDate(selectedDate, 1))}>
            ›
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {recentTitles.length > 0 && (
            <div className="quick-start">
              {recentTitles.map((title) => {
                const task = todayTasks.find((t) => t.title === title)
                return (
                  <button
                    key={title}
                    className="quick-start-btn"
                    onClick={() => startTask(title, task?.tagId ?? null)}
                    title={`Quick start: ${title}`}
                  >
                    {task?.tagColor && (
                      <span className="quick-start-dot" style={{ background: task.tagColor }} />
                    )}
                    {title}
                  </button>
                )
              })}
            </div>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleFillGaps} title="Fill time gaps with Idle">
            Fill Gaps
          </button>
        </div>
      </div>

      <Timeline tasks={todayTasks} selectedDate={selectedDate} onRefresh={load} />
    </div>
  )
}
