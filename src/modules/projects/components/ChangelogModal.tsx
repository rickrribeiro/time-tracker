import React, { useEffect, useState } from 'react'
import type { ProjectCycle } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { renderMarkdown } from '../../estudos/markdown'
import { copyText } from '../git'

/** Changelog de um ciclo, gerado a partir dos commits do período (agrupado ou escrito pela IA). */
export function ChangelogModal({ cycle, onClose }: { cycle: ProjectCycle; onClose: () => void }): React.ReactElement {
  const { refreshCycles } = useProjectStore()
  const [md, setMd] = useState(cycle.changelog ?? '')
  const [busy, setBusy] = useState<'grouped' | 'ai' | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.api.cycles.commits(cycle.id).then((c) => setCount(c.length)).catch(() => setCount(null))
    if (!cycle.changelog) void generate(false)
  }, [cycle.id])

  async function generate(ai: boolean): Promise<void> {
    setBusy(ai ? 'ai' : 'grouped')
    setError('')
    try {
      setMd(await window.api.cycles.changelog(cycle.id, ai))
      void refreshCycles()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal ph-modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>📜 Changelog — {cycle.name}</h2>
        <p className="ph-muted">
          {cycle.startDate} → {cycle.closedAt?.slice(0, 10) ?? 'hoje'} · {count == null ? '…' : `${count} commit(s)`}
        </p>
        <div className="ph-btnrow">
          <button className="btn btn-secondary btn-sm" onClick={() => generate(false)} disabled={!!busy}>{busy === 'grouped' ? 'Gerando…' : '↻ Agrupar commits'}</button>
          <button className="btn btn-secondary btn-sm" onClick={() => generate(true)} disabled={!!busy || !count}>{busy === 'ai' ? 'Escrevendo…' : '✨ Escrever com IA'}</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              setCopied(await copyText(md))
              setTimeout(() => setCopied(false), 1500)
            }}
            disabled={!md}
          >
            {copied ? 'Copiado ✓' : '⧉ Copiar Markdown'}
          </button>
        </div>
        {error && <div className="ph-error">{error}</div>}
        <div className="md-preview-pane ph-changelog">{md ? renderMarkdown(md) : <div className="empty-hint">Gerando…</div>}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
