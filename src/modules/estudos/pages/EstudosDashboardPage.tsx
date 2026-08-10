import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { StudyTopic } from '../../../types'
import { useStudyStore } from '../store/studyStore'
import { TopicEditor, TOPIC_STATUS_LABEL } from '../components/TopicEditor'

interface Progress {
  done: number
  total: number
}

export function EstudosDashboardPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, refreshTopics, setActiveTopic, removeTopic, dueCards, refreshDue } = useStudyStore()
  const [progress, setProgress] = useState<Record<number, Progress>>({})
  const [editing, setEditing] = useState<StudyTopic | null>(null)
  const [creating, setCreating] = useState(false)

  async function loadProgress(): Promise<void> {
    const entries = await Promise.all(
      topics.map(async (t) => {
        const nodes = await window.api.study.nodes(t.id)
        return [t.id, { done: nodes.filter((n) => n.status === 'done').length, total: nodes.length }] as const
      })
    )
    setProgress(Object.fromEntries(entries))
  }

  useEffect(() => {
    refreshTopics()
    refreshDue()
  }, [])

  useEffect(() => {
    if (topics.length) loadProgress()
  }, [topics])

  async function openTopic(id: number): Promise<void> {
    await setActiveTopic(id)
    setPage('estudos-topic')
  }

  const activeTopics = topics.filter((t) => t.status === 'studying').length
  const totalDone = Object.values(progress).reduce((s, p) => s + p.done, 0)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🎓 Estudos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Tópicos → roadmap → anotações → flashcards → revisão.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos-review')}>
            🔁 Revisões ({dueCards.length})
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>＋ Tópico</button>
        </div>
      </div>

      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Tópicos ativos</div>
          <div className="stat-card-value">{activeTopics}</div>
          <div className="stat-card-sub">{topics.length} no total</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Itens concluídos</div>
          <div className="stat-card-value">{totalDone}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Revisões pendentes</div>
          <div className="stat-card-value" style={{ color: dueCards.length ? 'var(--warning, #f59e0b)' : 'var(--success)' }}>
            {dueCards.length}
          </div>
          <div className="stat-card-sub">flashcards vencidos hoje</div>
        </div>
      </div>

      <h3 className="dash-heading">Tópicos</h3>
      <div className="list-stack">
        {topics.length === 0 && <div className="empty-hint">Nenhum tópico. Crie o primeiro com ＋ Tópico.</div>}
        {topics.map((t) => {
          const p = progress[t.id] ?? { done: 0, total: 0 }
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
          return (
            <div key={t.id} className="list-row">
              <span className="priority-dot" style={{ background: t.color }} />
              <button className="list-row-title" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => openTopic(t.id)}>
                {t.name}
              </button>
              {t.category && <span className="project-chip">{t.category}</span>}
              <span className="project-chip">{TOPIC_STATUS_LABEL[t.status] ?? t.status}</span>
              <div className="bar-track" style={{ width: 120 }} title={`${p.done}/${p.total} concluídos`}>
                <div className="bar-fill" style={{ width: `${pct}%`, background: t.color }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>{pct}%</span>
              <div className="list-row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => openTopic(t.id)}>Abrir</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(t)}>Editar</button>
                <button className="btn btn-danger btn-sm" onClick={() => window.confirm(`Excluir "${t.name}" e todo o conteúdo?`) && removeTopic(t.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      {(creating || editing) && <TopicEditor topic={editing} onClose={() => { setCreating(false); setEditing(null) }} />}
    </div>
  )
}
