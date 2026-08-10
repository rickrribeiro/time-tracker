import React, { useEffect, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { useStudyStore } from '../store/studyStore'
import { Rating } from '../srs'

const RATINGS: { key: Rating; label: string; cls: string }[] = [
  { key: 'again', label: 'Again', cls: 'btn-danger' },
  { key: 'hard', label: 'Hard', cls: 'btn-secondary' },
  { key: 'good', label: 'Good', cls: 'btn-primary' },
  { key: 'easy', label: 'Easy', cls: 'btn-secondary' }
]

export function RevisoesPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, dueCards, refreshDue, refreshTopics, reviewCard } = useStudyStore()
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    refreshDue()
    if (!topics.length) refreshTopics()
  }, [])

  const card = dueCards[0]
  const topicName = (id: number): string => topics.find((t) => t.id === id)?.name ?? '—'

  // count due by topic
  const byTopic: Record<number, number> = {}
  for (const c of dueCards) byTopic[c.topicId] = (byTopic[c.topicId] ?? 0) + 1

  async function rate(r: Rating): Promise<void> {
    if (!card) return
    await reviewCard(card.id, r)
    setRevealed(false)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setPage('estudos')}>←</button>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔁 Revisões</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Revisões de hoje: {dueCards.length}</p>
          </div>
        </div>
      </div>

      {Object.keys(byTopic).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.entries(byTopic).map(([id, n]) => (
            <span key={id} className="project-chip">{topicName(Number(id))}: {n}</span>
          ))}
        </div>
      )}

      {!card ? (
        <div className="chart-section" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>Nada para revisar agora. Volte mais tarde!</div>
        </div>
      ) : (
        <div className="flashcard">
          <div className="flashcard-topic">{topicName(card.topicId)}</div>
          <div className="flashcard-face">{card.front}</div>
          {revealed ? (
            <>
              <hr className="flashcard-sep" />
              <div className="flashcard-face flashcard-back">{card.back}</div>
              <div className="srs-buttons">
                {RATINGS.map((r) => (
                  <button key={r.key} className={`btn btn-sm ${r.cls}`} onClick={() => rate(r.key)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setRevealed(true)}>
              Mostrar resposta
            </button>
          )}
        </div>
      )}
    </div>
  )
}
