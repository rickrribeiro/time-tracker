import React, { useEffect, useMemo, useState } from 'react'
import { useHabitStore } from '../store/habitStore'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function shiftMonthKey(k: string, delta: number): string {
  const [y, m] = k.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(k: string): string {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function HabitStats(): React.ReactElement {
  const { habits } = useHabitStore()
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [done, setDone] = useState<Set<string>>(new Set())

  const active = useMemo(() => habits.filter((h) => h.active === 1), [habits])

  const [y, m] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const now = new Date()
  const isCurrent = now.getFullYear() === y && now.getMonth() === m - 1
  const elapsed = isCurrent ? now.getDate() : daysInMonth
  const isFuture = new Date(y, m - 1, 1) > new Date(now.getFullYear(), now.getMonth(), 1)

  useEffect(() => {
    const start = `${monthKey}-01`
    const end = `${monthKey}-${String(daysInMonth).padStart(2, '0')}`
    window.api.habits.getEntriesRange(start, end).then((entries) => {
      setDone(new Set(entries.filter((e) => e.completed === 1).map((e) => `${e.habitId}|${e.date}`)))
    })
  }, [monthKey, daysInMonth])

  const dateStr = (d: number): string => `${monthKey}-${String(d).padStart(2, '0')}`
  const weekdayOf = (d: number): number => new Date(y, m - 1, d).getDay()
  const isDone = (habitId: number, d: number): boolean => done.has(`${habitId}|${dateStr(d)}`)

  // per-habit completion over elapsed days
  function habitRate(habitId: number): number {
    if (elapsed === 0) return 0
    let c = 0
    for (let d = 1; d <= elapsed; d++) if (isDone(habitId, d)) c++
    return Math.round((c / elapsed) * 100)
  }

  // completion by weekday: completed / (activeHabits × occurrences of that weekday, elapsed)
  const weekdayStats = useMemo(() => {
    return WEEKDAYS.map((label, w) => {
      let occ = 0
      let comp = 0
      for (let d = 1; d <= elapsed; d++) {
        if (weekdayOf(d) !== w) continue
        occ++
        for (const h of active) if (isDone(h.id, d)) comp++
      }
      const expected = active.length * occ
      return { label, w, rate: expected ? Math.round((comp / expected) * 100) : null }
    })
  }, [done, active, elapsed, monthKey])

  const rated = weekdayStats.filter((s) => s.rate !== null) as { label: string; w: number; rate: number }[]
  const best = rated.length ? rated.reduce((a, b) => (b.rate > a.rate ? b : a)) : null
  const worst = rated.length ? rated.reduce((a, b) => (b.rate < a.rate ? b : a)) : null

  const overall = useMemo(() => {
    if (!active.length || elapsed === 0) return 0
    let c = 0
    for (const h of active) for (let d = 1; d <= elapsed; d++) if (isDone(h.id, d)) c++
    return Math.round((c / (active.length * elapsed)) * 100)
  }, [done, active, elapsed])

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 className="chart-title">📊 Estatísticas de hábitos</h3>
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}>‹</button>
          <span className="date-display" style={{ minWidth: 150, textTransform: 'capitalize' }}>{monthLabel(monthKey)}</span>
          <button className="date-nav-btn" onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} disabled={isFuture} style={{ opacity: isFuture ? 0.4 : 1 }}>›</button>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="empty-hint">Cadastre hábitos para ver as estatísticas.</div>
      ) : (
        <>
          <div className="chart-section" style={{ overflowX: 'auto' }}>
            <table className="habit-grid-table">
              <thead>
                <tr>
                  <th className="hg-name">Hábito</th>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                    <th key={d} className={`hg-day ${[0, 6].includes(weekdayOf(d)) ? 'weekend' : ''}`}>{d}</th>
                  ))}
                  <th className="hg-rate">%</th>
                </tr>
              </thead>
              <tbody>
                {active.map((h) => (
                  <tr key={h.id}>
                    <td className="hg-name">{h.name}</td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                      <td key={d} className={`hg-cell ${d > elapsed ? 'future' : ''}`}>
                        <span className={`habit-cell ${isDone(h.id, d) ? 'on' : ''}`} title={dateStr(d)} />
                      </td>
                    ))}
                    <td className="hg-rate">{habitRate(h.id)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cards-grid" style={{ marginTop: 12 }}>
            <div className="stat-card">
              <div className="stat-card-label">Conclusão no mês</div>
              <div className="stat-card-value">{overall}%</div>
              <div className="stat-card-sub">{active.length} hábitos × {elapsed} dias</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Melhor / pior dia</div>
              <div className="stat-card-value" style={{ fontSize: 15 }}>
                {best ? `${best.label} ${best.rate}%` : '—'} <span style={{ color: 'var(--text-muted)' }}>/</span> {worst ? `${worst.label} ${worst.rate}%` : '—'}
              </div>
            </div>
            <div className="stat-card" style={{ gridColumn: '1 / -1' }}>
              <div className="stat-card-label">Conclusão por dia da semana</div>
              <div className="weekday-bars">
                {weekdayStats.map((s) => (
                  <div key={s.w} className="weekday-bar-col" title={s.rate === null ? 'sem dados' : `${s.rate}%`}>
                    <div className="weekday-bar-track">
                      <div
                        className="weekday-bar-fill"
                        style={{
                          height: `${s.rate ?? 0}%`,
                          background: s === best ? 'var(--success)' : s === worst ? 'var(--danger)' : 'var(--accent)'
                        }}
                      />
                    </div>
                    <span className="weekday-bar-val">{s.rate === null ? '–' : `${s.rate}%`}</span>
                    <span className="weekday-bar-label">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
