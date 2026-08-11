import React, { useEffect, useMemo } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { formatMoney, monthLabel } from '../util'

export function ReportsPage(): React.ReactElement {
  const { allTransactions, refresh } = useFinanceStore()

  useEffect(() => {
    refresh()
  }, [])

  // All months that actually have movement, from 2015 onward, newest first.
  const rows = useMemo(() => {
    const byMonth: Record<string, { income: number; expense: number }> = {}
    for (const t of allTransactions) {
      const m = t.date.slice(0, 7)
      if (m < '2015-01') continue
      if (!byMonth[m]) byMonth[m] = { income: 0, expense: 0 }
      if (t.type === 'income') byMonth[m].income += t.amount
      else if (t.type === 'expense') byMonth[m].expense += t.amount
    }
    return Object.entries(byMonth)
      .map(([m, v]) => ({ m, income: v.income, expense: v.expense, net: v.income - v.expense }))
      .sort((a, b) => b.m.localeCompare(a.m)) // newest first
  }, [allTransactions])

  const totals = rows.reduce(
    (s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }),
    { income: 0, expense: 0 }
  )

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🧾 Relatórios</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {rows.length} {rows.length === 1 ? 'mês' : 'meses'} com movimento (desde 2015 · valores somados independente de moeda)
          </p>
        </div>
      </div>

      <div className="chart-section">
        {rows.length === 0 ? (
          <div className="empty-hint">Sem transações registradas.</div>
        ) : (
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
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td>Total</td>
                  <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatMoney(totals.income)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{formatMoney(totals.expense)}</td>
                  <td style={{ textAlign: 'right', color: totals.income - totals.expense >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatMoney(totals.income - totals.expense)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
