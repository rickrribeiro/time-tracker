import React, { useEffect, useState } from 'react'
import type { Project } from '../../../types'
import { useUIStore } from '../../../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { NextActionModal } from './NextActionModal'
import { PULSE, TODAY_FOCUS_KEY, isClosed, isProjectDay, sizeDef } from '../lib/constants'
import { timeAgo, localDateStr } from '../../../utils/dates'
import '../projects-hub.css'

interface TodayItem {
  projectId: number
  text: string
  done: boolean
}
interface TodayFocus {
  date: string
  items: TodayItem[]
}
const MAX_TODAY = 3

/**
 * Home: "Em foco", "Foco de hoje" (no máx. 3 ações), "Continuar de onde parei" e
 * "Precisam de decisão" (radar). O foco de hoje fica no servidor → mesmo no celular.
 */
export function ProjectHomeBlocks(): React.ReactElement | null {
  const { projects, overview, refreshAll, startWorking } = useProjectStore()
  const { openProject, setPage } = useUIStore()
  const [today, setToday] = useState<TodayFocus>({ date: localDateStr(new Date()), items: [] })
  const [picking, setPicking] = useState(false)
  const [quick, setQuick] = useState(false)
  const [action, setAction] = useState<{ p: Project; mode: 'complete' | 'set' } | null>(null)
  const todayStr = localDateStr(new Date())

  useEffect(() => {
    void refreshAll()
    window.api.settings.get(TODAY_FOCUS_KEY).then((raw) => {
      try {
        const v = JSON.parse(raw || 'null') as TodayFocus | null
        if (v && v.date === todayStr) setToday(v)
      } catch {
        // valor inválido → começa vazio
      }
    })
    const off = window.api.projects.onChanged(() => void refreshAll())
    return off
  }, [])

  async function saveToday(next: TodayFocus): Promise<void> {
    setToday(next)
    await window.api.settings.set(TODAY_FOCUS_KEY, JSON.stringify(next))
  }

  const open = projects.filter((p) => !isClosed(p))
  if (!open.length) return null
  // ⚡ modo brecha: qualquer projeto aberto cuja próxima ação cabe em 15 min
  const focus = quick
    ? open.filter((p) => p.nextAction && p.nextActionSize === 'rapida' && p.status !== 'incubadora').sort((a, b) => (a.status === 'foco' ? -1 : 0) - (b.status === 'foco' ? -1 : 0))
    : open.filter((p) => p.status === 'foco').sort((a, b) => b.priority - a.priority)
  const dayProjects = open.filter((p) => isProjectDay(p))
  const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  const resume = open
    .filter((p) => p.whereLeftOff && p.whereLeftOffAt)
    .sort((a, b) => (b.whereLeftOffAt ?? '').localeCompare(a.whereLeftOffAt ?? ''))[0]
  const decisions = open
    .flatMap((p) => (overview[p.id]?.alerts ?? []).filter((a) => a.severity !== 'baixa').map((a) => ({ p, a })))
    .sort((x, y) => (x.a.severity === y.a.severity ? 0 : x.a.severity === 'alta' ? -1 : 1))
  const forgotten = open.filter((p) => (p.status === 'fila' || p.status === 'incubadora') && (overview[p.id]?.idleDays ?? 0) >= 30)
  const candidates = open.filter((p) => (p.status === 'foco' || p.status === 'fila') && p.nextAction && !today.items.some((i) => i.projectId === p.id && i.text === p.nextAction))
  const name = (id: number): Project | undefined => projects.find((p) => p.id === id)

  return (
    <div className="ph-home">
      <div className="chart-section">
        <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{quick ? '⚡ Cabe em 15 min' : '🎯 Em foco'}</span>
          <span style={{ display: 'flex', gap: 10 }}>
            <button className={`ph-linkbtn ${quick ? 'on' : ''}`} onClick={() => setQuick((v) => !v)} title="Só próximas ações rápidas, de qualquer projeto">
              {quick ? '← em foco' : '⚡ tenho 15 min'}
            </button>
            <button className="ph-linkbtn" onClick={() => setPage('projects')}>cockpit →</button>
          </span>
        </div>
        {dayProjects.length > 0 && !quick && (
          <div className="ph-dayline">
            📅 {dayNames[new Date().getDay()]} é dia de{' '}
            {dayProjects.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 && ', '}
                <button className="ph-linkbtn" onClick={() => openProject(p.id)}>{p.name}</button>
              </React.Fragment>
            ))}
            {dayProjects[0] && (
              <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => startWorking(dayProjects[0])}>▶ {dayProjects[0].name}</button>
            )}
          </div>
        )}
        {focus.length === 0 && (
          <div className="empty-hint">{quick ? 'Nenhuma próxima ação marcada como ⚡ 15 min.' : 'Nenhum projeto em foco. Escolha 1–3 no cockpit.'}</div>
        )}
        {focus.map((p) => {
          const ov = overview[p.id]
          return (
            <div key={p.id} className="ph-home-item" style={{ ['--pc' as string]: p.color }}>
              <span className="ph-pulse" style={{ background: ov ? PULSE[ov.pulse].color : 'var(--text-muted)' }} />
              <div className="grow">
                <div className="ph-home-name" onClick={() => openProject(p.id)}>{p.name}</div>
                {p.nextAction ? (
                  <div className="ph-muted" onClick={() => setAction({ p, mode: 'set' })} style={{ cursor: 'pointer' }}>
                    👉 {p.nextAction} {sizeDef(p.nextActionSize)?.icon ?? ''}
                  </div>
                ) : (
                  <button className="ph-linkbtn" onClick={() => setAction({ p, mode: 'set' })}>+ próxima ação</button>
                )}
              </div>
              {p.nextAction && (
                <button className="ph-tick" style={{ ['--pc' as string]: p.color }} title="Concluir próxima ação" onClick={() => setAction({ p, mode: 'complete' })}>○</button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => startWorking(p)} title="Trabalhar nisso">▶</button>
            </div>
          )
        })}
      </div>

      <div className="chart-section">
        <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>☀️ Foco de hoje <span className="ph-muted">({today.items.filter((i) => i.done).length}/{today.items.length})</span></span>
          {today.items.length < MAX_TODAY && (
            <button className="ph-linkbtn" onClick={() => setPicking((v) => !v)}>{picking ? 'fechar' : '+ escolher'}</button>
          )}
        </div>
        {today.items.length === 0 && !picking && <div className="empty-hint">Escolha até 3 ações para hoje.</div>}
        {today.items.map((it, idx) => {
          const p = name(it.projectId)
          return (
            <div key={idx} className={`ph-home-item ph-today-item ${it.done ? 'done' : ''}`}>
              <input
                type="checkbox"
                checked={it.done}
                onChange={() => saveToday({ ...today, items: today.items.map((x, j) => (j === idx ? { ...x, done: !x.done } : x)) })}
              />
              <div className="grow">
                <div>{it.text}</div>
                {p && <div className="ph-muted">{p.name}</div>}
              </div>
              {p && !it.done && <button className="btn btn-secondary btn-sm" onClick={() => startWorking(p, it.text)}>▶</button>}
              <button className="ph-x" aria-label="Remover" onClick={() => saveToday({ ...today, items: today.items.filter((_, j) => j !== idx) })}>✕</button>
            </div>
          )
        })}
        {picking && (
          <div className="ph-chips">
            {candidates.length === 0 && <span className="ph-muted">Defina próximas ações nos projetos em foco/fila.</span>}
            {candidates.map((p) => (
              <button
                key={p.id}
                className="ph-chip"
                onClick={() => {
                  const items = [...today.items, { projectId: p.id, text: p.nextAction!, done: false }].slice(0, MAX_TODAY)
                  void saveToday({ date: todayStr, items })
                  if (items.length >= MAX_TODAY) setPicking(false)
                }}
              >
                <strong>{p.name}:</strong> {p.nextAction}
              </button>
            ))}
          </div>
        )}
      </div>

      {resume && (
        <div className="chart-section">
          <div className="chart-title">📍 Continuar de onde parei</div>
          <div className="ph-home-item" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="ph-home-name" onClick={() => openProject(resume.id)}>{resume.name}</div>
              <div className="ph-clamp" style={{ fontSize: 13, marginTop: 4 }} title={resume.whereLeftOff ?? ''}>{resume.whereLeftOff}</div>
              <div className="ph-muted" style={{ marginTop: 4 }}>
                há {timeAgo(resume.whereLeftOffAt!)}
                {resume.nextAction ? ` · próximo: ${resume.nextAction}` : ''}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => startWorking(resume)}>▶ Continuar</button>
          </div>
        </div>
      )}

      {(decisions.length > 0 || forgotten.length > 0) && (
        <div className="chart-section">
          <div className="chart-title">📡 Precisam de decisão</div>
          {decisions.slice(0, 5).map(({ p, a }, i) => (
            <div key={`${p.id}-${i}`} className="ph-home-item">
              <span className="ph-dot" style={{ background: a.severity === 'alta' ? 'var(--danger)' : 'var(--warning)' }} />
              <div className="grow">
                <span className="ph-home-name" onClick={() => openProject(p.id)}>{p.name}</span>
                <span className="ph-muted"> · {a.text}</span>
              </div>
            </div>
          ))}
          {forgotten.length > 0 && (
            <div className="ph-muted" style={{ marginTop: 6 }}>
              🕸 Esquecidos (+30 dias): {forgotten.slice(0, 6).map((p, i) => (
                <React.Fragment key={p.id}>
                  {i > 0 && ', '}
                  <button className="ph-linkbtn" onClick={() => openProject(p.id)}>{p.name}</button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {action && <NextActionModal project={projects.find((x) => x.id === action.p.id) ?? action.p} mode={action.mode} onClose={() => setAction(null)} />}
    </div>
  )
}
