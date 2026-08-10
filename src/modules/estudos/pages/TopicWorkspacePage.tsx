import React, { useEffect } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { useStudyStore } from '../store/studyStore'

export function TopicWorkspacePage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, activeTopicId, nodes, refreshActive, refreshTopics } = useStudyStore()
  const topic = topics.find((t) => t.id === activeTopicId) ?? null

  useEffect(() => {
    if (!topics.length) refreshTopics()
    if (activeTopicId != null) refreshActive()
  }, [activeTopicId])

  if (!topic) {
    return (
      <div className="module-page">
        <div className="empty-hint">
          Nenhum tópico selecionado. <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>Voltar aos Estudos</button>
        </div>
      </div>
    )
  }

  const done = nodes.filter((n) => n.status === 'done').length
  const pct = nodes.length ? Math.round((done / nodes.length) * 100) : 0

  return (
    <div className="module-page">
      <div className="module-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>←</button>
          <span className="priority-dot" style={{ background: topic.color }} />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{topic.name}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {done}/{nodes.length} concluídos · {pct}%
            </p>
          </div>
        </div>
      </div>

      <div className="study-workspace">
        <div className="study-col study-col-roadmap">
          <div className="chart-title">🗺 Roadmap</div>
          <div className="empty-hint">Roadmap em breve.</div>
        </div>
        <div className="study-col study-col-note">
          <div className="chart-title">📝 Anotações</div>
          <div className="empty-hint">Selecione um item do roadmap.</div>
        </div>
        <div className="study-col study-col-cards">
          <div className="chart-title">🃏 Flashcards</div>
          <div className="empty-hint">Flashcards em breve.</div>
        </div>
      </div>
    </div>
  )
}
