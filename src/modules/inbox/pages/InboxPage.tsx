import React, { useEffect, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore } from '../../todo/store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { TodoEditor } from '../../todo/components/TodoEditor'

export function InboxPage(): React.ReactElement {
  const { todos, refresh, create, setStatus, remove } = useTodoStore()
  const { refresh: refreshProjects } = useProjectStore()
  const [text, setText] = useState('')
  const [processing, setProcessing] = useState<Todo | null>(null)

  useEffect(() => {
    refresh()
    refreshProjects()
  }, [])

  const items = todos.filter((t) => t.status === 'inbox')

  async function handleAdd(): Promise<void> {
    const v = text.trim()
    if (!v) return
    await create(v, 'inbox')
    setText('')
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📥 Inbox</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Capture agora, processe depois. Atalho global: Ctrl+Shift+Space.
          </p>
        </div>
        <span className="inbox-count">{items.length}</span>
      </div>

      <div className="quick-add-row">
        <input
          type="text"
          placeholder="O que está na sua cabeça?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          autoFocus
        />
        <button className="btn btn-primary" onClick={handleAdd}>
          + Capturar
        </button>
      </div>

      <div className="list-stack">
        {items.length === 0 && <div className="empty-hint">Inbox vazia ✨</div>}
        {items.map((t) => (
          <div key={t.id} className="list-row">
            <span className="list-row-title">{t.title}</span>
            <div className="list-row-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(t.id, 'todo')}>
                → TODO
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setProcessing(t)}>
                Processar…
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {processing && <TodoEditor todo={processing} onClose={() => setProcessing(null)} />}
    </div>
  )
}
