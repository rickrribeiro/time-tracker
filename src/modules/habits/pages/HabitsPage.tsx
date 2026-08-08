import React, { useEffect, useState } from 'react'
import { useHabitStore } from '../store/habitStore'

export function HabitsPage(): React.ReactElement {
  const { habits, refresh, create, remove, toggle, isDone, date } = useHabitStore()
  const [name, setName] = useState('')

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(): Promise<void> {
    if (!name.trim()) return
    await create(name.trim(), 'daily', 1)
    setName('')
  }

  const doneCount = habits.filter((h) => isDone(h.id)).length

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔥 Hábitos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {date} — {doneCount}/{habits.length} concluídos hoje
          </p>
        </div>
      </div>

      <div className="quick-add-row">
        <input
          type="text"
          placeholder="Novo hábito (ex: Academia)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn-primary" onClick={handleAdd}>
          + Adicionar
        </button>
      </div>

      <div className="list-stack">
        {habits.length === 0 && <div className="empty-hint">Nenhum hábito ainda.</div>}
        {habits.map((h) => {
          const done = isDone(h.id)
          return (
            <div key={h.id} className="list-row">
              <button
                className={`habit-toggle ${done ? 'done' : ''}`}
                onClick={() => toggle(h.id)}
                title={done ? 'Concluído' : 'Marcar como concluído'}
              >
                {done ? '✓' : ''}
              </button>
              <span
                className="list-row-title"
                style={{ color: done ? 'var(--success)' : 'var(--text-primary)' }}
              >
                {h.name}
              </span>
              <div className="list-row-actions">
                <button className="btn btn-danger btn-sm" onClick={() => remove(h.id)}>
                  Excluir
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
