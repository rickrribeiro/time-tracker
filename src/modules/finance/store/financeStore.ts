import { create } from 'zustand'
import { Account, Category, Transaction, Budget, Investment } from '../../../types'
import { currentMonth } from '../util'

interface FinanceState {
  month: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[] // for `month`
  allTransactions: Transaction[] // for reports / evolution
  budgets: Budget[] // for `month`
  investments: Investment[]

  setMonth: (m: string) => void
  refresh: () => Promise<void>

  addAccount: (name: string, currency: string, balance: number) => Promise<void>
  removeAccount: (id: number) => Promise<void>
  addCategory: (name: string, type: string, color: string) => Promise<void>
  removeCategory: (id: number) => Promise<void>
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>
  removeTransaction: (id: number) => Promise<void>
  importTransactions: (rows: Omit<Transaction, 'id'>[]) => Promise<number>
  setBudget: (categoryId: number, amount: number) => Promise<void>
  addInvestment: (name: string, type: string | null, amount: number, currency: string) => Promise<void>
  removeInvestment: (id: number) => Promise<void>

  categoryName: (id: number | null) => string
  categoryColor: (id: number | null) => string
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  month: currentMonth(),
  accounts: [],
  categories: [],
  transactions: [],
  allTransactions: [],
  budgets: [],
  investments: [],

  setMonth: (m) => {
    set({ month: m })
    get().refresh()
  },

  refresh: async () => {
    const month = get().month
    const [accounts, categories, transactions, allTransactions, budgets, investments] = await Promise.all([
      window.api.accounts.getAll(),
      window.api.categories.getAll(),
      window.api.transactions.getAll(month),
      window.api.transactions.getAll(),
      window.api.budgets.getForMonth(month),
      window.api.investments.getAll()
    ])
    set({ accounts, categories, transactions, allTransactions, budgets, investments })
  },

  addAccount: async (name, currency, balance) => {
    await window.api.accounts.create(name, currency, balance)
    await get().refresh()
  },
  removeAccount: async (id) => {
    await window.api.accounts.delete(id)
    await get().refresh()
  },
  addCategory: async (name, type, color) => {
    await window.api.categories.create(name, type, color)
    await get().refresh()
  },
  removeCategory: async (id) => {
    await window.api.categories.delete(id)
    await get().refresh()
  },
  addTransaction: async (t) => {
    await window.api.transactions.create(t.accountId, t.categoryId, t.amount, t.currency, t.type, t.description, t.date)
    await get().refresh()
  },
  removeTransaction: async (id) => {
    await window.api.transactions.delete(id)
    await get().refresh()
  },
  importTransactions: async (rows) => {
    const n = await window.api.transactions.bulk(rows)
    await get().refresh()
    return n
  },
  setBudget: async (categoryId, amount) => {
    await window.api.budgets.set(categoryId, get().month, amount)
    await get().refresh()
  },
  addInvestment: async (name, type, amount, currency) => {
    await window.api.investments.create(name, type, amount, currency)
    await get().refresh()
  },
  removeInvestment: async (id) => {
    await window.api.investments.delete(id)
    await get().refresh()
  },

  categoryName: (id) => get().categories.find((c) => c.id === id)?.name ?? '—',
  categoryColor: (id) => get().categories.find((c) => c.id === id)?.color ?? '#6b7280'
}))
