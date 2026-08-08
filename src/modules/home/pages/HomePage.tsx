import React, { useEffect, useState } from 'react'
import { useTodoStore } from '../../todo/store/todoStore'
import { useHabitStore } from '../../habits/store/habitStore'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'
import flights from '../../travel/mock/flights.json'

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export function HomePage(): React.ReactElement {
  const { todos, refresh: refreshTodos } = useTodoStore()
  const { habits, isDone, refresh: refreshHabits } = useHabitStore()
  const [weekMinutes, setWeekMinutes] = useState(0)

  useEffect(() => {
    refreshTodos()
    refreshHabits()

    const now = new Date()
    const monday = new Date(now)
    const day = (now.getDay() + 6) % 7 // 0 = Monday
    monday.setDate(now.getDate() - day)
    const start = localDayStartISO(localDateStr(monday))
    const end = localDayEndISO(localDateStr(now))
    window.api.stats.daily(start, end).then((rows) => {
      setWeekMinutes(rows.reduce((sum, r) => sum + r.totalMinutes, 0))
    })
  }, [])

  const openTodos = todos.filter((t) => t.status !== 'done' && t.status !== 'inbox')
  const inboxCount = todos.filter((t) => t.status === 'inbox').length
  const habitsDone = habits.filter((h) => isDone(h.id)).length
  const nextFlight = flights[0]

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>🏠 Hoje</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{localDateStr(new Date())}</p>
        </div>
      </div>

      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Horas esta semana</div>
          <div className="stat-card-value">{fmtHours(weekMinutes)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Tarefas abertas</div>
          <div className="stat-card-value">{openTodos.length}</div>
          <div className="stat-card-sub">{inboxCount} na inbox p/ processar</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Hábitos hoje</div>
          <div className="stat-card-value">
            {habitsDone}/{habits.length}
          </div>
        </div>
        <div className="stat-card" style={{ opacity: 0.7 }}>
          <div className="stat-card-label">Issues GitHub (mock)</div>
          <div className="stat-card-value">—</div>
          <div className="stat-card-sub">integração em breve</div>
        </div>
        <div className="stat-card" style={{ opacity: 0.7 }}>
          <div className="stat-card-label">Gastos do mês (mock)</div>
          <div className="stat-card-value">R$ —</div>
          <div className="stat-card-sub">integração em breve</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Próxima viagem (mock)</div>
          <div className="stat-card-value" style={{ fontSize: 15 }}>
            {nextFlight.origin} → {nextFlight.destination}
          </div>
          <div className="stat-card-sub">
            menor preço: {nextFlight.price} {nextFlight.currency}
          </div>
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">Top tarefas</div>
        <div className="list-stack" style={{ marginTop: 8 }}>
          {openTodos.slice(0, 3).map((t) => (
            <div key={t.id} className="list-row">
              <span className="list-row-title">{t.title}</span>
            </div>
          ))}
          {openTodos.length === 0 && <div className="empty-hint">Nada pendente 🎉</div>}
        </div>
      </div>
    </div>
  )
}
