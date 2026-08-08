import React, { useEffect } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { formatMoney, shiftMonth, monthLabel } from '../util'

export function ReportsPage(): React.ReactElement {
  const { allTransactions, month, refresh } = useFinanceStore()

  useEffect(() => {
    refresh()
  }, [])

  const months: string[] = []
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(month, -i))

  const rows = months.map((m) => {
    const txs = allTransactions.filter((t) => t.date.slice(0, 7) === m)
    const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { m, income, expense, net: income - expense }
  })

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🧾 Relatórios</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Resumo dos últimos 6 meses (valores somados independente de moeda)</p>
        </div>
      </div>

      <div className="chart-section">
        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th style={{ textAlign: 'right' }}>Receitas</th>
                <th style={{ textAlign: 'right' }}>Despesas</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.m}>
                  <td style={{ textTransform: 'capitalize' }}>{monthLabel(r.m)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatMoney(r.income)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{formatMoney(r.expense)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: r.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatMoney(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
