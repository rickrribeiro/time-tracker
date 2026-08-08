import React, { useEffect, useRef, useState } from 'react'
import { useTodoStore } from '../../todo/store/todoStore'

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
    if (v) await capture(v)
    setText('')
    setOpen(false)
  }

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📥 Quick Capture</h2>
        <input
          ref={inputRef}
          type="text"
          placeholder="Digite e Enter para jogar na Inbox…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          style={{ width: '100%', marginTop: 8 }}
        />
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
