import React, { useEffect, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore } from '../../todo/store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { TodoEditor } from '../../todo/components/TodoEditor'
import { OcrCapture } from '../components/OcrCapture'
import { timeAgo } from '../../../utils/dates'

type SourceFilter = 'all' | 'ai' | 'manual'

export function InboxPage(): React.ReactElement {
  const { todos, refresh, create, setStatus, remove } = useTodoStore()
  const { refresh: refreshProjects } = useProjectStore()
  const [text, setText] = useState('')
  const [processing, setProcessing] = useState<Todo | null>(null)
  const [filter, setFilter] = useState<SourceFilter>('all')

  useEffect(() => {
    refresh()
    refreshProjects()
  }, [])

  const inboxItems = todos.filter((t) => t.status === 'inbox')
  const aiCount = inboxItems.filter((t) => t.aiGenerated === 1).length
  const items = inboxItems.filter((t) =>
    filter === 'all' ? true : filter === 'ai' ? t.aiGenerated === 1 : t.aiGenerated !== 1
  )

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
        <span className="inbox-count">{inboxItems.length}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
        {(['all', 'ai', 'manual'] as SourceFilter[]).map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `Todos (${inboxItems.length})` : f === 'ai' ? `🤖 IA (${aiCount})` : `✍️ Manual (${inboxItems.length - aiCount})`}
          </button>
        ))}
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

      <OcrCapture onCreated={refresh} />

      <div className="list-stack" style={{ marginTop: 12 }}>
        {items.length === 0 && <div className="empty-hint">Inbox vazia ✨</div>}
        {items.map((t) => (
          <div key={t.id} className="list-row">
            <span className="list-row-title">
              {t.aiGenerated === 1 && <span className="project-chip" title="Gerado por IA" style={{ marginRight: 6 }}>🤖 IA</span>}
              {t.title}
              {t.notes && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>📝 {t.notes}</span>}
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }} title={`Capturado em ${new Date(t.createdAt).toLocaleString('pt-BR')}`}>⏳ {timeAgo(t.createdAt)}</span>
            </span>
            <div className="list-row-actions">
              <button className="btn btn-primary btn-sm" onClick={() => setStatus(t.id, 'todo')}>
                → TODO
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setProcessing(t)}>
                Editar…
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
