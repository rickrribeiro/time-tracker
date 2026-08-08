export type CaptureSuggestion = 'task' | 'trip' | 'finance'

export interface ParsedCapture {
  title: string
  notes: string | null
  suggestion: CaptureSuggestion
  origin: string | null
  destination: string | null
  amount: number | null
}

/** Normalize a money-ish string ("1.234,56", "1,234.56", "8200") to a number. */
function parseAmount(raw: string): number | null {
  let n = raw.replace(/[^\d.,]/g, '')
  if (!n) return null
  if (n.includes(',') && n.includes('.')) n = n.replace(/\./g, '').replace(',', '.')
  else if (n.includes(',')) n = n.replace(',', '.')
  const v = parseFloat(n)
  return isNaN(v) ? null : v
}

/**
 * Light parsing of quick-capture text:
 * - "title // notes" splits off a rapid note.
 * - "A → B" / "A -> B" extracts origin/destination.
 * - keywords / currency suggest routing (trip | finance | task).
 * - a money-ish number becomes `amount` (for the → Financeiro conversion).
 */
export function parseCapture(raw: string): ParsedCapture {
  let text = raw.trim()
  let notes: string | null = null

  const noteParts = text.split(/\s*\/\/\s*/)
  if (noteParts.length > 1) {
    text = noteParts[0].trim()
    notes = noteParts.slice(1).join(' // ').trim() || null
  }

  let origin: string | null = null
  let destination: string | null = null
  const arrow = text.match(/^(.+?)\s*(?:→|->)\s*(.+)$/)
  if (arrow) {
    origin = arrow[1].trim() || null
    destination = arrow[2].trim() || null
  }

  const lower = text.toLowerCase()
  const hasMoney = /(r\$|\$|¥|€)/i.test(text)
  const financeWords = /\b(comprar|pagar|gasto|gastar|conta|boleto|fatura|assinatura|mercado|aluguel)\b/
  const tripWords = /\b(passagem|passagens|voo|voos|viagem|viajar|flight|trip|hotel|hospedagem)\b/

  let suggestion: CaptureSuggestion = 'task'
  if (arrow || tripWords.test(lower)) suggestion = 'trip'
  else if (hasMoney || financeWords.test(lower)) suggestion = 'finance'

  const moneyMatch = text.match(/(?:r\$|\$|¥|€)\s*([\d.,]+)/i) || text.match(/\b(\d[\d.,]*)\b/)
  const amount = moneyMatch ? parseAmount(moneyMatch[1]) : null

  return { title: text, notes, suggestion, origin, destination, amount }
}

export const SUGGESTION_LABEL: Record<CaptureSuggestion, string> = {
  task: '📋 Parece uma tarefa',
  trip: '✈️ Parece uma viagem — processe para Viagens',
  finance: '💸 Parece financeiro — processe para Transações'
}
