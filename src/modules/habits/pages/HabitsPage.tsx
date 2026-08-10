import React, { useEffect, useState } from 'react'
import { Habit } from '../../../types'
import { useHabitStore } from '../store/habitStore'
import { HabitStats } from '../components/HabitStats'

const SUGGESTED = ['Academia', 'Estudar japonês', 'Meditar', 'Dormir antes de 00:00', 'Sem álcool', 'Revisar TODO']

function HabitEditor({ habit, onClose }: { habit: Habit; onClose: () => void }): React.ReactElement {
  const { update } = useHabitStore()
  const [name, setName] = useState(habit.name)
  const [frequency, setFrequency] = useState(habit.frequency)
  const [target, setTarget] = useState(habit.target)
  const [active, setActive] = useState(habit.active === 1)

  async function save(): Promise<void> {
    if (!name.trim()) return
    await update({ ...habit, name: name.trim(), frequency, target, active: active ? 1 : 0 })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 360 }}>
        <h2>Editar hábito</h2>
        <div className="editor-field">
          <label>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Frequência</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="daily">Diária</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>
          <div className="editor-field">
            <label>Meta {frequency === 'weekly' ? '(x/semana)' : '(x/dia)'}</label>
            <input type="number" min={1} value={target} onChange={(e) => setTarget(Number(e.target.value) || 1)} />
          </div>
        </div>
        <div className="editor-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none' }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

export function HabitsPage(): React.ReactElement {
  const { habits, refresh, create, remove, toggle, isDone, streak, weekRate, last7, date } = useHabitStore()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Habit | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(value?: string): Promise<void> {
    const v = (value ?? name).trim()
    if (!v) return
    if (habits.some((h) => h.name.toLowerCase() === v.toLowerCase())) return
    await create(v, 'daily', 1)
    if (!value) setName('')
  }

  const activeHabits = habits.filter((h) => h.active === 1)
  const doneCount = activeHabits.filter((h) => isDone(h.id)).length
  const missingSuggestions = SUGGESTED.filter((s) => !habits.some((h) => h.name.toLowerCase() === s.toLowerCase()))

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔥 Hábitos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {date} — {doneCount}/{activeHabits.length} concluídos hoje
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
        <button className="btn btn-primary" onClick={() => handleAdd()}>+ Adicionar</button>
      </div>

      {missingSuggestions.length > 0 && (
        <div className="suggested-row">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sugestões:</span>
          {missingSuggestions.map((s) => (
            <button key={s} className="btn btn-secondary btn-sm" onClick={() => handleAdd(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}

      <div className="list-stack" style={{ marginTop: 12 }}>
        {habits.length === 0 && <div className="empty-hint">Nenhum hábito ainda.</div>}
        {habits.map((h) => {
          const done = isDone(h.id)
          const cells = last7(h.id)
          const inactive = h.active !== 1
          return (
            <div key={h.id} className="list-row" style={{ opacity: inactive ? 0.5 : 1 }}>
              <button
                className={`habit-toggle ${done ? 'done' : ''}`}
                onClick={() => toggle(h.id)}
                title={done ? 'Concluído hoje' : 'Marcar hoje'}
              >
                {done ? '✓' : ''}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: done ? 'var(--success)' : 'var(--text-primary)', fontSize: 14 }}>
                  {h.name}
                  {h.frequency === 'weekly' && (
                    <span className="project-chip" style={{ marginLeft: 8 }}>meta {h.target}/sem</span>
                  )}
                </div>
                <div className="habit-grid">
                  {cells.map((c) => (
                    <span key={c.date} className={`habit-cell ${c.done ? 'on' : ''}`} title={c.date} />
                  ))}
                </div>
              </div>
              <div className="habit-stats">
                <span title="Sequência">🔥 {streak(h.id)}</span>
                <span title="Últimos 7 dias">{weekRate(h.id)}/7</span>
              </div>
              <div className="list-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(h)}>Editar</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(h.id)}>Excluir</button>
              </div>
            </div>
          )
        })}
      </div>

      <HabitStats />

      {editing && <HabitEditor habit={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
