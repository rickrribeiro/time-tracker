import React, { useEffect, useMemo, useState } from 'react'
import { StudyTopic, StudyNode, StudyNote, StudyFlashcard } from '../../../types'
import { useStudyStore } from '../store/studyStore'
import { useUIStore } from '../../../store/uiStore'

interface Hit {
  topicId: number
  nodeId: number | null
  kind: 'topic' | 'roadmap' | 'nota' | 'flashcard'
  label: string
  snippet: string
}

function snippetAround(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q)
  if (i < 0) return text.slice(0, 80)
  const start = Math.max(0, i - 30)
  return (start > 0 ? '…' : '') + text.slice(start, i + q.length + 40).replace(/\n/g, ' ') + '…'
}

/** Text search across topics, roadmap nodes, notes and flashcards (JS filtering). */
export function StudySearch(): React.ReactElement {
  const { topics, setActiveTopic, selectNode } = useStudyStore()
  const { setPage } = useUIStore()
  const [query, setQuery] = useState('')
  const [nodes, setNodes] = useState<StudyNode[]>([])
  const [notes, setNotes] = useState<StudyNote[]>([])
  const [cards, setCards] = useState<StudyFlashcard[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([window.api.study.allNodes(), window.api.study.allNotes(), window.api.study.flashcards()]).then(
      ([n, no, c]) => {
        setNodes(n)
        setNotes(no)
        setCards(c)
        setLoaded(true)
      }
    )
  }, [])

  const topicName = (id: number): string => topics.find((t) => t.id === id)?.name ?? '—'

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const out: Hit[] = []
    for (const t of topics as StudyTopic[]) {
      if (t.name.toLowerCase().includes(q)) out.push({ topicId: t.id, nodeId: null, kind: 'topic', label: t.name, snippet: t.category ?? '' })
    }
    for (const n of nodes) {
      const hay = `${n.title} ${n.description ?? ''}`.toLowerCase()
      if (hay.includes(q)) out.push({ topicId: n.topicId, nodeId: n.id, kind: 'roadmap', label: n.title, snippet: snippetAround(n.description ?? n.title, q) })
    }
    for (const no of notes) {
      if (no.content.toLowerCase().includes(q)) out.push({ topicId: no.topicId, nodeId: no.nodeId, kind: 'nota', label: 'Anotação', snippet: snippetAround(no.content, q) })
    }
    for (const c of cards) {
      const hay = `${c.front} ${c.back}`.toLowerCase()
      if (hay.includes(q)) out.push({ topicId: c.topicId, nodeId: c.nodeId, kind: 'flashcard', label: c.front, snippet: snippetAround(c.back, q) })
    }
    return out.slice(0, 40)
  }, [query, topics, nodes, notes, cards])

  async function open(h: Hit): Promise<void> {
    await setActiveTopic(h.topicId)
    if (h.nodeId != null) await selectNode(h.nodeId)
    setPage('estudos-topic')
  }

  const KIND_ICON: Record<Hit['kind'], string> = { topic: '🎓', roadmap: '🗺', nota: '📝', flashcard: '🃏' }

  return (
    <div style={{ marginBottom: 12 }}>
      <input
        type="text"
        placeholder={loaded ? '🔍 Buscar em tópicos, roadmap, anotações e flashcards…' : 'Carregando índice…'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%' }}
      />
      {query.trim().length >= 2 && (
        <div className="list-stack" style={{ marginTop: 8 }}>
          {hits.length === 0 && <div className="empty-hint">Nada encontrado para “{query}”.</div>}
          {hits.map((h, i) => (
            <button key={i} className="list-row" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => open(h)}>
              <span title={h.kind}>{KIND_ICON[h.kind]}</span>
              <span className="list-row-title" style={{ whiteSpace: 'normal' }}>
                {h.label}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{h.snippet}</span>
              </span>
              <span className="project-chip">{topicName(h.topicId)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
