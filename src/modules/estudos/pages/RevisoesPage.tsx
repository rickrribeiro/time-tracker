import React, { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { useStudyStore } from '../store/studyStore'
import { Rating } from '../srs'
import { ReviewHeatmap } from '../components/ReviewHeatmap'

const RATINGS: { key: Rating; label: string; cls: string }[] = [
  { key: 'again', label: 'Again', cls: 'btn-danger' },
  { key: 'hard', label: 'Hard', cls: 'btn-secondary' },
  { key: 'good', label: 'Good', cls: 'btn-primary' },
  { key: 'easy', label: 'Easy', cls: 'btn-secondary' }
]

const NO_CAT = 'Sem categoria'
const EXCLUDED_KEY = 'rickos:studyReviewExcludedCats'

function loadExcluded(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(EXCLUDED_KEY) || '[]')
    if (Array.isArray(v)) return new Set(v.map(String))
  } catch {
    // ignore
  }
  return new Set()
}

export function RevisoesPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const { topics, dueCards, refreshDue, refreshTopics, reviewCard } = useStudyStore()
  const [revealed, setRevealed] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(loadExcluded)

  useEffect(() => {
    refreshDue()
    if (!topics.length) refreshTopics()
  }, [])

  const topicName = (id: number): string => topics.find((t) => t.id === id)?.name ?? '—'
  const catOf = (topicId: number): string => topics.find((t) => t.id === topicId)?.category?.trim() || NO_CAT

  // distinct categories among due cards, with counts
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of dueCards) m[catOf(c.topicId)] = (m[catOf(c.topicId)] ?? 0) + 1
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueCards, topics])
  const categories = Object.keys(catCounts).sort((a, b) => a.localeCompare(b))

  const filteredDue = dueCards.filter((c) => !excluded.has(catOf(c.topicId)))
  const card = filteredDue[0]

  function toggleCat(cat: string): void {
    setExcluded((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next]))
      return next
    })
    setRevealed(false)
  }
  function setAll(include: boolean): void {
    const next = include ? new Set<string>() : new Set(categories)
    setExcluded(next)
    localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...next]))
    setRevealed(false)
  }

  // count remaining by topic (within the active category filter)
  const byTopic: Record<number, number> = {}
  for (const c of filteredDue) byTopic[c.topicId] = (byTopic[c.topicId] ?? 0) + 1

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
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {filteredDue.length} para revisar{excluded.size > 0 ? ` (de ${dueCards.length})` : ''}
            </p>
          </div>
        </div>
      </div>

      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Categorias:</span>
          {categories.map((cat) => {
            const on = !excluded.has(cat)
            return (
              <button
                key={cat}
                className={`btn btn-sm ${on ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => toggleCat(cat)}
                title={on ? 'Clique para excluir' : 'Clique para incluir'}
              >
                {on ? '' : '✕ '}{cat} ({catCounts[cat]})
              </button>
            )
          })}
          <button className="btn btn-secondary btn-sm" onClick={() => setAll(true)}>Todas</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAll(false)}>Nenhuma</button>
        </div>
      )}

      {Object.keys(byTopic).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.entries(byTopic).map(([id, n]) => (
            <span key={id} className="project-chip">{topicName(Number(id))}: {n}</span>
          ))}
        </div>
      )}

      {!card ? (
        <div className="chart-section" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40 }}>{dueCards.length > 0 ? '🚫' : '🎉'}</div>
          <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
            {dueCards.length > 0
              ? 'Nenhuma revisão nas categorias selecionadas.'
              : 'Nada para revisar agora. Volte mais tarde!'}
          </div>
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

      <ReviewHeatmap />
    </div>
  )
}
