import React, { useEffect, useState } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { formatMoney, sumByCurrency } from '../util'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

export function InvestmentsPage(): React.ReactElement {
  const { investments, refresh, addInvestment, removeInvestment } = useFinanceStore()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('BRL')

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(): Promise<void> {
    const v = parseFloat(amount)
    if (!name.trim() || isNaN(v)) return
    await addInvestment(name.trim(), type.trim() || null, v, currency)
    setName('')
    setType('')
    setAmount('')
  }

  const totals = sumByCurrency(investments)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📈 Investimentos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Total: {Object.entries(totals).map(([c, v]) => formatMoney(v, c)).join(' · ') || formatMoney(0)}
          </p>
        </div>
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <input placeholder="Tipo (ex: ação, cripto)" value={type} onChange={(e) => setType(e.target.value)} />
          <input type="number" placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 110 }} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>+ Adicionar</button>
        </div>
      </div>

      <div className="list-stack">
        {investments.length === 0 && <div className="empty-hint">Nenhum investimento.</div>}
        {investments.map((i) => (
          <div key={i.id} className="list-row">
            <span className="list-row-title">{i.name}</span>
            {i.type && <span className="project-chip">{i.type}</span>}
            <span style={{ fontWeight: 600, minWidth: 90, textAlign: 'right' }}>{formatMoney(i.amount, i.currency)}</span>
            <button className="btn btn-danger btn-sm" onClick={() => removeInvestment(i.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
