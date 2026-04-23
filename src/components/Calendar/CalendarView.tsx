import React, { useEffect, useState } from 'react'
import { DailyStats } from '../../types'
import { localDateStr, localDayStartISO } from '../../utils/dates'

interface Props {
  year: number
  month: number
  selectedDate: string
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

function heatmapColor(minutes: number, maxMinutes: number): string {
  if (minutes === 0 || maxMinutes === 0) return 'var(--bg-secondary)'
  const ratio = minutes / maxMinutes
  const alpha = 0.2 + ratio * 0.8
  return `rgba(99, 102, 241, ${alpha})`
}

export function CalendarView({
  year,
  month,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth
}: Props): React.ReactElement {
  const [statsMap, setStatsMap] = useState<Record<string, DailyStats>>({})
  const [maxMinutes, setMaxMinutes] = useState(0)

  const refreshStats = () => {
    const startStr = localDayStartISO(localDateStr(new Date(year, month, 1)))
    const endStr = localDayStartISO(localDateStr(new Date(year, month + 1, 1)))
    window.api.stats.daily(startStr, endStr).then((stats) => {
      const map: Record<string, DailyStats> = {}
      let max = 0
      for (const s of stats) {
        map[s.date] = s
        if (s.totalMinutes > max) max = s.totalMinutes
      }
      setStatsMap(map)
      setMaxMinutes(max)
    })
  }

  useEffect(() => {
    refreshStats()
  }, [year, month])

  const toggleWorkDay = async (date: string, current: number) => {
    const next = current === 1 ? 0 : 1
    await window.api.dayConfig.update(date, next)
    setStatsMap(prev => ({
      ...prev,
      [date]: { ...(prev[date] || { date, totalMinutes: 0, productiveMinutes: 0, semiProductiveMinutes: 0, productiveErosMinutes: 0 }), isWorkDay: next }
    }))
  }

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = firstDay.getDay()
  const today = localDateStr()

  const cells: { date: string; day: number; otherMonth: boolean }[] = []

  // Prev month padding
  const prevMonthDays = new Date(year, month, 0).getDate()
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({
      date: localDateStr(new Date(year, month - 1, prevMonthDays - i)),
      day: prevMonthDays - i,
      otherMonth: true
    })
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: localDateStr(new Date(year, month, d)), day: d, otherMonth: false })
  }

  // Next month padding
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: localDateStr(new Date(year, month + 1, d)), day: d, otherMonth: true })
  }

  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  function formatHours(minutes: number): string {
    if (!minutes) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h${m}m`
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <button className="date-nav-btn" onClick={onPrevMonth}>‹</button>
        <h2 className="calendar-title">{MONTH_NAMES[month]} {year}</h2>
        <button className="date-nav-btn" onClick={onNextMonth}>›</button>
      </div>

      <div className="calendar-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-day-header">{d}</div>
        ))}
        <div className="calendar-day-header">Banco de Horas</div>

        {weeks.map((week, weekIdx) => {
          let weekProd = 0
          let weekWorkDays = 0

          const dayCells = week.map((cell, i) => {
            const stats = cell.date ? statsMap[cell.date] : null
            const mins = stats?.totalMinutes || 0
            const isWork = stats?.isWorkDay === 1
            const bg = cell.date && !cell.otherMonth ? heatmapColor(mins, maxMinutes) : undefined

            if (stats && !cell.otherMonth) {
              weekProd += stats.productiveMinutes
              if (isWork) weekWorkDays++
            }

            return (
              <div
                key={i}
                className={[
                  'calendar-day',
                  cell.otherMonth ? 'other-month' : '',
                  cell.date === today ? 'today' : '',
                  cell.date === selectedDate ? 'selected' : ''
                ].join(' ')}
                style={bg ? { background: bg } : {}}
                onClick={() => cell.date && onSelectDate(cell.date)}
              >
                <div className="calendar-day-top">
                  <span className="calendar-day-num">{cell.day}</span>
                  {!cell.otherMonth && (
                    <input
                      type="checkbox"
                      checked={isWork}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleWorkDay(cell.date, isWork ? 1 : 0)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      title="Work Day"
                      style={{ width: 18, height: 18, cursor: 'pointer', zIndex: 10 }}
                    />
                  )}
                </div>
                {mins > 0 && stats && (
                  <div className="calendar-day-hours">
                    <div>T: {formatHours(mins)}</div>
                    <div>Productive: {formatHours(stats.productiveMinutes)}</div>
                    {stats.productiveErosMinutes > 0 && <div>ProductiveEros: {formatHours(stats.productiveErosMinutes)}</div>}
                    <div>Semi + productive: {formatHours(stats.productiveMinutes + (stats.semiProductiveMinutes || 0) + (stats.productiveErosMinutes || 0))}</div>
                  </div>
                )}
              </div>
            )
          })

          const balanceMins = weekProd - (weekWorkDays * 8 * 60)
          const absBalance = Math.abs(balanceMins)
          const balanceStr = formatHours(absBalance) || '0m'
          const balancePrefix = balanceMins < 0 ? '-' : '+'

          return (
            <React.Fragment key={weekIdx}>
              {dayCells}
              <div className="calendar-week-stats">
                <div className="week-stat-group">
                  <div className="week-stat-label">Productive</div>
                  <div className="week-stat-value">
                    {formatHours(weekProd) || '0m'}/{weekWorkDays * 8}h
                  </div>
                </div>
                <div className="week-stat-group" style={{ marginTop: 8 }}>
                  <div className="week-stat-label">Saldo</div>
                  <div className="week-stat-value" style={{ color: balanceMins < 0 ? '#ef4444' : '#10b981' }}>
                    {balancePrefix}{balanceStr}
                  </div>
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
