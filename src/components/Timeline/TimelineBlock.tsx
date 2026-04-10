import React, { useRef, useState } from 'react'
import { TaskWithTag } from '../../types'

interface Props {
  task: TaskWithTag
  pixelsPerMinute: number
  dayStart: Date
  selected: boolean
  onClick: () => void
  onUpdate: (startTime: string, endTime: string | null) => void
}

function toMinutes(date: Date, base: Date): number {
  return (date.getTime() - base.getTime()) / 60000
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TimelineBlock({
  task,
  pixelsPerMinute,
  dayStart,
  selected,
  onClick,
  onUpdate
}: Props): React.ReactElement {
  const startMin = toMinutes(new Date(task.startTime), dayStart)
  const endMin = task.endTime
    ? toMinutes(new Date(task.endTime), dayStart)
    : toMinutes(new Date(), dayStart)

  const top = Math.max(0, startMin * pixelsPerMinute)
  const height = Math.max(4, (endMin - startMin) * pixelsPerMinute)

  const color = task.tagColor || '#6366f1'

  const dragRef = useRef<{ startY: number; origStart: Date; origEnd: Date | null } | null>(null)
  const resizeRef = useRef<{ startY: number; origEnd: Date } | null>(null)

  const handleDragStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    dragRef.current = {
      startY: e.clientY,
      origStart: new Date(task.startTime),
      origEnd: task.endTime ? new Date(task.endTime) : null
    }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const deltaMin = (ev.clientY - dragRef.current.startY) / pixelsPerMinute
      const newStart = new Date(dragRef.current.origStart.getTime() + deltaMin * 60000)
      const newEnd = dragRef.current.origEnd
        ? new Date(dragRef.current.origEnd.getTime() + deltaMin * 60000)
        : null
      // Clamp to day
      if (newStart < dayStart) return
      onUpdate(newStart.toISOString(), newEnd?.toISOString() ?? null)
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!task.endTime) return
    resizeRef.current = {
      startY: e.clientY,
      origEnd: new Date(task.endTime)
    }

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const deltaMin = (ev.clientY - resizeRef.current.startY) / pixelsPerMinute
      const newEnd = new Date(resizeRef.current.origEnd.getTime() + deltaMin * 60000)
      const start = new Date(task.startTime)
      if (newEnd.getTime() - start.getTime() < 60000) return // min 1 min
      onUpdate(task.startTime, newEnd.toISOString())
    }

    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className={`timeline-block ${selected ? 'selected' : ''}`}
      style={{
        top,
        height,
        background: color,
        opacity: task.endTime ? 1 : 0.9
      }}
      onClick={onClick}
      onMouseDown={handleDragStart}
    >
      <div className="timeline-block-content">
        {height > 20 && (
          <div className="timeline-block-title">{task.title}</div>
        )}
        {height > 34 && (
          <div className="timeline-block-time">
            {formatTime(task.startTime)}
            {task.endTime ? ` – ${formatTime(task.endTime)}` : ' (active)'}
          </div>
        )}
      </div>
      {task.endTime && (
        <div className="timeline-block-resize" onMouseDown={handleResizeStart} />
      )}
    </div>
  )
}
