/** Format a Date as YYYY-MM-DD using LOCAL time (not UTC) */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Start of a local calendar day as UTC ISO string (for DB queries) */
export function localDayStartISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString()
}

/** End of a local calendar day as UTC ISO string (for DB queries) */
export function localDayEndISO(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString()
}
