import React from 'react'
import { CalendarEvent } from '@/types'

function toMinutes(date: Date, base: Date): number {
  return (date.getTime() - base.getTime()) / 60000
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  event: CalendarEvent
  pixelsPerMinute: number
  dayStart: Date
}

/** Read-only calendar event, positioned like a task block but in the events lane. */
export function TimelineEventBlock({ event, pixelsPerMinute, dayStart }: Props): React.ReactElement {
  const startMin = toMinutes(new Date(event.startTime), dayStart)
  const endMin = event.endTime ? toMinutes(new Date(event.endTime), dayStart) : startMin + 30
  const top = Math.max(0, startMin * pixelsPerMinute)
  const height = Math.max(16, (endMin - startMin) * pixelsPerMinute)

  const timeLabel = event.endTime ? `${fmt(event.startTime)}–${fmt(event.endTime)}` : fmt(event.startTime)
  const tooltip = `${event.title}${event.location ? ` · ${event.location}` : ''}\n${timeLabel}`

  return (
    <div className={`timeline-event source-${event.source}`} style={{ top, height }} title={tooltip}>
      <div className="timeline-event-content">
        <div className="timeline-event-title">
          {event.source === 'google' ? '📅 ' : '📌 '}
          {event.title}
        </div>
        {height > 30 && <div className="timeline-event-time">{timeLabel}</div>}
      </div>
    </div>
  )
}
