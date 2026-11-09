import React, { useEffect, useMemo, useState } from 'react'
import type { Project, ProjectArea, ProjectStatus, Todo } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { AREAS, STAGES, STATUSES, fmtMinutes, isClosed } from '../lib/constants'
import { suggestProjectByName, suggestProjectForText } from '../lib/match'

type UnlinkedTag = { tagId: number; tagName: string; tagColor: string; minutes: number }

/**
 * Triagem: passa por cada projeto ainda não decidido (situação, área, estágio, próxima ação)
 * e depois sugere vínculos de tags do timer e TODOs soltos aos projetos.
 */
export function TriageModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const { projects, overview, setStatus, patch, refreshAll } = useProjectStore()
  const queue = useMemo(() => projects.filter((p) => !p.triagedAt && !isClosed(p)).map((p) => p.id), [])
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'projects' | 'links'>(queue.length ? 'projects' : 'links')
  const current = projects.find((p) => p.id === queue[idx])

  const [status, setSt] = useState<ProjectStatus>('incubadora')
  const [area, setArea] = useState<ProjectArea>('pessoal')
  const [stage, setStage] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [reason, setReason] = useState('')
  const [resumeAt, setResumeAt] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!current) return
    setSt(current.status === 'incubadora' ? 'fila' : current.status)
    setArea(current.area)
    setStage(current.stage ?? '')
    setNextAction(current.nextAction ?? '')
    setReason('')
    setResumeAt('')
    setError('')
  }, [current?.id])

  function advance(): void {
    if (idx + 1 < queue.length) setIdx(idx + 1)
    else setPhase('links')
  }

  async function saveCurrent(): Promise<void> {
    if (!current) return
    if (status === 'foco' && !nextAction.trim()) return setError('Em foco precisa de uma próxima ação.')
    if ((status === 'pausado' || status === 'encerrado') && !reason.trim()) return setError('Registre o motivo.')
    await patch(current.id, { area, stage, nextAction: nextAction.trim() || null, triagedAt: new Date().toISOString() })
    if (status !== current.status) {
      await setStatus(current.id, status, { reason: reason.trim() || null, resumeAt: resumeAt || null, nextAction: nextAction.trim() || null, note: 'Triagem' })
    }
    advance()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal ph-modal-wide" onClick={(e) => e.stopPropagation()}>
        {phase === 'projects' && current ? (
          <>
            <h2>
              🧭 Triagem {idx + 1}/{queue.length}: <span style={{ color: current.color }}>{current.name}</span>
            </h2>
            {current.description && <p className="ph-muted">{current.description}</p>}
            {overview[current.id] && (
              <p className="ph-muted">
                {fmtMinutes(overview[current.id].minutesTotal)} registradas · {overview[current.id].openTodos} tarefas abertas · última atividade{' '}
                {overview[current.id].idleDays == null ? 'nunca' : `há ${overview[current.id].idleDays}d`}
              </p>
            )}
            <label className="ph-label">Situação</label>
            <div className="ph-seg">
              {STATUSES.filter((s) => s.key !== 'concluido').map((s) => (
                <button key={s.key} className={status === s.key ? 'active' : ''} onClick={() => setSt(s.key)} title={s.hint}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
            <div className="ph-row">
              <div>
                <label className="ph-label">Área</label>
                <div className="ph-seg">
                  {AREAS.map((a) => (
                    <button key={a.key} className={area === a.key ? 'active' : ''} onClick={() => setArea(a.key)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="ph-label">Estágio</label>
                <select value={stage} onChange={(e) => setStage(e.target.value)}>
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {(status === 'foco' || status === 'fila' || status === 'baixa') && (
              <>
                <label className="ph-label">Próxima ação {status !== 'foco' && '(opcional)'}</label>
                <input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Uma ação concreta" />
              </>
            )}
            {(status === 'pausado' || status === 'encerrado') && (
              <div className="ph-row">
                <div style={{ flex: 1 }}>
                  <label className="ph-label">Motivo</label>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                {status === 'pausado' && (
                  <div>
                    <label className="ph-label">Retomar em</label>
                    <input type="date" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
                  </div>
                )}
              </div>
            )}
            {error && <div className="ph-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={onClose}>Parar aqui</button>
              <button className="btn btn-secondary btn-sm" onClick={advance}>Pular</button>
              <button className="btn btn-primary btn-sm" onClick={saveCurrent}>Salvar e próximo →</button>
            </div>
          </>
        ) : (
          <LinksStep
            projects={projects.filter((p) => !isClosed(p))}
            onDone={() => {
              void refreshAll()
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}

/** Tags com horas e TODOs sem projeto → sugere o vínculo mais provável. */
function LinksStep({ projects, onDone }: { projects: Project[]; onDone: () => void }): React.ReactElement {
  const [tags, setTags] = useState<UnlinkedTag[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [choice, setChoice] = useState<Record<string, number | ''>>({})
  const [done, setDone] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([window.api.projects.unlinkedTags(), window.api.todos.getAll()]).then(([t, all]) => {
      setTags(t)
      const loose = all.filter((x) => x.projectId == null && x.status !== 'done' && x.type === 'projeto')
      setTodos(loose)
      const c: Record<string, number | ''> = {}
      for (const tag of t) c[`t${tag.tagId}`] = suggestProjectByName(tag.tagName, projects)?.id ?? ''
      for (const td of loose) c[`d${td.id}`] = suggestProjectForText(td.title, projects)?.id ?? ''
      setChoice(c)
    })
  }, [])

  async function link(key: string): Promise<void> {
    const pid = choice[key]
    if (!pid) return
    if (key.startsWith('t')) await window.api.projects.linkTag(Number(key.slice(1)), pid)
    else await window.api.projects.linkTodos([Number(key.slice(1))], pid)
    setDone(new Set([...done, key]))
  }

  async function linkAllSuggested(): Promise<void> {
    for (const k of Object.keys(choice)) if (choice[k] && !done.has(k)) await link(k)
  }

  const select = (key: string): React.ReactElement => (
    <select value={choice[key] ?? ''} onChange={(e) => setChoice({ ...choice, [key]: e.target.value ? Number(e.target.value) : '' })}>
      <option value="">— projeto —</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )

  const suggestedTodos = todos.filter((t) => choice[`d${t.id}`])

  return (
    <>
      <h2>🔗 Vínculos sem dono</h2>
      <p className="ph-muted">Tags do timer contam horas para o projeto vinculado. TODOs vinculados aparecem na página do projeto.</p>
      <div className="ph-label">Tags com horas (90 dias) sem projeto</div>
      <div className="list-stack">
        {tags.length === 0 && <div className="empty-hint">Tudo vinculado ✨</div>}
        {tags.map((t) => {
          const k = `t${t.tagId}`
          return (
            <div key={k} className="list-row ph-link-row">
              <span className="ph-dot" style={{ background: t.tagColor }} />
              <span className="list-row-title">{t.tagName} <span className="ph-muted">· {fmtMinutes(t.minutes)}</span></span>
              {done.has(k) ? <span className="ph-ok">✓ vinculado</span> : (<>{select(k)}<button className="btn btn-secondary btn-sm" onClick={() => link(k)} disabled={!choice[k]}>Vincular</button></>)}
            </div>
          )
        })}
      </div>
      <div className="ph-label" style={{ marginTop: 12 }}>
        TODOs soltos com projeto provável ({suggestedTodos.length} de {todos.length})
      </div>
      <div className="list-stack ph-scroll">
        {suggestedTodos.length === 0 && <div className="empty-hint">Nenhuma sugestão.</div>}
        {suggestedTodos.map((t) => {
          const k = `d${t.id}`
          return (
            <div key={k} className="list-row ph-link-row">
              <span className="list-row-title">{t.title}</span>
              {done.has(k) ? <span className="ph-ok">✓</span> : (<>{select(k)}<button className="btn btn-secondary btn-sm" onClick={() => link(k)} disabled={!choice[k]}>Vincular</button></>)}
            </div>
          )
        })}
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary btn-sm" onClick={linkAllSuggested}>Vincular todas as sugestões</button>
        <button className="btn btn-primary btn-sm" onClick={onDone}>Concluir</button>
      </div>
    </>
  )
}
