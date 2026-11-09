import React, { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { fmtMinutes } from '../lib/constants'

const RANGES = [
  { key: 30, label: '30 dias' },
  { key: 90, label: '90 dias' },
  { key: 365, label: '1 ano' }
]

/** Métricas: iniciados × concluídos, horas por projeto, tempo médio até concluir. */
export function ProjectMetrics({ projects }: { projects: Project[] }): React.ReactElement {
  const { overview } = useProjectStore()
  const [range, setRange] = useState(30)
  const [hours, setHours] = useState<{ projectId: number; minutes: number }[]>([])

  useEffect(() => {
    const to = new Date(Date.now() + 86400000).toISOString()
    const from = new Date(Date.now() - range * 86400000).toISOString()
    window.api.projects.hours(from, to).then(setHours)
  }, [range])

  const months = useMemo(() => {
    const out: { key: string; label: string; started: number; done: number; dropped: number }[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      out.push({ key, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), started: 0, done: 0, dropped: 0 })
    }
    for (const p of projects) {
      const s = out.find((m) => p.createdAt?.startsWith(m.key))
      if (s) s.started++
      const c = out.find((m) => p.closedAt?.startsWith(m.key))
      if (c && p.status === 'concluido') c.done++
      if (c && p.status === 'encerrado') c.dropped++
    }
    return out
  }, [projects])

  const done = projects.filter((p) => p.status === 'concluido')
  const dropped = projects.filter((p) => p.status === 'encerrado')
  const durations = done.filter((p) => p.createdAt && p.closedAt).map((p) => (new Date(p.closedAt!).getTime() - new Date(p.createdAt!).getTime()) / 86400000)
  const avgDays = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
  const rate = done.length + dropped.length ? Math.round((done.length / (done.length + dropped.length)) * 100) : null
  const maxMonth = Math.max(1, ...months.map((m) => Math.max(m.started, m.done + m.dropped)))
  const totalRange = hours.reduce((s, h) => s + h.minutes, 0)
  const maxH = Math.max(1, ...hours.map((h) => h.minutes))
  const byArea = (['pessoal', 'profissional'] as const).map((a) => ({
    area: a,
    minutes: hours.filter((h) => projects.find((p) => p.id === h.projectId)?.area === a).reduce((s, h) => s + h.minutes, 0)
  }))
  const inFlight = projects.filter((p) => p.status === 'foco' || p.status === 'fila' || p.status === 'baixa').length

  return (
    <div className="ph-metrics">
      <div className="cards-grid">
        <div className="stat-card">
          <div className="stat-card-label">Iniciados</div>
          <div className="stat-card-value">{projects.length}</div>
          <div className="stat-card-sub">{inFlight} em andamento</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Concluídos</div>
          <div className="stat-card-value">{done.length}</div>
          <div className="stat-card-sub">{dropped.length} encerrados{rate != null ? ` · ${rate}% de conclusão` : ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Tempo médio até concluir</div>
          <div className="stat-card-value">{avgDays != null ? `${avgDays}d` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Horas em projetos ({range}d)</div>
          <div className="stat-card-value">{fmtMinutes(totalRange)}</div>
          <div className="stat-card-sub">{byArea.map((a) => `${a.area}: ${fmtMinutes(a.minutes)}`).join(' · ')}</div>
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 12 }}>
        <div className="chart-title">Iniciados × concluídos (12 meses)</div>
        <div className="ph-months">
          {months.map((m) => (
            <div key={m.key} className="ph-month" title={`${m.key}: ${m.started} iniciados, ${m.done} concluídos, ${m.dropped} encerrados`}>
              <div className="ph-month-bars">
                <span className="started" style={{ height: `${(m.started / maxMonth) * 100}%` }} />
                <span className="done" style={{ height: `${(m.done / maxMonth) * 100}%` }} />
                <span className="dropped" style={{ height: `${(m.dropped / maxMonth) * 100}%` }} />
              </div>
              <span className="ph-month-label">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="ph-legend">
          <span><i className="started" /> iniciados</span>
          <span><i className="done" /> concluídos</span>
          <span><i className="dropped" /> encerrados</span>
        </div>
      </div>

      <div className="chart-section" style={{ marginTop: 12 }}>
        <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span>Horas por projeto</span>
          <div className="seg-toggle">
            {RANGES.map((r) => (
              <button key={r.key} className={`seg-btn ${range === r.key ? 'active' : ''}`} onClick={() => setRange(r.key)}>{r.label}</button>
            ))}
          </div>
        </div>
        <div className="ph-hbars">
          {hours.length === 0 && <div className="empty-hint">Sem horas vinculadas a projetos. Use “▶ Trabalhar” ou vincule tags na triagem.</div>}
          {hours.map((h) => {
            const p = projects.find((x) => x.id === h.projectId)
            if (!p) return null
            return (
              <div key={h.projectId} className="ph-hbar">
                <span className="ph-hbar-label">{p.name}</span>
                <div className="ph-hbar-track">
                  <div style={{ width: `${(h.minutes / maxH) * 100}%`, background: p.color }} />
                </div>
                <span className="ph-hbar-value">{fmtMinutes(h.minutes)}</span>
              </div>
            )
          })}
        </div>
        <p className="ph-muted" style={{ marginTop: 8 }}>
          Total histórico: {fmtMinutes(Object.values(overview).reduce((s, o) => s + o.minutesTotal, 0))}
        </p>
      </div>
    </div>
  )
}
