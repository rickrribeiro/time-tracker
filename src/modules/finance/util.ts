import { Transaction, Investment, InvestmentHistory } from '../../types'

/** Current month as YYYY-MM (local). */
export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Shift a YYYY-MM string by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

const SYMBOL: Record<string, string> = { BRL: 'R$', USD: '$', JPY: '¥', EUR: '€' }

export function formatMoney(amount: number, currency = 'BRL'): string {
  const sym = SYMBOL[currency] ?? currency + ' '
  return `${sym}${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Sum by currency for any items carrying a currency + amount. */
export function sumByCurrency(items: { currency: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of items) out[t.currency] = (out[t.currency] ?? 0) + t.amount
  return out
}

/** Convert an amount to the base currency using manual rates (rate = value of 1 unit in base). */
export function convertToBase(
  amount: number,
  currency: string,
  base: string,
  rates: Record<string, number>
): number {
  if (currency === base) return amount
  const r = rates[currency]
  return r != null ? amount * r : amount // missing rate → assume 1:1 (configure em Configurações)
}

/** Sum items converted to the base currency. */
export function sumInBase(
  items: { currency: string; amount: number }[],
  base: string,
  rates: Record<string, number>
): number {
  return items.reduce((s, t) => s + convertToBase(t.amount, t.currency, base, rates), 0)
}

/**
 * Value of an investment for a given month, carrying forward the most recent
 * snapshot at or before that month (holdings persist until re-entered). null if
 * the investment had no snapshot yet by then.
 */
export function investmentValueAtMonth(
  history: InvestmentHistory[],
  investmentId: number,
  month: string
): number | null {
  const rows = history.filter((h) => h.investmentId === investmentId && h.month <= month)
  if (!rows.length) return null
  return rows.reduce((a, b) => (b.month > a.month ? b : a)).amount
}

/** Total portfolio value at a month (carry-forward per investment), converted to base. */
export function portfolioAtMonth(
  investments: Investment[],
  history: InvestmentHistory[],
  month: string,
  base: string,
  rates: Record<string, number>
): number {
  let total = 0
  for (const inv of investments) {
    const v = investmentValueAtMonth(history, inv.id, month)
    if (v != null) total += convertToBase(v, inv.currency, base, rates)
  }
  return total
}

export interface ParsedCsvRow {
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  currency?: string
}

/** Keyword rules → seed category name. Used to auto-categorize imported rows. */
const CATEGORY_RULES: { name: string; keywords: string[] }[] = [
  { name: 'Transporte', keywords: ['uber', '99', 'taxi', 'metro', 'metrô', 'gasolina', 'posto', 'combust', 'passagem', 'voo', 'latam', 'gol', 'azul'] },
  { name: 'Alimentação', keywords: ['ifood', 'rappi', 'restaurante', 'mercado', 'supermerc', 'padaria', 'lanche', 'food', 'café', 'cafe', 'bar ', 'pizza', 'burger'] },
  { name: 'Moradia', keywords: ['aluguel', 'condominio', 'condomínio', 'luz', 'agua', 'água', 'energia', 'internet', 'vivo', 'claro', 'tim ', 'gás', 'gas '] },
  { name: 'Lazer', keywords: ['cinema', 'netflix', 'spotify', 'steam', 'show', 'ingresso', 'disney', 'hbo', 'prime'] },
  { name: 'Salário', keywords: ['salario', 'salário', 'salary', 'provento', 'pagamento recebido'] }
]

/** Match a transaction description to a seed category id (by name), or null. */
export function matchCategoryId(
  description: string,
  categories: { id: number; name: string }[]
): number | null {
  const d = description.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => d.includes(k))) {
      const cat = categories.find((c) => c.name.toLowerCase() === rule.name.toLowerCase())
      if (cat) return cat.id
    }
  }
  return null
}

/** Parse a bank-export CSV into rows. Best-effort: auto-detects delimiter and common headers. */
export function parseBankCsv(text: string): ParsedCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const delim = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','

  const split = (line: string): string[] =>
    line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))

  const header = split(lines[0]).map((h) => h.toLowerCase())
  const findCol = (...keys: string[]): number =>
    header.findIndex((h) => keys.some((k) => h.includes(k)))

  const dateCol = findCol('data', 'date')
  const amountCol = findCol('valor', 'amount', 'value', 'montante')
  const descCol = findCol('desc', 'title', 'histór', 'lança', 'estabelecimento', 'merchant', 'payee', 'reference')
  const currencyCol = findCol('currency', 'moeda', 'ccy')

  if (dateCol < 0 || amountCol < 0) return []

  const rows: ParsedCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = split(lines[i])
    if (cols.length <= Math.max(dateCol, amountCol)) continue
    const raw = cols[amountCol]
    // normalize "1.234,56" (BR) and "1,234.56"/"1234.56"
    let normalized = raw.replace(/[^\d.,-]/g, '')
    if (normalized.includes(',') && normalized.includes('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else if (normalized.includes(',')) {
      normalized = normalized.replace(',', '.')
    }
    const value = parseFloat(normalized)
    if (isNaN(value)) continue
    const currency = currencyCol >= 0 ? cols[currencyCol].toUpperCase().slice(0, 3) : undefined
    rows.push({
      date: normalizeDate(cols[dateCol]),
      description: descCol >= 0 ? cols[descCol] : '',
      amount: Math.abs(value),
      type: value < 0 ? 'expense' : 'income',
      currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined
    })
  }
  return rows
}

/** Accepts DD/MM/YYYY or YYYY-MM-DD → returns YYYY-MM-DD. */
function normalizeDate(s: string): string {
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return s
}

/** Serialize transactions to CSV text. */
export function transactionsToCsv(txs: Transaction[], categoryName: (id: number | null) => string): string {
  const header = 'date;type;category;description;amount;currency'
  const lines = txs.map((t) =>
    [t.date, t.type, categoryName(t.categoryId), (t.description ?? '').replace(/;/g, ','), t.amount, t.currency].join(';')
  )
  return [header, ...lines].join('\n')
}
