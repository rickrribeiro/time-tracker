import React, { useEffect, useRef, useState } from 'react'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown } from '../markdown'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Split-view Markdown note editor (textarea | live preview) with debounced autosave. */
export function NoteEditor(): React.ReactElement {
  const { note, selectedNodeId, nodes, saveNote } = useStudyStore()
  const [draft, setDraft] = useState(note?.content ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(note?.updatedAt ?? null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    </div>
  )
}
