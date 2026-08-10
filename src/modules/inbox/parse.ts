export interface ParsedCapture {
  title: string
  notes: string | null
}

/**
 * Light parsing of quick-capture text: "title // notes" splits off a rapid note.
 * No auto-categorization — inbox items are only promoted to TODO on approval.
 */
export function parseCapture(raw: string): ParsedCapture {
  let text = raw.trim()
  let notes: string | null = null

  const noteParts = text.split(/\s*\/\/\s*/)
  if (noteParts.length > 1) {
    text = noteParts[0].trim()
    notes = noteParts.slice(1).join(' // ').trim() || null
  }

  return { title: text, notes }
}
