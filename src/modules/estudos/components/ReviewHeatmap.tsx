import React, { useEffect, useMemo, useState } from 'react'
import { localDateStr, localDayStartISO } from '@/utils/dates'
import { useStudyStore } from '../store/studyStore'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

function heatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'var(--bg-secondary)'
  const alpha = 0.2 + (count / max) * 0.8
  return `rgba(99, 102, 241, ${alpha})`
}

/** Heatmap mensal de quantos flashcards foram revisados em cada dia. */
export function ReviewHeatmap(): React.ReactElement {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-based
  const { reviewCounts, refreshReviewCounts } = useStudyStore()

  useEffect(() => {
    const startStr = localDayStartISO(localDateStr(new Date(year, month, 1)))
    const endStr = localDayStartISO(localDateStr(new Date(year, month + 1, 1)))
    refreshReviewCounts(startStr, endStr)
  }, [year, month, refreshReviewCounts])

  const prevMonth = (): void => {
    if (month === 0) { setYear(year - 1); setMonth(11) } else setMonth(month - 1)
  }
  const nextMonth = (): void => {
    if (month === 11) { setYear(year + 1); setMonth(0) } else setMonth(month + 1)
  }

  const { cells, max, total } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startOffset = firstDay.getDay()
    const list: { date: string | null; day: number }[] = []
    for (let i = 0; i < startOffset; i++) list.push({ date: null, day: 0 })
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ date: localDateStr(new Date(year, month, d)), day: d })
    }
    let mx = 0
    let tot = 0
    for (const c of list) {
      if (!c.date) continue
      const n = reviewCounts[c.date] ?? 0
      if (n > mx) mx = n
      tot += n
    }
    return { cells: list, max: mx, total: tot }
  }, [year, month, reviewCounts])

  const today = localDateStr()

  return (
    <div className="chart-section" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>📊 Revisões por dia</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} cards revisados neste mês</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 130, textAlign: 'center' }}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>›</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', paddingBottom: 2 }}>
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell.date) return <div key={i} />
          const count = reviewCounts[cell.date] ?? 0
          return (
            <div
              key={i}
              title={`${cell.date}: ${count} revisão(ões)`}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 6,
                background: heatColor(count, max),
                border: cell.date === today ? '1.5px solid var(--accent, #6366f1)' : '1px solid var(--border, rgba(255,255,255,0.06))',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                color: count > 0 ? '#fff' : 'var(--text-muted)'
              }}
            >
              <span style={{ opacity: 0.8 }}>{cell.day}</span>
              {count > 0 && <span style={{ fontSize: 12, fontWeight: 700 }}>{count}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
