import React, { useEffect, useMemo, useState } from 'react'
import { Trip } from '../../../types'
import { useTripStore, daysUntil, isUpcoming } from '../store/tripStore'
import { formatMoney } from '../../finance/util'
import { TripsSidebar, TRIP_STATUS, byStart } from '../components/TripsSidebar'
import { TripDocuments } from '../components/TripDocuments'
import { Recommendations } from '../components/Recommendations'
import '../travel.css'

interface Destination {
  name: string
  trips: Trip[]
  /** Próxima viagem (não concluída) para o destino, se houver. */
  next: Trip | null
}

export function DestinationsPage(): React.ReactElement {
  const { trips, refresh } = useTripStore()
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const destinations = useMemo<Destination[]>(() => {
    const map = new Map<string, Trip[]>()
    for (const t of trips) {
      const k = t.destination.trim()
      map.set(k, [...(map.get(k) ?? []), t])
    }
    return [...map.entries()].map(([name, ts]) => ({
      name,
      trips: [...ts].sort(byStart),
      next: ts.filter(isUpcoming).sort(byStart)[0] ?? null
    }))
  }, [trips])

  const planned = destinations.filter((d) => d.next).sort((a, b) => byStart(a.next!, b.next!))
  const others = destinations.filter((d) => !d.next).sort((a, b) => a.name.localeCompare(b.name))
  const current = selected ? destinations.find((d) => d.name === selected) ?? null : null

  // Destino sumiu (última viagem excluída/renomeada) → volta para a lista.
  useEffect(() => {
    if (selected && !current) setSelected(null)
  }, [selected, current])

  return (
    <div className="module-page">
      <div className="travel-layout">
        <div className="travel-main">
          {current ? (
            <DestinationDetail dest={current} onBack={() => setSelected(null)} />
          ) : (
            <>
              <div className="module-header">
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700 }}>🗺 Destinos</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {destinations.length} destino(s) · clique para ver viagens, documentos e recomendações
                  </p>
                </div>
              </div>

              {destinations.length === 0 && (
                <div className="empty-hint">Crie uma viagem na barra ao lado para ver destinos aqui.</div>
              )}

              {planned.length > 0 && (
                <>
                  <div className="travel-group-label">Com viagem planejada</div>
                  <div className="cards-grid" style={{ marginBottom: 20 }}>
                    {planned.map((d) => (
                      <DestinationCard key={d.name} dest={d} highlight onClick={() => setSelected(d.name)} />
                    ))}
                  </div>
                </>
              )}

              {others.length > 0 && (
                <>
                  <div className="travel-group-label">Outros destinos</div>
                  <div className="cards-grid">
                    {others.map((d) => (
                      <DestinationCard key={d.name} dest={d} onClick={() => setSelected(d.name)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <TripsSidebar selected={selected} onSelect={setSelected} />
      </div>
    </div>
  )
}

function DestinationCard({ dest, highlight, onClick }: { dest: Destination; highlight?: boolean; onClick: () => void }): React.ReactElement {
  const next = dest.next
  const dleft = next ? daysUntil(next.startDate) : null
  return (
    <button className={`stat-card travel-dest-card${highlight ? ' planned' : ''}`} onClick={onClick}>
      <div className="travel-trip-title">
        <span className="stat-card-value" style={{ fontSize: 15 }}>{dest.name}</span>
        {next && <span className="project-chip">{TRIP_STATUS[next.status] ?? next.status}</span>}
      </div>
      {next ? (
        <div className="stat-card-sub">
          {next.startDate ? `Ida ${next.startDate}` : 'Sem data'}
          {dleft != null && dleft > 0 && <strong> · faltam {dleft}d</strong>}
          {dleft != null && dleft <= 0 && <strong> · em curso</strong>}
        </div>
      ) : null}
      <div className="stat-card-sub">{dest.trips.length} viagem(ns)</div>
    </button>
  )
}

function DestinationDetail({ dest, onBack }: { dest: Destination; onBack: () => void }): React.ReactElement {
  return (
    <>
      <div className="module-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={onBack} style={{ marginBottom: 8 }}>← Destinos</button>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🗺 {dest.name}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{dest.trips.length} viagem(ns)</p>
        </div>
      </div>

      <div className="travel-detail">
        <div className="chart-section">
          <div className="chart-title">✈️ Viagens para {dest.name}</div>
          <div className="list-stack" style={{ marginTop: 10 }}>
            {dest.trips.map((t) => {
              const dleft = daysUntil(t.startDate)
              return (
                <div key={t.id} className="list-row" style={{ flexWrap: 'wrap' }}>
                  <span className="list-row-title">
                    {t.origin ? `${t.origin} → ` : ''}{t.destination}
                    <span className="travel-muted">
                      {' · '}{t.startDate ?? '?'} — {t.endDate ?? '?'}
                      {dleft != null && dleft >= 0 && t.status !== 'done' && ` · faltam ${dleft}d`}
                      {t.budget != null && ` · ${formatMoney(t.budget, t.currency)}`}
                    </span>
                  </span>
                  <span className="project-chip">{TRIP_STATUS[t.status] ?? t.status}</span>
                </div>
              )
            })}
          </div>
        </div>

        <TripDocuments trips={dest.trips} />
        <Recommendations />
      </div>
    </>
  )
}
