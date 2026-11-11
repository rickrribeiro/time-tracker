import React, { useState } from 'react'
import { Trip } from '../../../types'
import { useTripStore, daysUntil, isUpcoming } from '../store/tripStore'
import { formatMoney } from '../../finance/util'

export const TRIP_STATUS: Record<string, string> = { planned: 'Planejada', booked: 'Reservada', ongoing: 'Em curso', done: 'Concluída' }
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

interface Props {
  /** Destino aberto no momento: filtra nada, só pré-preenche o formulário e destaca as viagens dele. */
  selected: string | null
  onSelect: (destination: string) => void
}

/** Barra lateral interna de Destinos: lista de viagens + criar/editar. */
export function TripsSidebar({ selected, onSelect }: Props): React.ReactElement {
  const { trips, createTrip, updateTrip, removeTrip } = useTripStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Trip | null>(null)
  const [form, setForm] = useState<FormState>(empty)

  const upcoming = trips.filter(isUpcoming).sort(byStart)
  const past = trips.filter((t) => !isUpcoming(t)).sort((a, b) => byStart(b, a))

  function startCreate(): void {
    setEditing(null)
    setForm({ ...empty, destination: selected ?? '' })
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
  function close(): void {
    setShowForm(false)
    setEditing(null)
    setForm(empty)
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
    close()
  }

  async function remove(t: Trip): Promise<void> {
    if (!confirm(`Excluir a viagem para ${t.destination}?`)) return
    await removeTrip(t.id)
  }

  function renderTrip(t: Trip): React.ReactElement {
    const dleft = daysUntil(t.startDate)
    const active = selected != null && t.destination.trim() === selected
    return (
      <div key={t.id} className={`travel-trip${active ? ' active' : ''}`}>
        <button className="travel-trip-main" onClick={() => onSelect(t.destination.trim())}>
          <div className="travel-trip-title">
            <span>{t.origin ? `${t.origin} → ` : ''}{t.destination}</span>
            <span className="project-chip">{TRIP_STATUS[t.status] ?? t.status}</span>
          </div>
          {(t.startDate || t.endDate) && (
            <div className="travel-muted">
              {t.startDate ?? '?'} — {t.endDate ?? '?'}
              {dleft != null && dleft >= 0 && <strong> · faltam {dleft}d</strong>}
            </div>
          )}
          {t.budget != null && <div className="travel-muted">Orçamento: {formatMoney(t.budget, t.currency)}</div>}
        </button>
        <div className="travel-trip-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)}>Editar</button>
          <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>Excluir</button>
        </div>
      </div>
    )
  }

  return (
    <aside className="travel-sidebar">
      <div className="travel-section-head">
        <div className="chart-title">✈️ Viagens <span className="travel-muted">· {trips.length}</span></div>
        <button className="btn btn-primary btn-sm" onClick={startCreate}>+ Nova</button>
      </div>

      {showForm && (
        <div className="travel-form">
          <div className="travel-form-title">{editing ? 'Editar viagem' : 'Nova viagem'}</div>
          <input placeholder="Destino *" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          <input placeholder="Origem" value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
          <div className="travel-form-row">
            <input type="date" title="Ida" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <input type="date" title="Volta" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="travel-form-row">
            <input type="number" placeholder="Orçamento" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {Object.entries(TRIP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={close}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={submit}>{editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      )}

      {trips.length === 0 && <div className="empty-hint">Nenhuma viagem ainda.</div>}
      {upcoming.length > 0 && <div className="travel-group-label">Próximas</div>}
      {upcoming.map(renderTrip)}
      {past.length > 0 && <div className="travel-group-label">Anteriores</div>}
      {past.map(renderTrip)}
    </aside>
  )
}

/** Ordena por data de ida (sem data vai pro fim). */
export function byStart(a: Trip, b: Trip): number {
  return (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999')
}
