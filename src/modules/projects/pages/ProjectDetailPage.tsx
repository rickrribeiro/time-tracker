import React, { useEffect, useMemo, useState } from 'react'
import type { ProjectCycle, GitBranch, GithubIssue, ProjectCommit, ProjectEvent, ProjectNote, ProjectStatus, TaskWithTag, Todo } from '../../../types'
import { useUIStore } from '../../../store/uiStore'
import { useProjectStore } from '../store/projectStore'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { NextActionModal } from '../components/NextActionModal'
import { ProjectForm } from '../components/ProjectForm'
import { RoadmapView } from '../components/RoadmapView'
import { CycleModal } from '../components/CycleModal'
import { ChangelogModal } from '../components/ChangelogModal'
import { DelegateModal, DelegationsPanel } from '../components/Delegations'
import { ScheduleEditor } from '../components/ScheduleEditor'
import { EVENT_LABEL, PULSE, SIZES, STATUSES, areaLabel, fmtDate, fmtMinutes, isClosed, stageLabel, statusDef } from '../lib/constants'
import { projectContext, runJson, runText } from '../lib/ai'
import { repoFromUrl } from '../store/githubStore'
import { WORKTREES_FILTER_KEY } from '../git'
import { timeAgo, localDateStr } from '../../../utils/dates'
import { renderMarkdown } from '../../estudos/markdown'
import '../projects-hub.css'

type Tab = 'geral' | 'roadmap' | 'tarefas' | 'codigo' | 'notas' | 'historico'
const TABS: { key: Tab; label: string }[] = [
  { key: 'geral', label: '🧭 Visão geral' },
  { key: 'roadmap', label: '🗺 Roadmap' },
  { key: 'tarefas', label: '✅ Tarefas' },
  { key: 'codigo', label: '⎇ Código' },
  { key: 'notas', label: '📚 Conhecimento' },
  { key: 'historico', label: '🕰 Histórico' }
]

/** Campo de texto que salva ao sair (blur) — edição sem botões. */
function InlineText({ value, placeholder, onSave, rows = 2 }: { value: string | null; placeholder: string; onSave: (v: string) => void; rows?: number }): React.ReactElement {
  const [v, setV] = useState(value ?? '')
  useEffect(() => setV(value ?? ''), [value])
  return (
    <textarea
      className="ph-inline"
      rows={rows}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== (value ?? '').trim() && onSave(v)}
    />
  )
}

interface AiPlan {
  finishLine?: string
  scope?: string
  futureIdeas?: string
  nextAction?: string
  milestones?: { title: string; targetDate?: string | null }[]
}

export function ProjectDetailPage(): React.ReactElement {
  const { selectedProjectId, setPage } = useUIStore()
  const { projects, overview, milestones, cycles, refreshAll, refreshMilestones, refreshCycles, patch, startWorking } = useProjectStore()
  const p = projects.find((x) => x.id === selectedProjectId) ?? null
  const ov = p ? overview[p.id] : undefined
  const [tab, setTab] = useState<Tab>('geral')
  const [statusTo, setStatusTo] = useState<ProjectStatus | null>(null)
  const [actionMode, setActionMode] = useState<'complete' | 'set' | null>(null)
  const [editing, setEditing] = useState(false)
  const [events, setEvents] = useState<ProjectEvent[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [issues, setIssues] = useState<GithubIssue[]>([])
  const [commits, setCommits] = useState<ProjectCommit[]>([])
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [sessions, setSessions] = useState<TaskWithTag[]>([])
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null)
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiError, setAiError] = useState('')
  const [cycleMode, setCycleMode] = useState<'new' | 'extend' | 'close' | null>(null)
  const [changelogCycle, setChangelogCycle] = useState<ProjectCycle | null>(null)
  const [delegating, setDelegating] = useState(false)
  const [msTitle, setMsTitle] = useState('')
  const [msDate, setMsDate] = useState('')
  const [newTodo, setNewTodo] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [noteKind, setNoteKind] = useState<'nota' | 'link' | 'decisao'>('nota')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteUrl, setNoteUrl] = useState('')

  async function loadExtras(): Promise<void> {
    if (!p) return
    const [ev, td, is, ss, nt] = await Promise.all([
      window.api.projects.events(p.id, 200),
      window.api.todos.getAll(),
      window.api.github.getIssues().catch(() => [] as GithubIssue[]),
      window.api.projects.tasks(p.id, 200),
      window.api.projectNotes.getAll(p.id)
    ])
    setEvents(ev)
    setTodos(td)
    setIssues(is)
    setSessions(ss)
    setNotes(nt)
  }

  useEffect(() => {
    if (!projects.length) void refreshAll()
    const off = window.api.projects.onChanged(() => {
      void refreshAll()
      void loadExtras()
    })
    return off
  }, [])

  useEffect(() => {
    setAiPlan(null)
    void loadExtras()
    if (p?.localPath) {
      window.api.projects.commits(p.id, 40).then(setCommits).catch(() => setCommits([]))
      window.api.git.summary().then((s) => setBranches(s.branches.filter((b) => b.projectId === p.id))).catch(() => setBranches([]))
    } else {
      setCommits([])
      setBranches([])
    }
  }, [p?.id])

  const ms = useMemo(() => (p ? milestones.filter((m) => m.projectId === p.id) : []), [milestones, p?.id])
  const projCycles = useMemo(() => (p ? cycles.filter((c) => c.projectId === p.id) : []), [cycles, p?.id])
  const activeCycle = projCycles.find((c) => c.status === 'ativo') ?? null

  if (!p) {
    return (
      <div className="module-page">
        <button className="btn btn-secondary btn-sm" onClick={() => setPage('projects')}>← Projetos</button>
        <div className="empty-hint" style={{ marginTop: 20 }}>{projects.length ? 'Projeto não encontrado.' : 'Carregando…'}</div>
      </div>
    )
  }
  const project = p
  const def = statusDef(project.status)
  const pulse = ov ? PULSE[ov.pulse] : PULSE.parado
  const save = (fields: Parameters<typeof patch>[1]): void => void patch(project.id, fields).then(loadExtras)

  // ── IA ──
  async function aiSuggestPlan(): Promise<void> {
    setAiBusy('plan')
    setAiError('')
    try {
      const ctx = await projectContext(project, ov)
      const r = await runJson<AiPlan>(
        `Você é meu gerente de projetos pessoal. Para o projeto abaixo, proponha um plano enxuto para TERMINAR a entrega atual:
- finishLine: frase "Pronto quando…" objetiva e verificável
- scope: o escopo mínimo da entrega atual (lista curta, com hífens)
- futureIdeas: o que fica para depois (lista curta, com hífens)
- milestones: 3 a 5 marcos em ordem, cada um {"title": "...", "targetDate": "YYYY-MM-DD" ou null} (hoje é ${localDateStr(new Date())})
- nextAction: a próxima ação concreta (25-90 min)
Formato: {"finishLine": "...", "scope": "...", "futureIdeas": "...", "milestones": [...], "nextAction": "..."}

${ctx}`
      )
      setAiPlan(r)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(null)
    }
  }

  async function aiWhereLeftOff(): Promise<void> {
    setAiBusy('where')
    setAiError('')
    try {
      const ctx = await projectContext(project, ov)
      const txt = await runText(
        `Com base nas atividades recentes (commits, sessões no timer, tarefas e histórico), escreva um "ONDE PAREI" de 2-4 frases em primeira pessoa para eu retomar este projeto rapidamente: o que foi feito por último, o estado atual e o próximo passo natural. Só o texto.\n\n${ctx}`
      )
      save({ whereLeftOff: txt })
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiBusy(null)
    }
  }

  async function applyMilestones(list: { title: string; targetDate?: string | null }[]): Promise<void> {
    for (const m of list) await window.api.milestones.create(project.id, m.title, m.targetDate || null)
    await refreshMilestones()
  }

  // ── Marcos ──
  async function addMilestone(): Promise<void> {
    if (!msTitle.trim()) return
    const m = await window.api.milestones.create(project.id, msTitle.trim(), msDate || null)
    if (activeCycle) await window.api.milestones.update(m.id, m.title, m.targetDate, activeCycle.id, null)
    setMsTitle('')
    setMsDate('')
    await refreshMilestones()
  }
  async function toggleMilestone(id: number, done: boolean, title: string): Promise<void> {
    await window.api.milestones.toggle(id, done ? 0 : 1)
    if (!done) await window.api.projects.addEvent(project.id, 'marco', `Marco concluído: ${title}`)
    await refreshMilestones()
    void loadExtras()
  }
  const msProgress = (id: number, done: boolean): number => {
    if (done) return 100
    const linked = todos.filter((t) => t.milestoneId === id)
    return linked.length ? Math.round((linked.filter((t) => t.status === 'done').length / linked.length) * 100) : 0
  }

  // ── Ciclos ──
  const cycleChanged = (): void => {
    void Promise.all([refreshCycles(), refreshAll()])
    void loadExtras()
  }

  // ── Tarefas + issues (sem duplicar) ──
  const projTodos = todos.filter((t) => t.projectId === project.id)
  const repo = repoFromUrl(project.githubRepoUrl)
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const todoKeys = new Set(projTodos.map((t) => norm(t.title)))
  const projIssues = repo
    ? issues.filter((i) => i.repo.toLowerCase() === repo.toLowerCase() && !todoKeys.has(norm(i.title)) && !projTodos.some((t) => i.url && t.notes?.includes(i.url)))
    : []
  async function addTodo(): Promise<void> {
    if (!newTodo.trim()) return
    await window.api.todos.create(newTodo.trim(), null, 'todo', 'manual', 0, null, project.id)
    setNewTodo('')
    void loadExtras()
    void refreshAll()
  }
  async function toggleTodo(t: Todo): Promise<void> {
    await window.api.todos.update(t.id, t.title, t.notes, t.status === 'done' ? 'todo' : 'done', t.priority, t.dueDate, t.projectId)
    void loadExtras()
    void refreshAll()
  }
  const linkCandidates = linkSearch.trim()
    ? todos.filter((t) => t.projectId !== project.id && t.status !== 'done' && t.title.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 8)
    : []

  // ── Notas ──
  async function addNote(): Promise<void> {
    if (!noteTitle.trim()) return
    await window.api.projectNotes.save({ projectId: project.id, kind: noteKind, title: noteTitle.trim(), body: noteBody.trim() || null, url: noteUrl.trim() || null })
    setNoteTitle('')
    setNoteBody('')
    setNoteUrl('')
    void loadExtras()
  }

  const openTodos = projTodos.filter((t) => t.status !== 'done')
  const doneTodos = projTodos.filter((t) => t.status === 'done')
  const dueIn = activeCycle?.dueDate ? Math.ceil((new Date(`${activeCycle.dueDate}T23:59:59`).getTime() - Date.now()) / 86400000) : null

  return (
    <div className="module-page ph-page ph-detail" style={{ ['--pc' as string]: project.color }}>
      {/* ── Cabeçalho ── */}
      <div className="ph-hero">
        <button className="btn btn-secondary btn-sm ph-back" onClick={() => setPage('projects')}>← Projetos</button>
        <div className="ph-hero-main">
          <div className="ph-hero-title">
            <span className="ph-pulse big" style={{ background: pulse.color }} title={`Sinal de vida: ${pulse.label}`} />
            <h2>{project.name}</h2>
          </div>
          {project.description && <p className="ph-muted">{project.description}</p>}
          <div className="ph-hero-chips">
            <select className={`ph-status-pill st-${project.status}`} value={project.status} onChange={(e) => setStatusTo(e.target.value as ProjectStatus)} aria-label="Situação">
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.icon} {s.label}</option>
              ))}
            </select>
            <span className="project-chip">{areaLabel(project.area)}</span>
            {project.stage && <span className="project-chip">{stageLabel(project.stage)}</span>}
            <span className="ph-muted">
              {def.label} desde {fmtDate(project.statusChangedAt)}
              {ov?.lastActivityAt ? ` · última atividade há ${timeAgo(ov.lastActivityAt)} (${ov.lastActivitySource})` : ' · sem atividade registrada'}
            </span>
          </div>
        </div>
        <div className="ph-hero-actions">
          {!isClosed(project) && (
            <button className="btn btn-primary" onClick={() => startWorking(project)}>▶ Trabalhar nisso</button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>✏️ Editar</button>
          {project.githubRepoUrl && (
            <button className="btn btn-secondary btn-sm" onClick={() => window.api.app.openExternal(project.githubRepoUrl!)}>GitHub ↗</button>
          )}
        </div>
      </div>

      {ov && ov.alerts.length > 0 && (
        <div className="ph-alerts">
          {ov.alerts.map((a) => (
            <span key={a.kind} className={`ph-alert sev-${a.severity}`}>{a.text}</span>
          ))}
        </div>
      )}

      <div className="ph-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'tarefas' && openTodos.length + projIssues.filter((i) => i.state === 'open').length > 0 && (
              <span className="kanban-count">{openTodos.length + projIssues.filter((i) => i.state === 'open').length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Visão geral ── */}
      {tab === 'geral' && (
        <div className="ph-overview">
          <div className="ph-col">
            <div className="ph-panel ph-next">
              <div className="ph-panel-title">👉 Próxima ação</div>
              {project.nextAction ? (
                <div className="ph-next-body">
                  <button className="ph-tick big" title="Concluir e definir a seguinte" onClick={() => setActionMode('complete')}>○</button>
                  <div className="ph-next-text" onClick={() => setActionMode('set')}>{project.nextAction}</div>
                </div>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => setActionMode('set')}>+ Definir a próxima ação</button>
              )}
              <div className="ph-next-foot">
                {project.nextAction && (
                  <div className="ph-seg" role="group" aria-label="Tamanho da próxima ação">
                    {SIZES.map((sz) => (
                      <button
                        key={sz.key}
                        className={project.nextActionSize === sz.key ? 'active' : ''}
                        onClick={() => save({ nextActionSize: project.nextActionSize === sz.key ? null : sz.key })}
                        title={sz.key === 'rapida' ? 'Cabe numa brecha de 15 minutos' : 'Pede um bloco de foco'}
                      >
                        {sz.icon} {sz.label}
                      </button>
                    ))}
                  </div>
                )}
                {project.nextActionAt && <span className="ph-muted">definida há {timeAgo(project.nextActionAt)}</span>}
                <span style={{ flex: 1 }} />
                {project.nextAction && project.localPath && !isClosed(project) && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setDelegating(true)} title="O Claude executa a próxima ação num worktree isolado; você revisa depois">
                    🤖 Delegar
                  </button>
                )}
              </div>
            </div>

            <div className="ph-panel">
              <div className="ph-panel-title">
                📍 Onde parei
                <button className="ph-linkbtn" onClick={aiWhereLeftOff} disabled={aiBusy === 'where'}>{aiBusy === 'where' ? 'escrevendo…' : '✨ resumir atividades'}</button>
              </div>
              <InlineText value={project.whereLeftOff} placeholder="O que eu estava fazendo, estado atual, detalhe que vou esquecer…" onSave={(v) => save({ whereLeftOff: v })} rows={3} />
              {project.whereLeftOffAt && <div className="ph-muted">atualizado há {timeAgo(project.whereLeftOffAt)}</div>}
            </div>

            <div className={`ph-panel ${project.blocker ? 'ph-blocked' : ''}`}>
              <div className="ph-panel-title">
                🧱 Bloqueio
                {project.blocker && <button className="ph-linkbtn" onClick={() => save({ blocker: null, blockerNeed: null })}>✓ resolvido</button>}
              </div>
              <InlineText value={project.blocker} placeholder="Nada travando (escreva se algo impedir o avanço)" onSave={(v) => save({ blocker: v })} rows={1} />
              {project.blocker && (
                <>
                  <div className="ph-label">O que precisa acontecer para continuar</div>
                  <InlineText value={project.blockerNeed} placeholder="Ex: cliente mandar acesso, decidir stack…" onSave={(v) => save({ blockerNeed: v })} rows={1} />
                </>
              )}
            </div>

            <div className="ph-panel ph-finish">
              <div className="ph-panel-title">🏁 Linha de chegada — pronto quando…</div>
              <InlineText value={project.finishLine} placeholder="Ex: 10 usuários reais usando o app por uma semana" onSave={(v) => save({ finishLine: v })} />
            </div>

            <div className="ph-two">
              <div className="ph-panel">
                <div className="ph-panel-title">📦 Escopo da entrega atual</div>
                <InlineText value={project.scope} placeholder="- o mínimo que precisa estar pronto" onSave={(v) => save({ scope: v })} rows={5} />
              </div>
              <div className="ph-panel">
                <div className="ph-panel-title">🔮 Melhorias futuras</div>
                <InlineText value={project.futureIdeas} placeholder="- ideias boas, mas não agora" onSave={(v) => save({ futureIdeas: v })} rows={5} />
              </div>
            </div>

            <div className="ph-panel">
              <div className="ph-panel-title">
                ✨ Planejar com IA
                <button className="btn btn-secondary btn-sm" onClick={aiSuggestPlan} disabled={aiBusy === 'plan'}>
                  {aiBusy === 'plan' ? 'Pensando…' : aiPlan ? '↻ De novo' : 'Sugerir marcos, escopo e próxima ação'}
                </button>
              </div>
              {aiError && <div className="ph-error">{aiError}</div>}
              {aiPlan && (
                <div className="ph-ai-plan">
                  {aiPlan.finishLine && (
                    <div className="ph-ai-row"><span><strong>Pronto quando:</strong> {aiPlan.finishLine}</span><button className="btn btn-secondary btn-sm" onClick={() => save({ finishLine: aiPlan.finishLine! })}>Aplicar</button></div>
                  )}
                  {aiPlan.nextAction && (
                    <div className="ph-ai-row"><span><strong>Próxima ação:</strong> {aiPlan.nextAction}</span><button className="btn btn-secondary btn-sm" onClick={() => save({ nextAction: aiPlan.nextAction! })}>Aplicar</button></div>
                  )}
                  {aiPlan.scope && (
                    <div className="ph-ai-row"><span><strong>Escopo:</strong><pre>{aiPlan.scope}</pre></span><button className="btn btn-secondary btn-sm" onClick={() => save({ scope: aiPlan.scope! })}>Aplicar</button></div>
                  )}
                  {aiPlan.futureIdeas && (
                    <div className="ph-ai-row"><span><strong>Depois:</strong><pre>{aiPlan.futureIdeas}</pre></span><button className="btn btn-secondary btn-sm" onClick={() => save({ futureIdeas: aiPlan.futureIdeas! })}>Aplicar</button></div>
                  )}
                  {!!aiPlan.milestones?.length && (
                    <div className="ph-ai-row">
                      <span>
                        <strong>Marcos:</strong>
                        <ol>{aiPlan.milestones.map((m) => <li key={m.title}>{m.title}{m.targetDate ? ` (${fmtDate(m.targetDate)})` : ''}</li>)}</ol>
                      </span>
                      <button className="btn btn-secondary btn-sm" onClick={() => applyMilestones(aiPlan.milestones!)}>Criar marcos</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="ph-col side">
            <div className="ph-panel ph-stats">
              <div className="ph-ring" style={{ ['--pct' as string]: `${ov?.progress ?? 0}` }}>
                <span>{ov?.progress ?? 0}%</span>
              </div>
              <div className="ph-stat-grid">
                <div><strong>{fmtMinutes(ov?.minutes7d ?? 0)}</strong><span>7 dias</span></div>
                <div><strong>{fmtMinutes(ov?.minutes30d ?? 0)}</strong><span>30 dias</span></div>
                <div><strong>{fmtMinutes(ov?.minutesTotal ?? 0)}</strong><span>total</span></div>
                <div><strong>{ov?.openTodos ?? 0}</strong><span>tarefas abertas</span></div>
                <div><strong>{ov?.openIssues ?? 0}</strong><span>issues</span></div>
                <div><strong>{ov?.commits7d ?? 0}</strong><span>commits 7d</span></div>
              </div>
            </div>

            <DelegationsPanel
              project={project}
              onAccepted={(d) => {
                if (d.action === project.nextAction) setActionMode('complete')
              }}
            />

            {project.status === 'pausado' && (
              <div className="ph-panel">
                <div className="ph-panel-title">⏸ Pausado</div>
                <div>{project.pauseReason ?? 'Sem motivo registrado'}</div>
                <div className="ph-muted">
                  {project.resumeAt ? `Retomar em ${fmtDate(project.resumeAt)}` : project.resumeCondition ? `Retomar quando: ${project.resumeCondition}` : 'Sem condição de retomada'}
                </div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setStatusTo('fila')}>↺ Retomar</button>
              </div>
            )}

            <div className="ph-panel">
              <div className="ph-panel-title">
                🔁 Ciclo / versão
                <button className="ph-linkbtn" onClick={() => setCycleMode('new')}>+ novo ciclo</button>
              </div>
              {activeCycle ? (
                <>
                  <div className="ph-cycle-name">{activeCycle.name}</div>
                  {activeCycle.goal && <div className="ph-muted">{activeCycle.goal}</div>}
                  <div className={`ph-cycle-due ${dueIn != null && dueIn < 0 ? 'late' : dueIn != null && dueIn <= 3 ? 'soon' : ''}`}>
                    {activeCycle.dueDate ? (dueIn! < 0 ? `venceu há ${-dueIn!}d (${fmtDate(activeCycle.dueDate)})` : `${dueIn}d restantes · ${fmtDate(activeCycle.dueDate)}`) : 'sem prazo'}
                    {activeCycle.extensions > 0 && <span> · {activeCycle.extensions} extensão(ões) (original {fmtDate(activeCycle.originalDueDate)})</span>}
                  </div>
                  <div className="ph-btnrow">
                    <button className="btn btn-secondary btn-sm" onClick={() => setCycleMode('extend')}>⏩ Estender</button>
                    <button className="btn btn-primary btn-sm" onClick={() => setCycleMode('close')}>🏁 Fechar ciclo</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setChangelogCycle(activeCycle)} title="Prévia do changelog com os commits até agora">📜</button>
                  </div>
                </>
              ) : (
                <div className="ph-muted">Para projetos contínuos (ex.: RickOS), trabalhe em ciclos com prazo: v1.3, v1.4…</div>
              )}
              {projCycles.filter((c) => c.status !== 'ativo').length > 0 && (
                <div className="ph-cycle-history">
                  {projCycles.filter((c) => c.status !== 'ativo').slice(0, 4).map((c) => (
                    <div key={c.id} className="ph-muted ph-cycle-row">
                      <span>{c.status === 'concluido' ? '✓' : '✕'} {c.name} · {fmtDate(c.closedAt)}{c.extensions ? ` · +${c.extensions}` : ''}</span>
                      {c.status === 'concluido' && <button className="ph-linkbtn" onClick={() => setChangelogCycle(c)}>📜 changelog</button>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!isClosed(project) && <ScheduleEditor project={project} />}

            <div className="ph-panel">
              <div className="ph-panel-title">🎯 Marcos</div>
              <div className="ph-ms-list">
                {ms.length === 0 && <div className="ph-muted">Quebre a entrega em 3–5 marcos.</div>}
                {ms.map((m) => {
                  const pct = msProgress(m.id, !!m.doneAt)
                  const late = !m.doneAt && m.targetDate && m.targetDate < localDateStr(new Date())
                  return (
                    <div key={m.id} className={`ph-ms ${m.doneAt ? 'done' : ''}`}>
                      <input type="checkbox" checked={!!m.doneAt} onChange={() => toggleMilestone(m.id, !!m.doneAt, m.title)} />
                      <div className="ph-ms-body">
                        <div className="ph-ms-title">{m.title}</div>
                        <div className="ph-ms-meta">
                          <span className="ph-progress small"><span style={{ width: `${pct}%` }} /></span>
                          <span>{pct}%</span>
                          {m.targetDate && <span className={late ? 'late' : ''}>{fmtDate(m.targetDate)}</span>}
                          {m.cycleId && <span>🔁 {projCycles.find((c) => c.id === m.cycleId)?.name}</span>}
                        </div>
                      </div>
                      <button className="ph-x" aria-label="Remover marco" onClick={() => window.api.milestones.delete(m.id).then(refreshMilestones)}>✕</button>
                    </div>
                  )
                })}
              </div>
              <div className="ph-row" style={{ marginTop: 6 }}>
                <input placeholder="Novo marco" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMilestone()} style={{ flex: 1, minWidth: 120 }} />
                <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} />
                <button className="btn btn-secondary btn-sm" onClick={addMilestone}>+</button>
              </div>
            </div>

            <div className="ph-panel">
              <div className="ph-panel-title">
                🕰 Recente
                <button className="ph-linkbtn" onClick={() => setTab('historico')}>ver tudo</button>
              </div>
              {events.slice(0, 6).map((e) => (
                <div key={e.id} className="ph-event mini">
                  <span>{EVENT_LABEL[e.kind] ?? e.kind}</span>
                  <span className="ph-event-text">{e.kind === 'status' ? `${statusDef(e.fromStatus ?? '').label} → ${statusDef(e.toStatus ?? '').label}${e.text ? ` · ${e.text}` : ''}` : e.text}</span>
                  <span className="ph-muted">{timeAgo(e.createdAt)}</span>
                </div>
              ))}
              {events.length === 0 && <div className="ph-muted">Nada registrado ainda.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'roadmap' && <RoadmapView project={project} />}

      {/* ── Tarefas: TODOs + issues do GitHub, sem duplicar ── */}
      {tab === 'tarefas' && (
        <div className="ph-tasks">
          <div className="quick-add-row">
            <input placeholder={`Nova tarefa em ${project.name}`} value={newTodo} onChange={(e) => setNewTodo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTodo()} />
            <button className="btn btn-primary" onClick={addTodo}>+ Tarefa</button>
          </div>
          <div className="ph-link-search">
            <input placeholder="🔗 Vincular TODO existente (buscar…)" value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} />
            {linkCandidates.map((t) => (
              <button
                key={t.id}
                className="ph-chip"
                onClick={async () => {
                  await window.api.projects.linkTodos([t.id], project.id)
                  setLinkSearch('')
                  void loadExtras()
                  void refreshAll()
                }}
              >
                + {t.title}
              </button>
            ))}
          </div>
          <h3 className="ph-section-title">Abertas <span className="kanban-count">{openTodos.length}</span></h3>
          <div className="list-stack">
            {openTodos.length === 0 && <div className="empty-hint">Nenhuma tarefa aberta.</div>}
            {openTodos.map((t) => (
              <div key={t.id} className="list-row">
                <input type="checkbox" checked={false} onChange={() => toggleTodo(t)} />
                <span className="list-row-title">
                  {t.title}
                  {t.status === 'inbox' && <span className="project-chip" style={{ marginLeft: 6 }}>inbox</span>}
                  {t.dueDate && <span className="ph-muted"> · {fmtDate(t.dueDate)}</span>}
                </span>
                {ms.length > 0 && (
                  <select
                    value={t.milestoneId ?? ''}
                    onChange={async (e) => {
                      await window.api.projects.setTodoMilestone(t.id, e.target.value ? Number(e.target.value) : null)
                      void loadExtras()
                      void refreshAll()
                    }}
                    title="Marco"
                    aria-label="Marco"
                  >
                    <option value="">sem marco</option>
                    {ms.map((m) => <option key={m.id} value={m.id}>🎯 {m.title}</option>)}
                  </select>
                )}
                <button className="btn btn-secondary btn-sm" title="Trabalhar nesta tarefa" onClick={() => startWorking(project, t.title)}>▶</button>
                <button className="btn btn-secondary btn-sm" title="Tornar a próxima ação" onClick={() => save({ nextAction: t.title })}>👉</button>
              </div>
            ))}
          </div>
          {repo && (
            <>
              <h3 className="ph-section-title">Issues do GitHub ({repo}) <span className="kanban-count">{projIssues.filter((i) => i.state === 'open').length}</span></h3>
              <div className="list-stack">
                {projIssues.length === 0 && <div className="empty-hint">Nenhuma issue (sincronize em Issues).</div>}
                {projIssues.filter((i) => i.state === 'open').map((i) => (
                  <div key={i.id} className="list-row">
                    <span className="list-row-title">#{i.number > 0 ? i.number : '—'} {i.title}</span>
                    {i.url && <button className="btn btn-secondary btn-sm" onClick={() => window.api.app.openExternal(i.url!)}>↗</button>}
                    <button
                      className="btn btn-secondary btn-sm"
                      title="Trazer como TODO do projeto"
                      onClick={async () => {
                        await window.api.todos.create(i.title, i.url, 'todo', 'github', 0, null, project.id)
                        void loadExtras()
                      }}
                    >
                      → TODO
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
          {doneTodos.length > 0 && (
            <details className="ph-details">
              <summary>Concluídas ({doneTodos.length})</summary>
              <div className="list-stack">
                {doneTodos.map((t) => (
                  <div key={t.id} className="list-row done">
                    <input type="checkbox" checked onChange={() => toggleTodo(t)} />
                    <span className="list-row-title" style={{ textDecoration: 'line-through' }}>{t.title}</span>
                    {t.doneAt && <span className="ph-muted">{fmtDate(t.doneAt)}</span>}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Código: commits, branches e worktrees ── */}
      {tab === 'codigo' && (
        <div className="ph-code">
          {!project.localPath && <div className="empty-hint">Defina o caminho local (Editar) para ver commits, branches e worktrees.</div>}
          {project.localPath && (
            <>
              <div className="ph-code-head">
                <code className="ph-muted">{project.localPath}</code>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    try {
                      localStorage.setItem(WORKTREES_FILTER_KEY, `p:${project.id}`)
                    } catch {
                      // sem storage: abre sem filtro
                    }
                    setPage('worktrees')
                  }}
                >
                  🌿 Gerenciar branches
                </button>
              </div>
              <h3 className="ph-section-title">Branches e worktrees <span className="kanban-count">{branches.length}</span></h3>
              <div className="list-stack">
                {branches.length === 0 && <div className="empty-hint">Nenhuma branch encontrada no último scan.</div>}
                {branches.map((b) => (
                  <div key={b.id} className="list-row">
                    <span className="list-row-title">
                      {b.isBase ? '🏠 ' : b.worktreePath ? '🌳 ' : '⎇ '}
                      {b.branch ?? '(detached)'}
                      {b.worktreePath && !b.isBase && <span className="ph-muted"> · worktree</span>}
                      {b.ahead > 0 && <span className="ph-muted"> · +{b.ahead}</span>}
                      {(b.dirty ?? 0) > 0 && <span className="ph-muted"> · {b.dirty} alterados</span>}
                    </span>
                    <span className="ph-muted">{b.lastCommitAt ? timeAgo(b.lastCommitAt) : ''}</span>
                  </div>
                ))}
              </div>
              <h3 className="ph-section-title">Commits recentes</h3>
              <div className="ph-commits">
                {commits.length === 0 && <div className="empty-hint">Sem commits (ou não é um repositório git).</div>}
                {commits.map((c) => (
                  <div key={c.hash} className="ph-commit">
                    <code>{c.hash}</code>
                    <span className="ph-commit-subject">{c.subject}</span>
                    {c.refs && <span className="ph-tag">{c.refs.replace('HEAD -> ', '')}</span>}
                    <span className="ph-muted">{timeAgo(c.date)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Base de conhecimento ── */}
      {tab === 'notas' && (
        <div className="ph-notes">
          <div className="ph-panel">
            <div className="ph-seg">
              {(['nota', 'link', 'decisao'] as const).map((k) => (
                <button key={k} className={noteKind === k ? 'active' : ''} onClick={() => setNoteKind(k)}>
                  {k === 'nota' ? '📝 Nota' : k === 'link' ? '🔗 Link' : '⚖️ Decisão'}
                </button>
              ))}
            </div>
            <input placeholder={noteKind === 'decisao' ? 'O que foi decidido' : 'Título'} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} />
            {noteKind === 'link' && <input placeholder="https://…" value={noteUrl} onChange={(e) => setNoteUrl(e.target.value)} />}
            <textarea rows={3} placeholder={noteKind === 'decisao' ? 'Por quê? Alternativas consideradas…' : 'Conteúdo (markdown)'} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
            <div><button className="btn btn-primary btn-sm" onClick={addNote}>Adicionar</button></div>
          </div>
          <div className="ph-notes-grid">
            {notes.length === 0 && <div className="empty-hint">Nada aqui ainda: anote decisões, links úteis e aprendizados.</div>}
            {notes.map((n) => (
              <div key={n.id} className={`ph-note kind-${n.kind}`}>
                <div className="ph-note-head">
                  <span>{n.kind === 'nota' ? '📝' : n.kind === 'link' ? '🔗' : '⚖️'}</span>
                  <strong>{n.title}</strong>
                  <span style={{ flex: 1 }} />
                  <button className="ph-x" title={n.pinned ? 'Desafixar' : 'Fixar'} onClick={() => window.api.projectNotes.save({ ...n, pinned: n.pinned ? 0 : 1 }).then(loadExtras)}>
                    {n.pinned ? '📌' : '📍'}
                  </button>
                  <button className="ph-x" aria-label="Excluir" onClick={() => window.confirm('Excluir?') && window.api.projectNotes.delete(n.id).then(loadExtras)}>✕</button>
                </div>
                {n.url && (
                  <button className="ph-linkbtn" onClick={() => window.api.app.openExternal(n.url!)}>{n.url}</button>
                )}
                {n.body && <div className="ph-note-body">{renderMarkdown(n.body)}</div>}
                <div className="ph-muted">{fmtDate(n.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Histórico: decisões + sessões ── */}
      {tab === 'historico' && (
        <div className="ph-history">
          <div>
            <h3 className="ph-section-title">Decisões e registros</h3>
            <div className="ph-timeline">
              {events.length === 0 && <div className="empty-hint">Nada registrado.</div>}
              {events.map((e) => (
                <div key={e.id} className={`ph-event kind-${e.kind}`}>
                  <span className="ph-event-date">{new Date(e.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="ph-event-kind">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                  <span className="ph-event-text">
                    {e.kind === 'status' ? <strong>{statusDef(e.fromStatus ?? '').label} → {statusDef(e.toStatus ?? '').label}</strong> : null}
                    {e.kind === 'status' && e.text ? ' · ' : ''}
                    {e.text}
                  </span>
                </div>
              ))}
            </div>
            {project.retrospective && (
              <div className="ph-panel" style={{ marginTop: 12 }}>
                <div className="ph-panel-title">🔍 Retrospectiva</div>
                <div className="md-preview-pane">{renderMarkdown(project.retrospective)}</div>
              </div>
            )}
          </div>
          <div>
            <h3 className="ph-section-title">Sessões no timer <span className="kanban-count">{sessions.length}</span></h3>
            <div className="list-stack">
              {sessions.length === 0 && <div className="empty-hint">Sem sessões. Use “▶ Trabalhar nisso”.</div>}
              {sessions.slice(0, 60).map((s) => {
                const min = Math.round(((s.endTime ? new Date(s.endTime).getTime() : Date.now()) - new Date(s.startTime).getTime()) / 60000)
                return (
                  <div key={s.id} className="list-row">
                    <span className="list-row-title">{s.title}</span>
                    <span className="ph-muted">{fmtDate(s.startTime)} · {fmtMinutes(min)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {statusTo && <StatusChangeModal project={project} to={statusTo} onClose={() => setStatusTo(null)} />}
      {actionMode && <NextActionModal project={project} mode={actionMode} onClose={() => setActionMode(null)} />}
      {editing && <ProjectForm project={project} onClose={() => setEditing(false)} />}
      {cycleMode && (
        <CycleModal
          project={project}
          cycle={activeCycle}
          mode={cycleMode}
          onClose={() => setCycleMode(null)}
          onDone={cycleChanged}
          onClosed={async (id) => {
            const all = await window.api.cycles.getAll(project.id)
            const c = all.find((x) => x.id === id)
            if (c) setChangelogCycle(c)
          }}
        />
      )}
      {changelogCycle && <ChangelogModal cycle={changelogCycle} onClose={() => setChangelogCycle(null)} />}
      {delegating && <DelegateModal project={project} onClose={() => setDelegating(false)} />}
    </div>
  )
}
