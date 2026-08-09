import React, { useEffect, useRef, useState } from 'react'
import { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'
import { MonthNav } from '../components/MonthNav'
import { TransactionEditor } from '../components/TransactionEditor'
import { formatMoney, parseBankCsv, transactionsToCsv } from '../util'
import { localDateStr } from '../../../utils/dates'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

export function TransactionsPage(): React.ReactElement {
  const {
    transactions,
    categories,
    accounts,
    month,
    refresh,
    addTransaction,
    removeTransaction,
    importTransactions,
    categoryName
  } = useFinanceStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('BRL')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [accountId, setAccountId] = useState<number | ''>('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(localDateStr(new Date()))
  const [editing, setEditing] = useState<Transaction | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function handleAdd(): Promise<void> {
    const value = parseFloat(amount)
    if (isNaN(value) || value <= 0) return
    await addTransaction({
      accountId: accountId === '' ? null : Number(accountId),
      categoryId: categoryId === '' ? null : Number(categoryId),
      amount: value,
      currency,
      type,
      description: description.trim() || null,
      date
    })
    setAmount('')
    setDescription('')
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = parseBankCsv(text)
    if (rows.length === 0) {
      alert('Não consegui reconhecer o CSV. Esperado colunas de data e valor.')
      return
    }
    if (!confirm(`Importar ${rows.length} transações para ${month}? (categoria: Outros)`)) return
    await importTransactions(
      rows.map((r) => ({
        accountId: accountId === '' ? null : Number(accountId),
        categoryId: 6, // "Outros" seed
        amount: r.amount,
        currency,
        type: r.type,
        description: r.description || null,
        date: r.date
      }))
    )
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleExport(): void {
    const csv = transactionsToCsv(transactions, categoryName)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transacoes-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>💸 Transações</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{transactions.length} no mês</p>
        </div>
        <MonthNav />
      </div>

      <div className="chart-section" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <input type="number" placeholder="Valor" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 100 }} />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Categoria…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Conta…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>+ Adicionar</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsv} style={{ display: 'none' }} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>📥 Importar CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={transactions.length === 0}>📤 Exportar CSV</button>
        </div>
      </div>

      <div className="list-stack">
        {transactions.length === 0 && <div className="empty-hint">Nenhuma transação neste mês.</div>}
        {transactions.map((t: Transaction) => (
          <div key={t.id} className="list-row">
            <span className="due-badge due-future">{t.date.slice(5)}</span>
            <span className="list-row-title">{t.description || categoryName(t.categoryId)}</span>
            <span className="project-chip">{categoryName(t.categoryId)}</span>
            <span style={{ fontWeight: 600, color: t.type === 'income' ? 'var(--success)' : 'var(--danger)', minWidth: 90, textAlign: 'right' }}>
              {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, t.currency)}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(t)}>Editar</button>
            <button className="btn btn-danger btn-sm" onClick={() => removeTransaction(t.id)}>✕</button>
          </div>
        ))}
      </div>

      {editing && <TransactionEditor tx={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
