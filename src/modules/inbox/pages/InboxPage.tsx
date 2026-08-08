import React, { useEffect, useState } from 'react'
import { Todo } from '../../../types'
import { useTodoStore } from '../../todo/store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { useTripStore } from '../../travel/store/tripStore'
import { useFinanceStore } from '../../finance/store/financeStore'
import { TodoEditor } from '../../todo/components/TodoEditor'
import { parseCapture } from '../parse'
import { localDateStr } from '../../../utils/dates'

const OUTROS_CATEGORY_ID = 6 // seeded "Outros" (expense)

export function InboxPage(): React.ReactElement {
  const { todos, refresh, create, setStatus, remove } = useTodoStore()
  const { refresh: refreshProjects } = useProjectStore()
  const { createTrip } = useTripStore()
  const { addTransaction } = useFinanceStore()
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

  async function toTrip(t: Todo): Promise<void> {
    const p = parseCapture(t.title)
    await createTrip({
      origin: p.origin,
      destination: p.destination ?? p.title,
      startDate: null,
      endDate: null,
      budget: p.amount,
      currency: 'BRL',
      status: 'planned'
    })
    await remove(t.id)
  }

  async function toFinance(t: Todo): Promise<void> {
    const p = parseCapture(t.title)
    await addTransaction({
      accountId: null,
      categoryId: OUTROS_CATEGORY_ID,
      amount: p.amount ?? 0,
      currency: 'BRL',
      type: 'expense',
      description: p.title,
      date: localDateStr(new Date())
    })
    await remove(t.id)
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
        {items.map((t) => {
          const sug = parseCapture(t.title).suggestion
          return (
            <div key={t.id} className="list-row">
              <span className="list-row-title">
                {t.title}
                {t.notes && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>📝 {t.notes}</span>}
              </span>
              <div className="list-row-actions">
                <button
                  className={`btn btn-sm ${sug === 'task' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setStatus(t.id, 'todo')}
                >
                  → TODO
                </button>
                <button
                  className={`btn btn-sm ${sug === 'trip' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toTrip(t)}
                >
                  → Viagem
                </button>
                <button
                  className={`btn btn-sm ${sug === 'finance' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toFinance(t)}
                >
                  → Financeiro
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setProcessing(t)}>
                  Editar…
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)}>
                  Excluir
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {processing && <TodoEditor todo={processing} onClose={() => setProcessing(null)} />}
    </div>
  )
}
