import {
  getSetting,
  getTransactions,
  bulkInsertTransactions,
  DbTransaction
} from '../database/queries'
import { decodeSecret } from './secrets'

const PLUGGY_API = 'https://api.pluggy.ai'
const OUTROS_CATEGORY_ID = 6 // seeded "Outros"

interface PluggyAccount {
  id: string
  currencyCode?: string
}
interface PluggyTransaction {
  id: string
  description?: string
  amount: number
  currencyCode?: string
  date: string
  type?: string // DEBIT | CREDIT
}

async function apiKey(): Promise<string> {
  const clientId = (await getSetting('pluggy_client_id')) ?? ''
  const clientSecret = decodeSecret(await getSetting('pluggy_client_secret')) ?? ''
  if (!clientId || !clientSecret) {
    throw new Error('Configure o Client ID e o Client Secret do Pluggy em Configurações.')
  }
  const res = await fetch(`${PLUGGY_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret })
  })
  const json = (await res.json()) as { apiKey?: string; message?: string }
  if (!res.ok || !json.apiKey) throw new Error(json.message || `Falha ao autenticar no Pluggy (${res.status}).`)
  return json.apiKey
}

async function get<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${PLUGGY_API}${path}`, { headers: { 'X-API-KEY': key } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pluggy ${path} falhou (${res.status}). ${body.slice(0, 120)}`)
  }
  return (await res.json()) as T
}

/**
 * Open Finance (Brasil) via the Pluggy aggregator.
 * Requires the user's Pluggy clientId/clientSecret and an itemId (a bank connected
 * through Pluggy Connect). Pulls transactions for all accounts of the item and
 * imports the new ones (deduped against existing by date+amount+description).
 * Returns { imported, skipped }.
 */
export async function syncPluggy(): Promise<{ imported: number; skipped: number }> {
  const itemId = (await getSetting('pluggy_item_id')) ?? ''
  if (!itemId) throw new Error('Configure o Item ID do Pluggy (banco conectado) em Configurações.')

  const key = await apiKey()
  const accounts = (await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(itemId)}`, key)).results

  const incoming: Omit<DbTransaction, 'id'>[] = []
  for (const acc of accounts) {
    const txs = (await get<{ results: PluggyTransaction[] }>(`/transactions?accountId=${acc.id}&pageSize=500`, key)).results
    for (const t of txs) {
      const isExpense = t.type === 'DEBIT' || t.amount < 0
      incoming.push({
        accountId: null,
        categoryId: OUTROS_CATEGORY_ID,
        amount: Math.abs(t.amount),
        currency: (t.currencyCode || acc.currencyCode || 'BRL').toUpperCase(),
        type: isExpense ? 'expense' : 'income',
        description: t.description ?? null,
        date: t.date.slice(0, 10)
      })
    }
  }

  // Dedup against what we already have (date+amount+description).
  const existing = await getTransactions()
  const seen = new Set(existing.map((t) => `${t.date}|${t.amount}|${t.description ?? ''}`))
  const fresh = incoming.filter((t) => !seen.has(`${t.date}|${t.amount}|${t.description ?? ''}`))

  if (fresh.length) await bulkInsertTransactions(fresh)
  return { imported: fresh.length, skipped: incoming.length - fresh.length }
}

/** Whether Pluggy credentials + item are configured. */
export async function pluggyConfigured(): Promise<boolean> {
  return !!(await getSetting('pluggy_client_id')) && !!(await getSetting('pluggy_item_id'))
}
