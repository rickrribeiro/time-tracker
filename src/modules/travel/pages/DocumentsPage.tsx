import React, { useEffect, useState } from 'react'
import { useTripStore } from '../store/tripStore'

const CHECKLIST = [
  'Passaporte',
  'Visto',
  'Vacina',
  'Seguro viagem',
  'Comprovante de hospedagem',
  'Câmbio / cartão internacional'
]

export function DocumentsPage(): React.ReactElement {
  const { trips, refresh } = useTripStore()
  const [tripId, setTripId] = useState<number | ''>('')
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    refresh()
  }, [])

  // Default to the first trip once loaded
  useEffect(() => {
    if (tripId === '' && trips.length > 0) setTripId(trips[0].id)
  }, [trips])

  // Load persisted checklist state for the selected trip
  useEffect(() => {
    if (tripId === '') {
      setChecked({})
      return
    }
    window.api.tripDocs.get(Number(tripId)).then((docs) => {
      const map: Record<string, boolean> = {}
      for (const d of docs) map[d.item] = d.checked === 1
      setChecked(map)
    })
  }, [tripId])

  async function toggle(item: string): Promise<void> {
    if (tripId === '') return
    const next = !checked[item]
    setChecked((c) => ({ ...c, [item]: next }))
    await window.api.tripDocs.set(Number(tripId), item, next ? 1 : 0)
  }

  const done = CHECKLIST.filter((i) => checked[i]).length

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📄 Documentos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Checklist por viagem — {tripId !== '' ? `${done}/${CHECKLIST.length}` : 'selecione uma viagem'}
          </p>
        </div>
        <select value={tripId} onChange={(e) => setTripId(e.target.value === '' ? '' : Number(e.target.value))}>
          <option value="">Viagem…</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.destination}
            </option>
          ))}
        </select>
      </div>

      {tripId === '' ? (
        <div className="empty-hint">Crie/selecione uma viagem para usar o checklist.</div>
      ) : (
        <div className="list-stack">
          {CHECKLIST.map((item) => (
            <label key={item} className="list-row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={!!checked[item]} onChange={() => toggle(item)} />
              <span
                className="list-row-title"
                style={{
                  textDecoration: checked[item] ? 'line-through' : 'none',
                  color: checked[item] ? 'var(--text-muted)' : 'var(--text-primary)'
                }}
              >
                {item}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
