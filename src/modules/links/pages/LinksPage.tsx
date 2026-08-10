import React, { useEffect, useState } from 'react'
import { useLinkStore, normalizeUrl } from '../store/linkStore'

export function LinksPage(): React.ReactElement {
  const { links, refresh, create, remove, setChecked } = useLinkStore()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    refresh()
  }, [])

  const checkedCount = links.filter((l) => l.checked === 1).length

  async function handleAdd(): Promise<void> {
    if (!title.trim() || !url.trim()) return
    await create(title.trim(), url.trim())
    setTitle('')
    setUrl('')
  }

  function open(u: string): void {
    window.api.app.openExternal(normalizeUrl(u))
  }

  function openAllChecked(): void {
    links.filter((l) => l.checked === 1).forEach((l) => open(l.url))
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔗 Links</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {links.length} links · {checkedCount} marcados
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAllChecked} disabled={checkedCount === 0}>
          ↗ Abrir marcados ({checkedCount})
        </button>
      </div>

      <div className="quick-add-row">
        <input
          type="text"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <input
          type="text"
          placeholder="URL (ex: github.com)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ flex: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn btn-primary" onClick={handleAdd}>+ Adicionar</button>
      </div>

      <div className="list-stack">
        {links.length === 0 && <div className="empty-hint">Nenhum link. Adicione acima.</div>}
        {links.map((l) => (
          <div key={l.id} className="list-row">
            <input
              type="checkbox"
              checked={l.checked === 1}
              onChange={(e) => setChecked(l.id, e.target.checked)}
              title="Incluir em 'Abrir marcados'"
            />
            <button
              className="link-title"
              onClick={() => open(l.url)}
              title={`Abrir ${l.url}`}
            >
              {l.title}
            </button>
            <span className="link-url">{l.url}</span>
            <div className="list-row-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => open(l.url)}>Abrir</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(l.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
