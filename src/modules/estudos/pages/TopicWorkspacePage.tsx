import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { useStudyStore } from '../store/studyStore'
import { RoadmapTree } from '../components/RoadmapTree'
import { NoteEditor } from '../components/NoteEditor'
import { FlashcardPanel } from '../components/FlashcardPanel'
import { QuizModal } from '../components/QuizModal'
import { GapsModal } from '../components/GapsModal'

export function TopicWorkspacePage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, activeTopicId, nodes, refreshActive, refreshTopics } = useStudyStore()
  const [quizOpen, setQuizOpen] = useState(false)
  const [gapsOpen, setGapsOpen] = useState(false)
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

  async function runExport(fn: () => Promise<{ ok: boolean; message?: string; error?: string } | boolean>): Promise<void> {
    const r = await fn()
    if (typeof r === 'boolean') {
      if (r) alert('Backup JSON exportado.')
    } else if (r.ok) alert(r.message || 'Exportado.')
    else if (r.error) alert('Falha: ' + r.error)
  }

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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setQuizOpen(true)} title="Gerar um quiz a partir das anotações">🧪 Quiz</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setGapsOpen(true)} title="Detectar pré-requisitos/itens faltando no roadmap">🕳️ Lacunas</button>
          <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportMarkdown(topic.id))} title="Gerar caderno (.md) do tópico">📄 Caderno .md</button>
          <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportJson(topic.id))} title="Backup JSON do tópico">🗄 JSON</button>
          <button className="btn btn-secondary btn-sm" onClick={() => runExport(() => window.api.study.exportFolder(topic.id))} title="Exportar pasta Markdown (Obsidian)">📁 Pasta</button>
        </div>
      </div>

      <div className="study-workspace">
        <div className="study-col study-col-roadmap">
          <div className="chart-title">🗺 Roadmap</div>
          <RoadmapTree />
        </div>
        <div className="study-col study-col-note">
          <div className="chart-title">📝 Anotações</div>
          <NoteEditor />
        </div>
        <div className="study-col study-col-cards">
          <div className="chart-title">🃏 Flashcards</div>
          <FlashcardPanel />
        </div>
      </div>

      {quizOpen && <QuizModal topic={topic} onClose={() => setQuizOpen(false)} />}
      {gapsOpen && <GapsModal topic={topic} onClose={() => setGapsOpen(false)} />}
    </div>
  )
}
