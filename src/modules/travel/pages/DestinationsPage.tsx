import React, { useEffect } from 'react'
import { useTripStore } from '../store/tripStore'

export function DestinationsPage(): React.ReactElement {
  const { trips, refresh } = useTripStore()

  useEffect(() => {
    refresh()
  }, [])

  const destinations = Array.from(new Set(trips.map((t) => t.destination))).sort()

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🗺 Destinos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Destinos das suas viagens</p>
        </div>
      </div>

      <div className="cards-grid">
        {destinations.length === 0 && <div className="empty-hint">Cadastre viagens para ver destinos aqui.</div>}
        {destinations.map((d) => {
          const count = trips.filter((t) => t.destination === d).length
          return (
            <div key={d} className="stat-card">
              <div className="stat-card-value" style={{ fontSize: 15 }}>{d}</div>
              <div className="stat-card-sub">{count} viagem(ns)</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
