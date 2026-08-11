import React, { useEffect, useState } from 'react'
import { Goal, Project, StudyTopic } from '../../../types'
import { useUIStore } from '../../../store/uiStore'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

interface Draft {
  title: string
  kind: 'free' | 'project' | 'study'
  refId: number | null
  target: string
  unit: string
}
const EMPTY: Draft = { title: '', kind: 'free', refId: null, target: '1', unit: '' }

export function GoalsPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const [month, setMonth] = useState(currentMonth())
  const [goals, setGoals] = useState<Goal[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [topics, setTopics] = useState<StudyTopic[]>([])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)

  async function refresh(): Promise<void> {
    setGoals(await window.api.goals.getForMonth(month))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  useEffect(() => {
    window.api.projects.getAll().then((p) => setProjects(p.filter((x) => x.archived !== 1)))
    window.api.study.topics().then(setTopics)
  }, [])

  const refName = (g: Goal): string | null => {
    if (g.kind === 'project') return projects.find((p) => p.id === g.refId)?.name ?? null
    if (g.kind === 'study') return topics.find((t) => t.id === g.refId)?.name ?? null
    return null
  }

  async function addGoal(): Promise<void> {
    if (!draft.title.trim()) return
    const target = parseFloat(draft.target) || 1
    await window.api.goals.create(month, draft.title.trim(), draft.kind, draft.kind === 'free' ? null : draft.refId, target, draft.unit.trim() || null)
    setDraft(EMPTY)
    setAdding(false)
    refresh()
  }

  async function patch(g: Goal, next: Partial<Goal>): Promise<void> {
    const m = { ...g, ...next }
    await window.api.goals.update(g.id, m.title, m.target, m.current, m.unit, m.done)
    refresh()
  }

  const doneCount = goals.filter((g) => g.done === 1).length

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🎯 Metas</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {doneCount}/{goals.length} concluídas
          </p>
        </div>
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <span className="date-display" style={{ minWidth: 160, textTransform: 'capitalize' }}>{monthLabel(month)}</span>
          <button className="date-nav-btn" onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        {!adding ? (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>＋ Meta</button>
        ) : (
          <div className="chart-section">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="Meta (ex: terminar roadmap de K8s)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'], refId: null })}>
                <option value="free">Livre</option>
                <option value="project">Projeto</option>
                <option value="study">Estudo</option>
              </select>
              {draft.kind !== 'free' && (
                <select value={draft.refId ?? ''} onChange={(e) => setDraft({ ...draft, refId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Vincular…</option>
                  {(draft.kind === 'project' ? projects.map((p) => ({ id: p.id, name: p.name })) : topics.map((t) => ({ id: t.id, name: t.name }))).map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              )}
              <input type="number" min={1} value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} style={{ width: 80 }} title="Meta (quantidade)" />
              <input placeholder="unid." value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} style={{ width: 80 }} title="Unidade (ex: cards, h, itens)" />
              <button className="btn btn-primary btn-sm" onClick={addGoal}>Adicionar</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setDraft(EMPTY) }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <div className="list-stack">
        {goals.length === 0 && <div className="empty-hint">Nenhuma meta para {monthLabel(month)}.</div>}
        {goals.map((g) => {
          const pct = g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0
          const linked = refName(g)
          return (
            <div key={g.id} className="list-row" style={{ alignItems: 'center' }}>
              <input type="checkbox" checked={g.done === 1} onChange={(e) => patch(g, { done: e.target.checked ? 1 : 0 })} title="Concluída" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="list-row-title" style={{ textDecoration: g.done ? 'line-through' : 'none', color: g.done ? 'var(--text-muted)' : 'var(--text-primary)' }}>{g.title}</span>
                  {g.kind !== 'free' && (
                    <button
                      className="project-chip"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setPage(g.kind === 'project' ? 'issues' : 'estudos')}
                      title={`Ir para ${g.kind === 'project' ? 'Projetos' : 'Estudos'}`}
                    >
                      {g.kind === 'project' ? '📁' : '🎓'} {linked ?? '—'}
                    </button>
                  )}
                </div>
                <div className="bar-track" style={{ marginTop: 4 }}>
                  <div className="bar-fill" style={{ width: `${pct}%`, background: g.done ? 'var(--success)' : 'var(--accent)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={g.current}
                  onChange={(e) => patch(g, { current: Number(e.target.value) || 0 })}
                  style={{ width: 64, textAlign: 'right' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ {g.target}{g.unit ? ` ${g.unit}` : ''}</span>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => window.api.goals.delete(g.id).then(refresh)}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
