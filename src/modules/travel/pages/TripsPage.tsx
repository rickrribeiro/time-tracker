import React, { useEffect, useState } from 'react'
import { Trip } from '../../../types'
import { useTripStore, daysUntil } from '../store/tripStore'
import { formatMoney } from '../../finance/util'

const STATUS: Record<string, string> = { planned: 'Planejada', booked: 'Reservada', ongoing: 'Em curso', done: 'Concluída' }
const CURRENCIES = ['BRL', 'JPY', 'USD', 'EUR']

interface FormState {
  origin: string
  destination: string
  startDate: string
  endDate: string
  budget: string
  currency: string
  status: string
}
const empty: FormState = { origin: '', destination: '', startDate: '', endDate: '', budget: '', currency: 'BRL', status: 'planned' }

export function TripsPage(): React.ReactElement {
  const { trips, refresh, createTrip, updateTrip, removeTrip } = useTripStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Trip | null>(null)
  const [form, setForm] = useState<FormState>(empty)

  useEffect(() => {
    refresh()
  }, [])

  function startCreate(): void {
    setEditing(null)
    setForm(empty)
    setShowForm(true)
  }
  function startEdit(t: Trip): void {
    setEditing(t)
    setForm({
      origin: t.origin ?? '',
      destination: t.destination,
      startDate: t.startDate ?? '',
      endDate: t.endDate ?? '',
      budget: t.budget != null ? String(t.budget) : '',
      currency: t.currency,
      status: t.status
    })
    setShowForm(true)
  }

  async function submit(): Promise<void> {
    if (!form.destination.trim()) return
    const payload = {
      origin: form.origin.trim() || null,
      destination: form.destination.trim(),
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      currency: form.currency,
      status: form.status
    }
    if (editing) await updateTrip({ ...editing, ...payload })
    else await createTrip(payload)
    setShowForm(false)
    setForm(empty)
    setEditing(null)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>✈️ Próximas viagens</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{trips.length} viagem(ns)</p>
        </div>
        <button className="btn btn-primary" onClick={startCreate}>+ Nova viagem</button>
      </div>

      {showForm && (
        <div className="chart-section" style={{ marginBottom: 16, maxWidth: 620 }}>
          <div className="chart-title">{editing ? 'Editar viagem' : 'Nova viagem'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <input placeholder="Origem" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
            <input placeholder="Destino *" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            <input type="number" placeholder="Orçamento" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} style={{ width: 120 }} />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={submit}>{editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      )}

      <div className="cards-grid">
        {trips.length === 0 && <div className="empty-hint">Nenhuma viagem planejada.</div>}
        {trips.map((t) => {
          const dleft = daysUntil(t.startDate)
          return (
            <div key={t.id} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-card-value" style={{ fontSize: 15 }}>
                  {t.origin ? `${t.origin} → ` : ''}{t.destination}
                </span>
                <span className="project-chip">{STATUS[t.status] ?? t.status}</span>
              </div>
              {(t.startDate || t.endDate) && (
                <div className="stat-card-sub">
                  {t.startDate ?? '?'} — {t.endDate ?? '?'}
                  {dleft != null && dleft >= 0 && <strong> · faltam {dleft}d</strong>}
                </div>
              )}
              {t.budget != null && <div className="stat-card-sub">Orçamento: {formatMoney(t.budget, t.currency)}</div>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>Editar</button>
                <button className="btn btn-danger btn-sm" onClick={() => removeTrip(t.id)}>Excluir</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
