import React from 'react'
import { ModulePlaceholder } from '../../_shared/ModulePlaceholder'
import flights from '../mock/flights.json'

export function TripsPage(): React.ReactElement {
  return (
    <ModulePlaceholder
      icon="✈️"
      title="Próximas viagens"
      subtitle="Origem, destino, datas, orçamento, status"
      note="Tabelas trips/flight_watches criadas. CRUD e monitoramento entram numa próxima sessão."
    />
  )
}

export function MonitoringPage(): React.ReactElement {
  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔔 Monitoramento de passagens</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Dados mockados (JSON local).</p>
        </div>
      </div>
      <div className="cards-grid">
        {flights.map((f, i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-label">
              {f.origin} → {f.destination}
            </div>
            <div className="stat-card-value">
              {f.price} {f.currency}
            </div>
            <div className="stat-card-sub">checado: {f.lastChecked.slice(0, 10)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DestinationsPage(): React.ReactElement {
  return <ModulePlaceholder icon="🗺" title="Destinos" subtitle="Destinos salvos" />
}

export function DocumentsPage(): React.ReactElement {
  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📄 Documentos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Checklist mockado.</p>
        </div>
      </div>
      <div className="list-stack">
        {['Passaporte', 'Visto', 'Vacina', 'Seguro viagem', 'Comprovante de hospedagem'].map((d) => (
          <div key={d} className="list-row">
            <input type="checkbox" disabled />
            <span className="list-row-title">{d}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RecommendationsPage(): React.ReactElement {
  return (
    <ModulePlaceholder
      icon="⭐"
      title="Recomendações"
      subtitle="Baseadas no seu perfil (user-profile.md)"
      note="Recomendações via IA local (Claude CLI) entram numa próxima sessão."
    />
  )
}
