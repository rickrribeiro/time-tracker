import React, { useEffect, useState } from 'react'
import { useTaskStore } from '../../../store/taskStore'
import { useTodoStore } from '../../todo/store/todoStore'
import { useHabitStore } from '../../habits/store/habitStore'
import { useGithubStore } from '../../projects/store/githubStore'
import { priorityDef } from '../../todo/constants'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'
import flights from '../../travel/mock/flights.json'

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

export function HomePage(): React.ReactElement {
  const { activeTask, refreshActive } = useTaskStore()
  const { todos, refresh: refreshTodos } = useTodoStore()
  const { habits, isDone, refresh: refreshHabits } = useHabitStore()
  const { issues, refresh: refreshIssues } = useGithubStore()
  const [weekMinutes, setWeekMinutes] = useState(0)

  useEffect(() => {
    refreshActive()
    refreshTodos()
    refreshHabits()
    refreshIssues()

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

  const openTodos = todos
    .filter((t) => t.status !== 'done' && t.status !== 'inbox')
    .sort((a, b) => b.priority - a.priority)
  const inboxCount = todos.filter((t) => t.status === 'inbox').length
  const pendingHabits = habits.filter((h) => !isDone(h.id))
  const habitsDone = habits.length - pendingHabits.length
  const openIssues = issues.filter((i) => i.state === 'open').length
  const nextFlight = flights[0]

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>🏠 Hoje</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{localDateStr(new Date())}</p>
        </div>
      </div>

      {/* ── Hoje ── */}
      <div className="dash-section">
        <div className="chart-section">
          <div className="chart-title">⏱ Agora</div>
          {activeTask ? (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="active-task-dot" />
              <span style={{ fontWeight: 600 }}>{activeTask.title}</span>
              {activeTask.tagName && (
                <span className="active-task-tag" style={{ background: activeTask.tagColor ?? '#6366f1' }}>
                  {activeTask.tagName}
                </span>
              )}
            </div>
          ) : (
            <div className="empty-hint" style={{ padding: 12 }}>Nenhuma tarefa ativa.</div>
          )}
        </div>

        <div className="chart-section">
          <div className="chart-title">📋 Top tarefas</div>
          <div className="list-stack" style={{ marginTop: 8 }}>
            {openTodos.slice(0, 3).map((t) => (
              <div key={t.id} className="list-row">
                <span className="priority-dot" style={{ background: priorityDef(t.priority).color }} />
                <span className="list-row-title">{t.title}</span>
              </div>
            ))}
            {openTodos.length === 0 && <div className="empty-hint">Nada pendente 🎉</div>}
          </div>
        </div>

        <div className="chart-section">
          <div className="chart-title">🔥 Hábitos pendentes</div>
          <div className="list-stack" style={{ marginTop: 8 }}>
            {pendingHabits.map((h) => (
              <div key={h.id} className="list-row">
                <span className="list-row-title">{h.name}</span>
              </div>
            ))}
            {habits.length > 0 && pendingHabits.length === 0 && (
              <div className="empty-hint">Todos concluídos ✅</div>
            )}
            {habits.length === 0 && <div className="empty-hint">Nenhum hábito cadastrado.</div>}
          </div>
        </div>
      </div>

      {/* ── Esta semana ── */}
      <h3 className="dash-heading">Esta semana</h3>
      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Horas trabalhadas</div>
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
        <div className="stat-card">
          <div className="stat-card-label">Issues GitHub abertas</div>
          <div className="stat-card-value">{openIssues}</div>
          {issues.length === 0 && <div className="stat-card-sub">sincronize em Projetos</div>}
        </div>
        <div className="stat-card" style={{ opacity: 0.7 }}>
          <div className="stat-card-label">Gastos do mês (mock)</div>
          <div className="stat-card-value">R$ —</div>
          <div className="stat-card-sub">Finanças em breve</div>
        </div>
      </div>

      {/* ── Próxima viagem ── */}
      <h3 className="dash-heading">Próxima viagem (mock)</h3>
      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">
            {nextFlight.origin} → {nextFlight.destination}
          </div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>
            {nextFlight.price} {nextFlight.currency}
          </div>
          <div className="stat-card-sub">menor preço monitorado</div>
        </div>
      </div>
    </div>
  )
}
