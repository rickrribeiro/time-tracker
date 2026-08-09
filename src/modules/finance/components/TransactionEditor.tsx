import React, { useState } from 'react'
import { Transaction } from '../../../types'
import { useFinanceStore } from '../store/financeStore'

const CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

export function TransactionEditor({ tx, onClose }: { tx: Transaction; onClose: () => void }): React.ReactElement {
  const { categories, accounts, updateTransaction } = useFinanceStore()
  const [type, setType] = useState(tx.type)
  const [amount, setAmount] = useState(String(tx.amount))
  const [currency, setCurrency] = useState(tx.currency)
  const [categoryId, setCategoryId] = useState<number | ''>(tx.categoryId ?? '')
  const [accountId, setAccountId] = useState<number | ''>(tx.accountId ?? '')
  const [description, setDescription] = useState(tx.description ?? '')
  const [date, setDate] = useState(tx.date)

  async function save(): Promise<void> {
    const v = parseFloat(amount)
    if (isNaN(v) || v <= 0) return
    await updateTransaction({
      ...tx,
      type,
      amount: v,
      currency,
      categoryId: categoryId === '' ? null : Number(categoryId),
      accountId: accountId === '' ? null : Number(accountId),
      description: description.trim() || null,
      date
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>Editar transação</h2>
        <div className="editor-row">
          <div className="editor-field">
            <label>Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
            </select>
          </div>
          <div className="editor-field">
            <label>Valor</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="editor-field">
            <label>Moeda</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Categoria</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="editor-field">
            <label>Conta</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="editor-field">
            <label>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="editor-field">
          <label>Descrição</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
