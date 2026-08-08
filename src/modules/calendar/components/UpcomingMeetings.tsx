import React, { useEffect, useState } from 'react'
import { useCalendarStore } from '../store/calendarStore'

export function fmtEventTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString([], { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function UpcomingMeetings(): React.ReactElement {
  const { upcoming, refresh, create, remove } = useCalendarStore()
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(): Promise<void> {
    if (!title.trim() || !when) return
    await create(title.trim(), new Date(when).toISOString(), null, null)
    setTitle('')
    setWhen('')
    setAdding(false)
  }

  return (
    <div className="chart-section">
      <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📅 Próximas reuniões</span>
        <button className="btn btn-secondary btn-sm" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Fechar' : '+ Evento'}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'flex', gap: 6, margin: '10px 0', flexWrap: 'wrap' }}>
          <input
            placeholder="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ flex: 1, minWidth: 120 }}
          />
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>
            Adicionar
          </button>
        </div>
      )}

      <div className="list-stack" style={{ marginTop: 8 }}>
        {upcoming.length === 0 && (
          <div className="empty-hint">Sem eventos. Adicione manualmente (sync Google em breve).</div>
        )}
        {upcoming.map((e) => (
          <div key={e.id} className="list-row">
            <span className="due-badge due-future">{fmtEventTime(e.startTime)}</span>
            <span className="list-row-title">{e.title}</span>
            <button className="btn btn-danger btn-sm" onClick={() => remove(e.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
