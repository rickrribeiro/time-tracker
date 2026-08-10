import React, { useEffect, useState } from 'react'
import { Investment } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { formatMoney, sumByCurrency, monthLabel, investmentValueAtMonth } from '../util'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

/** A single investment row with an editable value for the selected month. */
function InvestmentRow({
  investment,
  value,
  isExplicit,
  onSave,
  onRemove
}: {
  investment: Investment
  value: number | null // carried-forward value for the month (null if none yet)
  isExplicit: boolean // true if there's a snapshot for this exact month
  onSave: (amount: number) => void
  onRemove: () => void
}): React.ReactElement {
  const [draft, setDraft] = useState(value != null ? String(value) : '')
  useEffect(() => {
    setDraft(value != null ? String(value) : '')
  }, [value, isExplicit])

  const parsed = parseFloat(draft)
  const dirty = draft.trim() !== '' && !isNaN(parsed) && (value == null || parsed !== value)

  function commit(): void {
    if (isNaN(parsed)) return
    onSave(parsed)
  }

  return (
    <div className="list-row">
      <span className="list-row-title">{investment.name}</span>
      {investment.type && <span className="project-chip">{investment.type}</span>}
      <span style={{ fontSize: 11, color: isExplicit ? 'var(--success)' : 'var(--text-muted)' }}>
        {isExplicit ? '● registrado' : value != null ? 'mantido' : 'sem valor'}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{investment.currency}</span>
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          style={{ width: 110, textAlign: 'right' }}
          placeholder="valor"
        />
        <button className="btn btn-primary btn-sm" onClick={commit} disabled={!dirty}>
          Salvar
        </button>
        <button className="btn btn-danger btn-sm" onClick={onRemove} title="Excluir investimento">
          ✕
        </button>
      </div>
    </div>
  )
}

export function InvestmentsPage(): React.ReactElement {
  const { investments, investmentHistory, month, refresh, addInvestment, setInvestmentValue, removeInvestment } =
    useFinanceStore()
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

  // per-currency total for the selected month (carry-forward values)
  const monthItems = investments.map((i) => ({
    currency: i.currency,
    amount: investmentValueAtMonth(investmentHistory, i.id, month) ?? 0
  }))
  const totals = sumByCurrency(monthItems)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📈 Investimentos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {monthLabel(month)} · Total:{' '}
            {Object.entries(totals)
              .map(([c, v]) => formatMoney(v, c))
              .join(' · ') || formatMoney(0)}
          </p>
        </div>
        <MonthNav />
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <input placeholder="Tipo (ex: ação, cripto)" value={type} onChange={(e) => setType(e.target.value)} />
          <input type="number" placeholder="Valor inicial" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>
            + Adicionar
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Registre o valor de cada investimento mês a mês (navegue pelos meses acima). Meses sem
          registro mantêm o último valor conhecido.
        </p>
      </div>

      <div className="list-stack">
        {investments.length === 0 && <div className="empty-hint">Nenhum investimento.</div>}
        {investments.map((i) => {
          const explicit = investmentHistory.some((h) => h.investmentId === i.id && h.month === month)
          const value = investmentValueAtMonth(investmentHistory, i.id, month)
          return (
            <InvestmentRow
              key={`${i.id}|${month}`}
              investment={i}
              value={value}
              isExplicit={explicit}
              onSave={(v) => setInvestmentValue(i.id, month, v)}
              onRemove={() => removeInvestment(i.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
