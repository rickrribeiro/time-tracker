import React, { useEffect, useState } from 'react'
import { Trip } from '../../../types'

const CHECKLIST = [
  'Passaporte',
  'Visto',
  'Vacina',
  'Seguro viagem',
  'Comprovante de hospedagem',
  'Câmbio / cartão internacional'
]

/** Checklist de documentos, persistido por viagem (trip_documents). */
export function TripDocuments({ trips }: { trips: Trip[] }): React.ReactElement {
  const [tripId, setTripId] = useState<number | null>(trips[0]?.id ?? null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  // Mantém a seleção válida quando a lista de viagens do destino muda.
  useEffect(() => {
    if (!trips.some((t) => t.id === tripId)) setTripId(trips[0]?.id ?? null)
  }, [trips])

  useEffect(() => {
    if (tripId == null) {
      setChecked({})
      return
    }
    window.api.tripDocs.get(tripId).then((docs) => {
      const map: Record<string, boolean> = {}
      for (const d of docs) map[d.item] = d.checked === 1
      setChecked(map)
    })
  }, [tripId])

  async function toggle(item: string): Promise<void> {
    if (tripId == null) return
    const next = !checked[item]
    setChecked((c) => ({ ...c, [item]: next }))
    await window.api.tripDocs.set(tripId, item, next ? 1 : 0)
  }

  const done = CHECKLIST.filter((i) => checked[i]).length

  return (
    <div className="chart-section">
      <div className="travel-section-head">
        <div className="chart-title">
          📄 Documentos {tripId != null && <span className="travel-muted">· {done}/{CHECKLIST.length}</span>}
        </div>
        {trips.length > 1 && (
          <select value={tripId ?? ''} onChange={(e) => setTripId(Number(e.target.value))}>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.startDate ?? 'sem data'}{t.origin ? ` · de ${t.origin}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {tripId == null ? (
        <div className="empty-hint">Crie uma viagem para este destino para usar o checklist.</div>
      ) : (
        <div className="list-stack" style={{ marginTop: 10 }}>
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
