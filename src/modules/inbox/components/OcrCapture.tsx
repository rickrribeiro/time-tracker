import React, { useRef, useState } from 'react'

interface Extracted {
  title: string
  amount: number | null
  currency: string | null
  date: string | null
  link: string | null
  note: string | null
}

function parseExtracted(raw: string): Extracted | null {
  if (!raw) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    const o = JSON.parse(s) as Record<string, unknown>
    return {
      title: String(o.title ?? '').trim(),
      amount: o.amount != null && !isNaN(Number(o.amount)) ? Number(o.amount) : null,
      currency: o.currency ? String(o.currency) : null,
      date: typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null,
      link: o.link ? String(o.link) : null,
      note: o.note ? String(o.note) : null
    }
  } catch {
    return null
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Drag/paste an image (print, boleto, comprovante, whiteboard) → Claude local extracts
 *  { title, amount, date, link, note } → review → create an Inbox item (aiGenerated). */
export function OcrCapture({ onCreated }: { onCreated: () => void }): React.ReactElement {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [draft, setDraft] = useState<Extracted | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      setError('Solte uma imagem (print, foto, boleto…).')
      return
    }
    setError('')
    setDraft(null)
    setBusy(true)
    try {
      const dataUrl = await readAsDataUrl(file)
      setPreview(dataUrl)
      const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const res = await window.api.inbox.ocr(dataUrl, ext)
      if (!res.ok) {
        setError(res.error || 'Falha ao processar a imagem.')
        return
      }
      const parsed = parseExtracted(res.output || '')
      if (!parsed || !parsed.title) {
        setError('Não consegui extrair informações. Tente uma imagem mais nítida.')
        return
      }
      setDraft(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e: React.DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) void handleFile(f)
  }

  function onPaste(e: React.ClipboardEvent): void {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))
    const f = item?.getAsFile()
    if (f) void handleFile(f)
  }

  async function createItem(): Promise<void> {
    if (!draft) return
    const noteParts: string[] = []
    if (draft.note) noteParts.push(draft.note)
    if (draft.amount != null) noteParts.push(`Valor: ${draft.currency ? draft.currency + ' ' : ''}${draft.amount}`)
    if (draft.link) noteParts.push(`Link: ${draft.link}`)
    const notes = noteParts.join(' · ') || null
    await window.api.todos.create(draft.title, notes, 'inbox', 'ocr', 0, draft.date, null, 1)
    setDraft(null)
    setPreview(null)
    onCreated()
  }

  return (
    <>
      <div
        className={`ocr-drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        onClick={() => fileInput.current?.click()}
        tabIndex={0}
        title="Arraste, cole (Ctrl+V) ou clique para escolher uma imagem"
      >
        {busy ? '🔍 Lendo a imagem com IA…' : '🖼️ Arraste um print / boleto / comprovante / foto — ou cole (Ctrl+V)'}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</div>}

      {draft && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 420, maxWidth: 560 }}>
            <h2>🖼️ Revisar extração</h2>
            <div style={{ display: 'flex', gap: 12 }}>
              {preview && (
                <img src={preview} alt="prévia" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
              )}
              <div style={{ flex: 1 }}>
                <div className="editor-field">
                  <label>Título</label>
                  <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
                </div>
                <div className="editor-row">
                  <div className="editor-field">
                    <label>Valor</label>
                    <input type="number" value={draft.amount ?? ''} onChange={(e) => setDraft({ ...draft, amount: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div className="editor-field">
                    <label>Data</label>
                    <input type="date" value={draft.date ?? ''} onChange={(e) => setDraft({ ...draft, date: e.target.value || null })} />
                  </div>
                </div>
              </div>
            </div>
            <div className="editor-field">
              <label>Link</label>
              <input value={draft.link ?? ''} onChange={(e) => setDraft({ ...draft, link: e.target.value || null })} />
            </div>
            <div className="editor-field">
              <label>Nota</label>
              <textarea rows={3} value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value || null })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={createItem} disabled={!draft.title.trim()}>Criar no Inbox</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
