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
  const clientId = (decodeSecret(await getSetting('pluggy_client_id')) ?? '').trim()
  const clientSecret = (decodeSecret(await getSetting('pluggy_client_secret')) ?? '').trim()
  if (!clientId || !clientSecret) {
    throw new Error('Configure o Client ID e o Client Secret do Pluggy em Configurações.')
  }
  let res: Response
  try {
    res = await fetch(`${PLUGGY_API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret })
    })
  } catch (e) {
    throw new Error(`Sem conexão com o Pluggy: ${e instanceof Error ? e.message : String(e)}`)
  }
  const body = await res.text().catch(() => '')
  let json: { apiKey?: string; message?: string } = {}
  try {
    json = JSON.parse(body)
  } catch {
    // non-JSON response
  }
  if (!res.ok || !json.apiKey) {
    const detail = json.message || body.slice(0, 160) || res.statusText
    throw new Error(`Falha ao autenticar no Pluggy (${res.status}). ${detail}`)
  }
  return json.apiKey
}

/**
 * Create a Pluggy Connect token (server-side) so the renderer can open the
 * Pluggy Connect widget and let the user link a bank (which yields an itemId).
 */
export async function createConnectToken(): Promise<string> {
  const key = await apiKey()
  let res: Response
  try {
    res = await fetch(`${PLUGGY_API}/connect_token`, {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
  } catch (e) {
    throw new Error(`Sem conexão com o Pluggy: ${e instanceof Error ? e.message : String(e)}`)
  }
  const body = await res.text().catch(() => '')
  let json: { accessToken?: string; message?: string } = {}
  try {
    json = JSON.parse(body)
  } catch {
    // non-JSON
  }
  if (!res.ok || !json.accessToken) {
    throw new Error(`Falha ao criar connect token (${res.status}). ${json.message || body.slice(0, 160)}`)
  }
  return json.accessToken
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
 * Fetch every transaction of an account via the cursor-paginated `/v2/transactions`
 * endpoint (the old page-based `/transactions` was deprecated → 410). Pages are a
 * fixed 500 (no `pageSize` param — it 400s); `next` is a URL carrying the `after`
 * cursor, null when exhausted.
 */
async function fetchAllTransactions(accountId: string, key: string): Promise<PluggyTransaction[]> {
  const out: PluggyTransaction[] = []
  let after: string | null = null
  for (let i = 0; i < 200; i++) {
    const qs = new URLSearchParams({ accountId })
    if (after) qs.set('after', after)
    const page = await get<{ results: PluggyTransaction[]; next: string | null }>(
      `/v2/transactions?${qs.toString()}`,
      key
    )
    out.push(...(page.results ?? []))
    if (!page.next) break
    try {
      after = new URL(page.next, PLUGGY_API).searchParams.get('after')
    } catch {
      after = null
    }
    if (!after) break
  }
  return out
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
  if (!accounts || accounts.length === 0) {
    throw new Error('Nenhuma conta encontrada para esse Item ID. Verifique se o Item está conectado e pronto no Pluggy (e se o Item ID está correto).')
  }

  const incoming: Omit<DbTransaction, 'id'>[] = []
  for (const acc of accounts) {
    const txs = await fetchAllTransactions(acc.id, key)
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
