import type { DateWindow, TripDates } from '../../shared/flights'

/**
 * Datas de calendário como 'YYYY-MM-DD', aritmética em UTC (sem fuso/horário de verão).
 * O "hoje" é sempre injetado para os testes serem determinísticos.
 */
const DAY = 86_400_000

export function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
}

export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Limite absoluto de dias por janela — evita que um erro gere milhares de datas. */
const MAX_WINDOW_DAYS = 62

export function windowBounds(w: DateWindow): { from: string; to: string } | null {
  switch (w.mode) {
    case 'exact':
      return isIsoDate(w.date) ? { from: w.date, to: w.date } : null
    case 'flex': {
      if (!isIsoDate(w.date)) return null
      const n = Math.max(0, Math.min(15, Math.floor(w.flexDays ?? 0)))
      return { from: addDays(w.date, -n), to: addDays(w.date, n) }
    }
    case 'range':
      if (!isIsoDate(w.from) || !isIsoDate(w.to)) return null
      return w.from <= w.to ? { from: w.from, to: w.to } : { from: w.to, to: w.from }
    case 'month': {
      if (!w.month || !/^\d{4}-\d{2}$/.test(w.month)) return null
      const from = `${w.month}-01`
      const [y, m] = w.month.split('-').map(Number)
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      return { from, to: `${w.month}-${String(last).padStart(2, '0')}` }
    }
  }
}

/** Datas (sem duplicatas, ordenadas) de um conjunto de janelas, descartando o passado. */
export function expandWindows(windows: DateWindow[], today: string): string[] {
  const out = new Set<string>()
  for (const w of windows) {
    const b = windowBounds(w)
    if (!b) continue
    const span = Math.min(diffDays(b.from, b.to), MAX_WINDOW_DAYS)
    for (let i = 0; i <= span; i++) {
      const d = addDays(b.from, i)
      if (d >= today) out.add(d)
    }
  }
  return [...out].sort()
}

export interface DatePair {
  depart: string
  ret: string | null
}

/**
 * Combinações válidas ida/volta. Ida e volta: usa as janelas de volta se houver;
 * senão gera a volta pela duração mínima/máxima. Sempre respeita min/max de estadia.
 */
export function datePairs(dates: TripDates, today: string, maxPairs = 2000): DatePair[] {
  const departs = expandWindows(dates.windows, today)
  if (dates.tripType === 'oneway') return departs.map((d) => ({ depart: d, ret: null }))
  const minStay = Math.max(0, dates.minStayDays ?? 1)
  const maxStay = dates.maxStayDays ?? (dates.returnWindows.length ? 365 : minStay)
  const returns = dates.returnWindows.length ? expandWindows(dates.returnWindows, today) : null
  const out: DatePair[] = []
  for (const d of departs) {
    const candidates = returns ?? Array.from({ length: Math.min(maxStay, 60) - minStay + 1 }, (_, i) => addDays(d, minStay + i))
    for (const r of candidates) {
      const stay = diffDays(d, r)
      if (stay < minStay || stay > maxStay) continue
      out.push({ depart: d, ret: r })
      if (out.length >= maxPairs) return out
    }
  }
  return out
}

/** Problemas de configuração de datas (para validação no salvar e estado "aguardando configuração"). */
export function validateDates(dates: TripDates, today: string): string[] {
  const errs: string[] = []
  if (!dates.windows.length) errs.push('Defina ao menos uma janela de datas de ida.')
  for (const w of dates.windows) {
    const b = windowBounds(w)
    if (!b) errs.push('Há uma janela de ida incompleta.')
    else if (b.to < today) errs.push(`A janela ${b.from} → ${b.to} está no passado.`)
  }
  if (dates.tripType === 'roundtrip') {
    if (!dates.returnWindows.length && dates.minStayDays == null) errs.push('Ida e volta: defina a janela de volta ou a duração da viagem.')
    if (dates.minStayDays != null && dates.maxStayDays != null && dates.minStayDays > dates.maxStayDays)
      errs.push('Duração mínima maior que a máxima.')
  }
  if (!errs.length && datePairs(dates, today, 1).length === 0) errs.push('Nenhuma combinação de datas válida (passado ou duração impossível).')
  return errs
}

/** Agrupa datas por mês 'YYYY-MM' (para provedores que consultam o mês inteiro). */
export function monthsOf(dates: string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 7)))].sort()
}

/** Amostra espaçada de datas (descoberta): extremos + passo uniforme. */
export function sampleDates(dates: string[], n: number): string[] {
  if (dates.length <= n) return dates
  if (n <= 1) return [dates[Math.floor(dates.length / 2)]]
  const out = new Set<string>()
  for (let i = 0; i < n; i++) out.add(dates[Math.round((i * (dates.length - 1)) / (n - 1))])
  return [...out]
}

export function summarizeDates(dates: TripDates): string {
  const parts = dates.windows
    .map((w) => {
      const b = windowBounds(w)
      if (!b) return null
      const fmt = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}`
      if (w.mode === 'month') return `mês ${w.month!.slice(5)}/${w.month!.slice(0, 4)}`
      if (w.mode === 'flex') return `${fmt(w.date!)} ±${w.flexDays ?? 0}d`
      return b.from === b.to ? fmt(b.from) : `${fmt(b.from)}–${fmt(b.to)}`
    })
    .filter(Boolean)
  const head = parts.join(', ') || 'sem datas'
  if (dates.tripType === 'oneway') return `${head} · só ida`
  const stay =
    dates.minStayDays != null || dates.maxStayDays != null ? ` · ${dates.minStayDays ?? '?'}–${dates.maxStayDays ?? '?'} dias` : ''
  return `${head} · ida e volta${stay}`
}
