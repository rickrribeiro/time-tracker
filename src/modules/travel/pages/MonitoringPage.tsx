import React, { useEffect, useState } from 'react'
import { useTripStore } from '../store/tripStore'
import { formatMoney } from '../../finance/util'

const CURRENCIES = ['JPY', 'BRL', 'USD', 'EUR']

export function MonitoringPage(): React.ReactElement {
  const { watches, trips, refresh, addWatch, removeWatch, refreshWatchPrice } = useTripStore()
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('JPY')
  const [tripId, setTripId] = useState<number | ''>('')
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(): Promise<void> {
    if (!destination.trim()) return
    await addWatch(
      tripId === '' ? null : Number(tripId),
      origin.trim() || null,
      destination.trim(),
      price ? parseFloat(price) : null,
      currency
    )
    setOrigin('')
    setDestination('')
    setPrice('')
  }

  async function handleSearch(): Promise<void> {
    if (!origin.trim() || !destination.trim()) {
      setError('Informe origem e destino para buscar.')
      return
    }
    setSearching(true)
    setError('')
    try {
      const found = await window.api.flights.search(origin.trim(), destination.trim(), currency)
      setPrice(String(found))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSearching(false)
    }
  }

  async function handleRefresh(id: number): Promise<void> {
    setBusyId(id)
    setError('')
    try {
      await refreshWatchPrice(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔔 Monitoramento de passagens</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Registre trechos e o menor preço observado. Busca automática de preços entra numa próxima sessão.
          </p>
        </div>
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Origem" value={origin} onChange={(e) => setOrigin(e.target.value)} />
          <input placeholder="Destino *" value={destination} onChange={(e) => setDestination(e.target.value)} />
          <input type="number" placeholder="Preço" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 100 }} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={tripId} onChange={(e) => setTripId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Viagem…</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.destination}</option>)}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={handleSearch} disabled={searching}>
            {searching ? 'Buscando…' : '🔎 Buscar preço'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>+ Monitorar</button>
        </div>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Preços via Skyscanner (RapidAPI) — configure a chave em Configurações.
        </p>
      </div>

      <div className="cards-grid">
        {watches.length === 0 && <div className="empty-hint">Nenhum trecho monitorado.</div>}
        {watches.map((w) => (
          <div key={w.id} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-card-label">{w.origin ? `${w.origin} → ` : ''}{w.destination}</span>
              <button className="btn btn-danger btn-sm" onClick={() => removeWatch(w.id)}>✕</button>
            </div>
            <div className="stat-card-value" style={{ fontSize: 16 }}>
              {w.price != null ? formatMoney(w.price, w.currency) : '—'}
            </div>
            {w.lastChecked && <div className="stat-card-sub">checado: {w.lastChecked.slice(0, 10)}</div>}
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => handleRefresh(w.id)}
              disabled={busyId === w.id}
            >
              {busyId === w.id ? 'Atualizando…' : '🔄 Atualizar preço'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
