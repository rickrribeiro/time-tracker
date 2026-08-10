import React from 'react'

/** Inline: `code`, **bold**, *italic*, [text](url). React escapes text → XSS-safe. */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyBase}-${i++}`
    if (tok.startsWith('`')) {
      out.push(<code key={key} className="md-code">{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith('**')) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*')) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>)
    } else {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)
      if (mm) {
        const url = mm[2]
        out.push(
          <a key={key} className="md-link" style={{ cursor: 'pointer' }} onClick={() => window.api.app.openExternal(url)}>
            {mm[1]}
          </a>
        )
      } else out.push(tok)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/**
 * Minimal in-house Markdown renderer (no external lib, no dangerouslySetInnerHTML).
 * Supports: #..###### headings, ``` code fences, > quotes, - / 1. lists, and
 * paragraphs with inline formatting. Good enough for study notes.
 */
export function renderMarkdown(md: string): React.ReactNode {
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    // code fence
    if (/^```/.test(line)) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++ // closing fence
      blocks.push(<pre key={key++} className="ai-output">{buf.join('\n')}</pre>)
      continue
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length
      const Tag = `h${Math.min(6, level + 1)}` as keyof JSX.IntrinsicElements
      blocks.push(<Tag key={key++} className="md-h">{renderInline(h[2], `h${key}`)}</Tag>)
      i++
      continue
    }

    // blockquote (group)
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      blocks.push(<blockquote key={key++} className="md-quote">{renderInline(buf.join(' '), `q${key}`)}</blockquote>)
      continue
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''))
      blocks.push(
        <ul key={key++} className="md-list">
          {items.map((it, k) => <li key={k}>{renderInline(it, `ul${key}-${k}`)}</li>)}
        </ul>
      )
      continue
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''))
      blocks.push(
        <ol key={key++} className="md-list">
          {items.map((it, k) => <li key={k}>{renderInline(it, `ol${key}-${k}`)}</li>)}
        </ol>
      )
      continue
    }

    // blank line
    if (line.trim() === '') {
      i++
      continue
    }

    // paragraph (group consecutive plain lines)
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i++])
    }
    blocks.push(
      <p key={key++} className="md-p">
        {buf.map((b, k) => (
          <React.Fragment key={k}>
            {k > 0 && <br />}
            {renderInline(b, `p${key}-${k}`)}
          </React.Fragment>
        ))}
      </p>
    )
  }

  return <div className="md-preview">{blocks}</div>
}
