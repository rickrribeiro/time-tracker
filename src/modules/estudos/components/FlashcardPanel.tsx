import React, { useEffect, useRef, useState } from 'react'
import { useStudyStore } from '../store/studyStore'

interface GenCard {
  front: string
  back: string
}

/** Human label for when a card is next due (nextReviewAt = YYYY-MM-DD or ISO). */
function nextReviewLabel(iso: string | null): { text: string; cls: string } {
  if (!iso) return { text: 'novo', cls: 'due-today' }
  const day = iso.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  if (day <= today) return { text: 'vence hoje', cls: 'due-overdue' }
  const d = new Date(`${day}T12:00:00`)
  const diff = Math.round((d.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000)
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return { text: `em ${diff}d · ${label}`, cls: 'due-future' }
}

/** Tolerant parse of a JSON array of {front, back} from Claude's output. */
function extractCards(raw: string): GenCard[] | null {
  if (!raw) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    const v = JSON.parse(s)
    if (!Array.isArray(v)) return null
    return v
      .map((c: Record<string, unknown>) => ({ front: String(c.front ?? '').trim(), back: String(c.back ?? '').trim() }))
      .filter((c) => c.front && c.back)
  } catch {
    return null
  }
}

export function FlashcardPanel(): React.ReactElement {
  const { flashcards, selectedNodeId, note, activeTopicId, createFlashcard, removeFlashcard } = useStudyStore()
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [flipped, setFlipped] = useState<Set<number>>(new Set())

  // AI generation
  const [model, setModel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [generated, setGenerated] = useState<GenCard[] | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const runIdRef = useRef<string | null>(null)
  const outputRef = useRef('')

  useEffect(() => {
    window.api.settings.get('claude_model').then((m) => setModel(m ?? ''))
    const offChunk = window.api.ai.onChunk((rid) => {
      if (rid && rid === runIdRef.current) outputRef.current = ''
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error }) => {
      if (rid !== runIdRef.current) return
      runIdRef.current = null
      setGenerating(false)
      if (!ok) {
        setGenError(error || 'Falha ao gerar.')
        return
      }
      const cards = extractCards(output)
      if (!cards || !cards.length) {
        setGenError('A IA não devolveu flashcards válidos. Tente de novo.')
        return
      }
      setGenerated(cards)
      setExcluded(new Set())
    })
    return () => {
      offChunk()
      offDone()
    }
  }, [])

  const visible = selectedNodeId != null ? flashcards.filter((f) => f.nodeId === selectedNodeId) : flashcards

  async function addManual(): Promise<void> {
    if (!front.trim() || !back.trim()) return
    await createFlashcard(front.trim(), back.trim(), selectedNodeId)
    setFront('')
    setBack('')
  }

  async function generate(): Promise<void> {
    const content = note?.content?.trim()
    if (!content || generating) return
    setGenError('')
    setGenerated(null)
    setGenerating(true)
    // Escala o alvo com o tamanho da nota (~1 cartão a cada 250 caracteres), sem teto rígido.
    const suggested = Math.max(5, Math.round(content.length / 250))
    const prompt = `A partir da anotação em Markdown abaixo, crie flashcards de estudo (pergunta/resposta) concisos e úteis para memorização.

Responda APENAS com um JSON válido (sem markdown, sem texto fora do JSON), um array no formato:
[{ "front": "pergunta", "back": "resposta" }]

Regras:
- COBERTURA COMPLETA: gere um flashcard para CADA conceito, definição, comando, fato ou passo importante da anotação. Não resuma nem selecione só alguns — percorra a nota inteira, seção por seção.
- Não há limite máximo. Para esta anotação, espere aproximadamente ${suggested} cartões (mais se o conteúdo exigir). Nunca menos que isso se houver material.
- Frente = pergunta/estímulo claro; verso = resposta objetiva. Não repita cartões.

Anotação:
"""
${content}
"""`
    try {
      const rid = await window.api.ai.start({ prompt, model, save: false })
      runIdRef.current = rid
    } catch (e) {
      setGenerating(false)
      setGenError(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveGenerated(): Promise<void> {
    if (!generated || activeTopicId == null) return
    for (let i = 0; i < generated.length; i++) {
      if (excluded.has(i)) continue
      await createFlashcard(generated[i].front, generated[i].back, selectedNodeId)
    }
    setGenerated(null)
  }

  const noteHasContent = !!note?.content?.trim()

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        <input placeholder="Frente (pergunta)" value={front} onChange={(e) => setFront(e.target.value)} />
        <input placeholder="Verso (resposta)" value={back} onChange={(e) => setBack(e.target.value)} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-primary btn-sm" onClick={addManual} disabled={!front.trim() || !back.trim()}>＋ Cartão</button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={generate}
            disabled={generating || !noteHasContent}
            title={noteHasContent ? 'Gerar flashcards da nota selecionada via Claude local' : 'Escreva uma anotação primeiro'}
          >
            {generating ? 'Gerando…' : '✨ Gerar da nota'}
          </button>
        </div>
        {genError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{genError}</div>}
      </div>

      {generated && (
        <div className="chart-section" style={{ marginBottom: 10 }}>
          <div className="chart-title" style={{ fontSize: 13 }}>Gerados ({generated.length - excluded.size} selecionados)</div>
          <div className="list-stack" style={{ marginTop: 6 }}>
            {generated.map((c, i) => (
              <label key={i} className="list-row" style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={!excluded.has(i)}
                  onChange={() =>
                    setExcluded((prev) => {
                      const next = new Set(prev)
                      next.has(i) ? next.delete(i) : next.add(i)
                      return next
                    })
                  }
                />
                <span className="list-row-title" style={{ whiteSpace: 'normal' }}>
                  <strong>{c.front}</strong>
                  <br />
                  <span style={{ color: 'var(--text-secondary)' }}>{c.back}</span>
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveGenerated} disabled={generated.length - excluded.size === 0}>
              Salvar selecionados
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setGenerated(null)}>Descartar</button>
          </div>
        </div>
      )}

      <div className="list-stack">
        {visible.length === 0 && <div className="empty-hint">Nenhum flashcard{selectedNodeId != null ? ' neste item' : ''}.</div>}
        {visible.map((f) => {
          const due = nextReviewLabel(f.nextReviewAt)
          return (
            <div key={f.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <button
                className="list-row-title"
                style={{ textAlign: 'left', whiteSpace: 'normal', cursor: 'pointer' }}
                onClick={() =>
                  setFlipped((prev) => {
                    const next = new Set(prev)
                    next.has(f.id) ? next.delete(f.id) : next.add(f.id)
                    return next
                  })
                }
              >
                <strong>{f.front}</strong>
                {flipped.has(f.id) && (
                  <>
                    <br />
                    <span style={{ color: 'var(--text-secondary)' }}>{f.back}</span>
                  </>
                )}
              </button>
              <span className={`due-badge ${due.cls}`} title="Próxima revisão">{due.text}</span>
              <button className="btn btn-danger btn-sm" onClick={() => removeFlashcard(f.id)}>✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
