import React, { useEffect, useState } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { formatMoney } from '../util'

export function BudgetPage(): React.ReactElement {
  const { categories, budgets, transactions, refresh, setBudget } = useFinanceStore()
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  useEffect(() => {
    refresh()
  }, [])

  const expenseCats = categories.filter((c) => c.type === 'expense')
  const budgetFor = (catId: number): number => budgets.find((b) => b.categoryId === catId)?.amount ?? 0
  const spentFor = (catId: number): number =>
    transactions.filter((t) => t.type === 'expense' && t.categoryId === catId).reduce((s, t) => s + t.amount, 0)

  async function save(catId: number): Promise<void> {
    const v = parseFloat(drafts[catId] ?? '')
    if (isNaN(v)) return
    await setBudget(catId, v)
    setDrafts((d) => ({ ...d, [catId]: '' }))
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📉 Orçamento</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Meta mensal por categoria (BRL)</p>
        </div>
        <MonthNav />
      </div>

      <div className="list-stack">
        {expenseCats.map((c) => {
          const budget = budgetFor(c.id)
          const spent = spentFor(c.id)
          const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0
          const over = budget > 0 && spent > budget
          return (
            <div key={c.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="priority-dot" style={{ background: c.color }} />
                <span className="list-row-title">{c.name}</span>
                <span style={{ fontSize: 13, color: over ? 'var(--danger)' : 'var(--text-secondary)' }}>
                  {formatMoney(spent)} / {budget > 0 ? formatMoney(budget) : '—'} {over && '⚠'}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    type="number"
                    placeholder="meta"
                    value={drafts[c.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    style={{ width: 90 }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => save(c.id)}>Salvar</button>
                </div>
              </div>
              {budget > 0 && (
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${pct}%`, background: over ? 'var(--danger)' : c.color }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
