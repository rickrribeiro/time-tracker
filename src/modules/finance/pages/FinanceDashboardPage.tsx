import React, { useEffect } from 'react'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { formatMoney, sumByCurrency, shiftMonth, monthLabel } from '../util'

export function FinanceDashboardPage(): React.ReactElement {
  const { accounts, transactions, allTransactions, budgets, month, refresh, categoryName, categoryColor } =
    useFinanceStore()

  useEffect(() => {
    refresh()
  }, [])

  const income = transactions.filter((t) => t.type === 'income')
  const expense = transactions.filter((t) => t.type === 'expense')
  const incomeByCur = sumByCurrency(income)
  const expenseByCur = sumByCurrency(expense)

  // balances by currency (from accounts)
  const balByCur: Record<string, number> = {}
  for (const a of accounts) balByCur[a.currency] = (balByCur[a.currency] ?? 0) + a.balance

  // top expense categories this month (BRL-agnostic, sum absolute amounts)
  const byCat: Record<number, number> = {}
  for (const t of expense) if (t.categoryId != null) byCat[t.categoryId] = (byCat[t.categoryId] ?? 0) + t.amount
  const topCats = Object.entries(byCat)
    .map(([id, amt]) => ({ id: Number(id), amt }))
    .sort((a, b) => b.amt - a.amt)
    .slice(0, 5)
  const topMax = topCats[0]?.amt ?? 1

  // last 6 months net (expense) evolution
  const months: string[] = []
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(month, -i))
  const evolution = months.map((m) => {
    const exp = allTransactions
      .filter((t) => t.type === 'expense' && t.date.slice(0, 7) === m)
      .reduce((s, t) => s + t.amount, 0)
    return { m, exp }
  })
  const evoMax = Math.max(1, ...evolution.map((e) => e.exp))

  const budgetTotal = budgets.reduce((s, b) => s + b.amount, 0)
  const spentTotal = expense.reduce((s, t) => s + t.amount, 0)

  const money = (rec: Record<string, number>): string =>
    Object.keys(rec).length ? Object.entries(rec).map(([c, v]) => formatMoney(v, c)).join(' · ') : formatMoney(0)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>💰 Finanças</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Visão do mês</p>
        </div>
        <MonthNav />
      </div>

      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Saldo total (contas)</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{money(balByCur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Receitas do mês</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: 'var(--success)' }}>{money(incomeByCur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Gastos do mês</div>
          <div className="stat-card-value" style={{ fontSize: 16, color: 'var(--danger)' }}>{money(expenseByCur)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Meta (orçamento)</div>
          <div className="stat-card-value" style={{ fontSize: 16 }}>{formatMoney(spentTotal)} / {formatMoney(budgetTotal)}</div>
          {budgetTotal > 0 && (
            <div className="stat-card-sub" style={{ color: spentTotal > budgetTotal ? 'var(--danger)' : 'var(--text-muted)' }}>
              {spentTotal > budgetTotal ? '⚠ acima da meta' : `${Math.round((spentTotal / budgetTotal) * 100)}% usado`}
            </div>
          )}
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">Top categorias (gastos do mês)</div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topCats.length === 0 && <div className="empty-hint">Sem gastos neste mês.</div>}
          {topCats.map((c) => (
            <div key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                <span>{categoryName(c.id)}</span>
                <span>{formatMoney(c.amt)}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(c.amt / topMax) * 100}%`, background: categoryColor(c.id) }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">Evolução de gastos (6 meses)</div>
        <div className="evo-bars">
          {evolution.map((e) => (
            <div key={e.m} className="evo-bar-col">
              <div className="evo-bar" style={{ height: `${(e.exp / evoMax) * 100}%` }} title={formatMoney(e.exp)} />
              <span className="evo-bar-label">{monthLabel(e.m).slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
