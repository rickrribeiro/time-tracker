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

const DAY_MIN = 1440

/** Read-only calendar event, positioned like a task block but in the events lane. */
export function TimelineEventBlock({ event, pixelsPerMinute, dayStart }: Props): React.ReactElement {
  const rawStart = toMinutes(new Date(event.startTime), dayStart)
  const rawEnd = event.endTime ? toMinutes(new Date(event.endTime), dayStart) : rawStart + 30

  // Clamp to the visible day so multi-day events fill only this day's slice.
  const continuesBefore = rawStart < 0
  const continuesAfter = rawEnd > DAY_MIN
  const startMin = Math.max(0, rawStart)
  const endMin = Math.min(DAY_MIN, rawEnd)
  const top = startMin * pixelsPerMinute
  const height = Math.max(16, (endMin - startMin) * pixelsPerMinute)

  const timeLabel = event.endTime ? `${fmt(event.startTime)}–${fmt(event.endTime)}` : fmt(event.startTime)
  const spanLabel = `${continuesBefore ? '↑ ' : ''}${timeLabel}${continuesAfter ? ' ↓' : ''}`
  const tooltip =
    `${event.title}${event.location ? ` · ${event.location}` : ''}\n${timeLabel}` +
    (continuesBefore || continuesAfter ? '\n(evento de vários dias)' : '')

  return (
    <div className={`timeline-event source-${event.source}`} style={{ top, height }} title={tooltip}>
      <div className="timeline-event-content">
        <div className="timeline-event-title">
          {event.source === 'google' ? '📅 ' : '📌 '}
          {event.title}
        </div>
        {height > 30 && <div className="timeline-event-time">{spanLabel}</div>}
      </div>
    </div>
  )
}
