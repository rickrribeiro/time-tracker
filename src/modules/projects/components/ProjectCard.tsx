import React from 'react'
import type { Project, ProjectOverview, ProjectStatus } from '../../../types'
import { useUIStore } from '../../../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { PULSE, STATUSES, areaLabel, fmtDate, fmtMinutes, stageLabel, sizeDef, workDaysLabel, isProjectDay } from '../lib/constants'
import { timeAgo } from '../../../utils/dates'

interface Props {
  project: Project
  ov?: ProjectOverview
  compact?: boolean
  onStatus: (p: Project, to: ProjectStatus) => void
  onCompleteAction: (p: Project) => void
  onSetAction: (p: Project) => void
}

/** Card do cockpit: pulso, progresso, próxima ação, onde parei, bloqueio e ações rápidas. */
export function ProjectCard({ project: p, ov, compact, onStatus, onCompleteAction, onSetAction }: Props): React.ReactElement {
  const { openProject } = useUIStore()
  const { startWorking, delegations } = useProjectStore()
  const deleg = delegations.find((d) => d.projectId === p.id && (d.status === 'rodando' || d.status === 'pronta'))
  const size = sizeDef(p.nextActionSize)
  const today = isProjectDay(p)
  const pulse = ov ? PULSE[ov.pulse] : PULSE.parado
  const worst = ov?.alerts.find((a) => a.severity === 'alta') ?? ov?.alerts.find((a) => a.severity === 'media')
  const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

  return (
    <div
      className={`ph-card ${compact ? 'compact' : ''}`}
      style={{ ['--pc' as string]: p.color }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.id))}
      onClick={() => openProject(p.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && openProject(p.id)}
    >
      <div className="ph-card-head">
        <span className="ph-pulse" style={{ background: pulse.color }} title={`Sinal de vida: ${pulse.label}${ov?.lastActivityAt ? ` · última atividade (${ov.lastActivitySource}) há ${timeAgo(ov.lastActivityAt)}` : ''}`} />
        <span className="ph-card-name">{p.name}</span>
        {ov && ov.alerts.length > 0 && (
          <span className={`ph-alert-badge sev-${worst?.severity ?? 'baixa'}`} title={ov.alerts.map((a) => a.text).join('\n')}>
            {ov.alerts.length}
          </span>
        )}
      </div>

      {!compact && (
        <div className="ph-card-meta">
          <span>{areaLabel(p.area)}</span>
          {p.stage && <span>{stageLabel(p.stage)}</span>}
          {ov?.activeCycle && <span>🔁 {ov.activeCycle.name}{ov.activeCycle.dueDate ? ` · ${fmtDate(ov.activeCycle.dueDate)}` : ''}</span>}
          {p.workDays && workDaysLabel(p.workDays) && <span className={today ? 'ph-today' : ''}>📅 {today ? 'hoje · ' : ''}{workDaysLabel(p.workDays)}</span>}
        </div>
      )}
      {deleg && (
        <div className={`ph-deleg-status ${deleg.status === 'rodando' ? 'run' : 'ready'}`} title={deleg.action}>
          🤖 {deleg.status === 'rodando' ? 'Claude trabalhando…' : 'delegação pronta p/ revisão'}
        </div>
      )}

      {ov && (ov.milestonesTotal > 0 || ov.openTodos + ov.doneTodos > 0) && (
        <div className="ph-progress" title={`${ov.progress}% — ${ov.milestonesTotal ? `${ov.milestonesDone}/${ov.milestonesTotal} marcos` : `${ov.doneTodos}/${ov.openTodos + ov.doneTodos} tarefas`}`}>
          <div style={{ width: `${ov.progress}%` }} />
        </div>
      )}

      {p.blocker && <div className="ph-card-blocker">🧱 {p.blocker}</div>}

      {(p.status === 'foco' || p.status === 'fila') && (
        <div className={`ph-card-next ${p.nextAction ? '' : 'missing'}`} onClick={stop}>
          {p.nextAction ? (
            <>
              <button className="ph-tick" title="Concluir próxima ação" onClick={() => onCompleteAction(p)}>○</button>
              <span onClick={() => onSetAction(p)}>{p.nextAction}</span>
              {size && <span className="ph-size" title={size.label}>{size.icon}</span>}
            </>
          ) : (
            <button className="ph-linkbtn" onClick={() => onSetAction(p)}>+ definir próxima ação</button>
          )}
        </div>
      )}

      {!compact && p.whereLeftOff && p.status === 'foco' && <div className="ph-card-where">📍 {p.whereLeftOff}</div>}

      {p.status === 'pausado' && (
        <div className="ph-card-where">
          ⏸ {p.pauseReason ?? 'sem motivo'}
          {(p.resumeAt || p.resumeCondition) && <> · retomar {p.resumeAt ? `em ${fmtDate(p.resumeAt)}` : `quando ${p.resumeCondition}`}</>}
        </div>
      )}

      <div className="ph-card-foot" onClick={stop}>
        <span className="ph-muted" title="Horas nos últimos 7 dias / total">
          ⏱ {fmtMinutes(ov?.minutes7d ?? 0)} <span className="ph-dim">/ {fmtMinutes(ov?.minutesTotal ?? 0)}</span>
        </span>
        {ov && ov.commits7d > 0 && <span className="ph-muted">⎇ {ov.commits7d}</span>}
        <span style={{ flex: 1 }} />
        {(p.status === 'foco' || p.status === 'fila') && (
          <button className="btn btn-primary btn-sm" onClick={() => startWorking(p)} title="Inicia o timer vinculado a este projeto">
            ▶ Trabalhar
          </button>
        )}
        <select
          className="ph-status-select"
          value=""
          onChange={(e) => e.target.value && onStatus(p, e.target.value as ProjectStatus)}
          title="Mudar situação"
          aria-label="Mudar situação"
        >
          <option value="">⋯</option>
          {STATUSES.filter((s) => s.key !== p.status).map((s) => (
            <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
