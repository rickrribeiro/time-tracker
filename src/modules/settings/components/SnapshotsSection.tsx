import React, { useEffect, useState } from 'react'

interface Snap {
  name: string
  path: string
  date: string
  size: number
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Lista os snapshots automáticos diários do banco e permite restaurar. */
export function SnapshotsSection(): React.ReactElement {
  const [snaps, setSnaps] = useState<Snap[]>([])

  useEffect(() => {
    window.api.app.snapshots().then(setSnaps)
  }, [])

  async function restore(s: Snap): Promise<void> {
    if (!window.confirm(`Restaurar o backup de ${fmtDate(s.date)}? Os dados atuais serão substituídos (o app vai recarregar).`)) return
    await window.api.app.restoreSnapshot(s.path)
    // main reloads the window after restoring
  }

  return (
    <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="chart-title">🗄️ Snapshots automáticos (diários)</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
        O banco é copiado automaticamente 1×/dia na abertura do app (mantém os últimos 14). Restaurar
        substitui os dados atuais e recarrega o app.
      </p>
      <div className="list-stack">
        {snaps.length === 0 && <div className="empty-hint">Nenhum snapshot ainda.</div>}
        {snaps.map((s) => (
          <div key={s.name} className="list-row">
            <span className="list-row-title">{fmtDate(s.date)}</span>
            <span className="project-chip">{fmtSize(s.size)}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => restore(s)}>Restaurar</button>
          </div>
        ))}
      </div>
    </div>
  )
}
