import React, { useEffect, useState } from 'react'
import type { Project, ProjectStatus } from '../../../types'
import { useUIStore } from '../../../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { StatusChangeModal } from './StatusChangeModal'
import { LAST_REVIEW_KEY, PULSE, fmtMinutes, isClosed, statusLabel } from '../lib/constants'

/** Passo "Projetos" da revisão semanal: uma decisão explícita por projeto aberto. */
export function ProjectsReviewPanel(): React.ReactElement {
  const { projects, overview, refreshAll, patch } = useProjectStore()
  const { openProject } = useUIStore()
  const [statusModal, setStatusModal] = useState<{ p: Project; to: ProjectStatus } | null>(null)
  const [decided, setDecided] = useState<Record<number, string>>({})

  useEffect(() => {
    void refreshAll()
    void window.api.settings.set(LAST_REVIEW_KEY, new Date().toISOString())
  }, [])

  const order: ProjectStatus[] = ['foco', 'pausado', 'fila', 'incubadora']
  const list = projects.filter((p) => !isClosed(p)).sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))

  async function keep(p: Project): Promise<void> {
    await window.api.projects.addEvent(p.id, 'revisao', 'Revisão semanal: continuar')
    await patch(p.id, { lastReviewedAt: new Date().toISOString() })
    setDecided({ ...decided, [p.id]: 'continuar' })
  }
  function change(p: Project, to: ProjectStatus): void {
    setStatusModal({ p, to })
    setDecided({ ...decided, [p.id]: to })
  }

  return (
    <div className="ph-review">
      <div className="list-stack">
        {list.map((p) => {
          const ov = overview[p.id]
          const alerts = ov?.alerts.filter((a) => a.severity !== 'baixa') ?? []
          return (
            <div key={p.id} className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', opacity: decided[p.id] ? 0.55 : 1 }}>
              <span className="ph-pulse" style={{ background: ov ? PULSE[ov.pulse].color : 'var(--text-muted)', marginTop: 5 }} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <button className="ph-linkbtn" style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }} onClick={() => openProject(p.id)}>
                  {p.name}
                </button>{' '}
                <span className="ph-muted">
                  {statusLabel(p.status)} · {fmtMinutes(ov?.minutes7d ?? 0)} na semana · {ov?.idleDays == null ? 'sem atividade' : `ativo há ${ov.idleDays}d`}
                </span>
                {p.nextAction && <div className="ph-muted">👉 {p.nextAction}</div>}
                {alerts.map((a) => (
                  <div key={a.kind} style={{ fontSize: 12, color: a.severity === 'alta' ? 'var(--danger)' : 'var(--warning)' }}>{a.text}</div>
                ))}
              </div>
              <div className="list-row-actions" style={{ flexWrap: 'wrap' }}>
                {decided[p.id] ? (
                  <span className="ph-ok">✓ {decided[p.id]}</span>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => keep(p)}>Continuar</button>
                    {p.status !== 'pausado' ? (
                      <button className="btn btn-secondary btn-sm" onClick={() => change(p, 'pausado')}>Pausar</button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => change(p, 'fila')}>Retomar</button>
                    )}
                    {p.status !== 'foco' && <button className="btn btn-secondary btn-sm" onClick={() => change(p, 'foco')}>Focar</button>}
                    <button className="btn btn-secondary btn-sm" onClick={() => change(p, 'concluido')}>Concluir</button>
                    <button className="btn btn-danger btn-sm" onClick={() => change(p, 'encerrado')}>Encerrar</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        {list.length === 0 && <div className="empty-hint">Nenhum projeto aberto.</div>}
      </div>
      {statusModal && <StatusChangeModal project={statusModal.p} to={statusModal.to} onClose={() => setStatusModal(null)} />}
    </div>
  )
}

/** Resumo textual dos projetos para prompts (revisão semanal / standup). */
export async function projectsDigest(): Promise<string> {
  const [projects, overview] = await Promise.all([window.api.projects.getAll(), window.api.projects.overview()])
  const ov = new Map(overview.map((o) => [o.projectId, o]))
  return projects
    .filter((p) => !isClosed(p))
    .map((p) => {
      const o = ov.get(p.id)
      const alerts = o?.alerts.filter((a) => a.severity !== 'baixa').map((a) => a.text).join('; ')
      return `- ${p.name} [${statusLabel(p.status)}${p.area === 'profissional' ? ', profissional' : ''}] ${fmtMinutes(o?.minutes7d ?? 0)}/7d, ${o?.idleDays == null ? 'sem atividade' : `última atividade há ${o.idleDays}d`}${p.nextAction ? `; próxima ação: ${p.nextAction}` : ''}${p.pauseReason ? `; pausado: ${p.pauseReason}${p.resumeAt ? ` até ${p.resumeAt}` : ''}` : ''}${alerts ? `; ALERTAS: ${alerts}` : ''}`
    })
    .join('\n')
}
