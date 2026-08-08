import React, { useEffect, useRef, useState } from 'react'
import { useTodoStore } from '../../todo/store/todoStore'
import { parseCapture, SUGGESTION_LABEL } from '../parse'

/**
 * Global quick-capture modal. Opens on the main-process global shortcut
 * (Ctrl/Cmd+Shift+Space) via `window.api.on.quickCapture`, and also on an
 * in-app keydown so it works while the window is focused. Writes to the
 * Inbox (todos with source='quick-capture').
 */
export function QuickCapture(): React.ReactElement | null {
  const { capture } = useTodoStore()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const off = window.api.on.quickCapture(() => setOpen(true))

    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setText('')
      // focus after the modal renders
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(): Promise<void> {
    const v = text.trim()
    if (v) {
      const parsed = parseCapture(v)
      await capture(parsed.title, parsed.notes)
    }
    setText('')
    setOpen(false)
  }

  const preview = text.trim() ? parseCapture(text) : null

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📥 Quick Capture</h2>
        <input
          ref={inputRef}
          type="text"
          placeholder="Título… (use // para nota rápida, → para trecho de viagem)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          style={{ width: '100%', marginTop: 8 }}
        />
        {preview && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>{SUGGESTION_LABEL[preview.suggestion]}</span>
            {preview.notes && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>📝 {preview.notes}</span>}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
            Cancelar (Esc)
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
            Capturar
          </button>
        </div>
      </div>
    </div>
  )
}
