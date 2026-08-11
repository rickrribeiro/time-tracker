import React, { useEffect, useRef, useState } from 'react'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown } from '../markdown'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TUTOR_ACTIONS: { key: string; label: string; instruction: string }[] = [
  { key: 'simple', label: '🧒 Explique simples', instruction: 'Explique o conteúdo abaixo de forma simples, como se eu tivesse 12 anos, com analogias.' },
  { key: 'summary', label: '📝 Resuma', instruction: 'Resuma o conteúdo abaixo em no máximo 5 bullets objetivos.' },
  { key: 'exercise', label: '🏋️ Exercício', instruction: 'Crie 2 a 3 exercícios práticos (com a resposta ao final) sobre o conteúdo abaixo.' },
  { key: 'gaps', label: '🕳️ O que falta', instruction: 'Aponte lacunas e pontos que eu deveria estudar a seguir a partir do conteúdo abaixo.' }
]

/** Split-view Markdown note editor (textarea | live preview) with debounced autosave. */
export function NoteEditor(): React.ReactElement {
  const { note, selectedNodeId, nodes, saveNote } = useStudyStore()
  const [draft, setDraft] = useState(note?.content ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(note?.updatedAt ?? null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // IA tutor
  const [model, setModel] = useState('')
  const [tutorRunning, setTutorRunning] = useState(false)
  const [tutorOut, setTutorOut] = useState('')
  const [tutorLabel, setTutorLabel] = useState('')
  const tutorRunId = useRef<string | null>(null)

  useEffect(() => {
    window.api.settings.get('claude_model').then((m) => setModel(m ?? ''))
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === tutorRunId.current) setTutorOut((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error }) => {
      if (rid !== tutorRunId.current) return
      tutorRunId.current = null
      setTutorRunning(false)
      setTutorOut(ok ? output : error || 'Falha.')
    })
    return () => {
      offChunk()
      offDone()
    }
  }, [])

  async function runTutor(instruction: string, label: string): Promise<void> {
    const content = draft.trim()
    if (!content || tutorRunning) return
    setTutorLabel(label)
    setTutorOut('')
    setTutorRunning(true)
    const prompt = `${instruction}\n\nConteúdo (Markdown):\n"""\n${content}\n"""`
    try {
      const rid = await window.api.ai.start({ prompt, model, save: false })
      tutorRunId.current = rid
    } catch (e) {
      setTutorRunning(false)
      setTutorOut(e instanceof Error ? e.message : String(e))
    }
  }

  function appendToNote(): void {
    const merged = `${draft.trimEnd()}\n\n## ${tutorLabel}\n${tutorOut.trim()}\n`
    onChange(merged)
    persist(merged)
    setTutorOut('')
  }

  const title = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.title ?? 'Item' : 'Visão geral do tópico'

  // reset when selection changes or the loaded note arrives
  useEffect(() => {
    setDraft(note?.content ?? '')
    setSavedAt(note?.updatedAt ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, note?.id])

  async function persist(v: string): Promise<void> {
    await saveNote(v)
    setSavedAt(new Date().toISOString())
  }

  function onChange(v: string): void {
    setDraft(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist(v), 800)
  }

  function flush(): void {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    persist(draft)
  }

  return (
    <div className="note-editor">
      <div className="note-editor-head">
        <strong>{title}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>salvo {fmt(savedAt)}</span>
      </div>
      <div className="md-split">
        <textarea
          className="md-input"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
          placeholder="Escreva em Markdown: # título, **negrito**, `código`, - listas, [link](url)…"
          spellCheck={false}
        />
        <div className="md-preview-pane">
          {draft.trim() ? renderMarkdown(draft) : <div className="empty-hint">Pré-visualização aparece aqui.</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>🤖 Tutor:</span>
        {TUTOR_ACTIONS.map((a) => (
          <button
            key={a.key}
            className="btn btn-secondary btn-sm"
            disabled={tutorRunning || !draft.trim()}
            title={draft.trim() ? '' : 'Escreva uma anotação primeiro'}
            onClick={() => runTutor(a.instruction, a.label)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {(tutorRunning || tutorOut) && (
        <div className="chart-section" style={{ marginTop: 8 }}>
          <div className="chart-title" style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{tutorLabel}{tutorRunning ? ' — pensando…' : ''}</span>
            {!tutorRunning && tutorOut && (
              <span style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(tutorOut)}>Copiar</button>
                <button className="btn btn-secondary btn-sm" onClick={appendToNote}>Anexar à nota</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setTutorOut('')}>Fechar</button>
              </span>
            )}
          </div>
          <div className="md-preview-pane" style={{ marginTop: 6, minHeight: 0 }}>
            {tutorOut ? renderMarkdown(tutorOut) : <div className="empty-hint">…</div>}
          </div>
        </div>
      )}
    </div>
  )
}
