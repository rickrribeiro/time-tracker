import React, { useEffect, useMemo, useState } from 'react'
import { Project, ProjectArea, ProjectStatus, ProjectSuggestion, ProjectSuggestionsResult } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { useUIStore } from '../../../store/uiStore'
import { ProgressModal } from '../components/ProgressModal'
import { ProjectSuggestions, suggestionColor } from '../components/ProjectSuggestions'
import { ProjectCard } from '../components/ProjectCard'
import { StatusChangeModal } from '../components/StatusChangeModal'
import { NextActionModal } from '../components/NextActionModal'
import { TriageModal } from '../components/TriageModal'
import { ProjectForm } from '../components/ProjectForm'
import { ProjectShelf } from '../components/ProjectShelf'
import { ProjectMetrics } from '../components/ProjectMetrics'
import { AREAS, STAGES, FOCUS_LIMIT_KEY, isClosed, statusDef } from '../lib/constants'
import '../projects-hub.css'

type View = 'cockpit' | 'estagios' | 'estante' | 'metricas'
const VIEWS: { key: View; label: string }[] = [
  { key: 'cockpit', label: '🎛 Cockpit' },
  { key: 'estagios', label: '🧬 Estágios' },
  { key: 'estante', label: '🏆 Estante' },
  { key: 'metricas', label: '📈 Métricas' }
]
const COCKPIT_ORDER: ProjectStatus[] = ['foco', 'fila', 'incubadora', 'pausado']

function readLS<T extends string>(k: string, def: T): T {
  try {
    return (localStorage.getItem(k) as T) || def
  } catch {
    return def
  }
}
function writeLS(k: string, v: string): void {
  try {
    localStorage.setItem(k, v)
  } catch {
    // storage indisponível
  }
}

export function ProjectsPage(): React.ReactElement {
  const { projects, overview, refreshAll, refreshOverview, create, setStage, loadingOverview } = useProjectStore()
  const { openProject } = useUIStore()
  const [view, setView] = useState<View>(() => readLS<View>('rickos:projectsHubView', 'cockpit'))
  const [area, setArea] = useState<'todas' | ProjectArea>(() => readLS<'todas' | ProjectArea>('rickos:projectsArea', 'todas'))
  const [statusModal, setStatusModal] = useState<{ p: Project; to: ProjectStatus } | null>(null)
  const [actionModal, setActionModal] = useState<{ p: Project; mode: 'complete' | 'set' } | null>(null)
  const [showTriage, setShowTriage] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<ProjectSuggestionsResult | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [focusLimit, setFocusLimit] = useState(3)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => {
    void refreshAll()
    void loadSuggestions()
    window.api.settings.get(FOCUS_LIMIT_KEY).then((v) => setFocusLimit(Number(v) || 3))
    // outro cliente (celular/desktop) mudou algo → recarrega
    const off = window.api.projects.onChanged(() => void refreshAll())
    return off
  }, [])

  async function loadSuggestions(): Promise<void> {
    setLoadingSuggestions(true)
    try {
      setSuggestions(await window.api.projects.suggestions())
    } catch {
      setSuggestions(null)
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function createFromSuggestion(s: ProjectSuggestion): Promise<void> {
    await create(s.name, s.description, s.githubRepoUrl, suggestionColor(s.name), null, s.path, '', null, null, null)
    await loadSuggestions()
  }

  function changeView(v: View): void {
    setView(v)
    writeLS('rickos:projectsHubView', v)
  }
  function changeArea(a: 'todas' | ProjectArea): void {
    setArea(a)
    writeLS('rickos:projectsArea', a)
  }
  async function changeFocusLimit(n: number): Promise<void> {
    setFocusLimit(n)
    await window.api.settings.set(FOCUS_LIMIT_KEY, String(n))
    void refreshOverview()
  }

  const visible = useMemo(() => projects.filter((p) => area === 'todas' || p.area === area), [projects, area])
  const open = visible.filter((p) => !isClosed(p))
  const untriaged = projects.filter((p) => !p.triagedAt && !isClosed(p)).length
  const byPriority = (a: Project, b: Project): number => b.priority - a.priority || a.name.localeCompare(b.name)

  const radar = open
    .flatMap((p) => (overview[p.id]?.alerts ?? []).filter((a) => a.severity !== 'baixa').map((a) => ({ p, a })))
    .sort((x, y) => (x.a.severity === y.a.severity ? 0 : x.a.severity === 'alta' ? -1 : 1))

  const onStatus = (p: Project, to: ProjectStatus): void => setStatusModal({ p, to })
  const cardProps = {
    onStatus,
    onCompleteAction: (p: Project) => setActionModal({ p, mode: 'complete' }),
    onSetAction: (p: Project) => setActionModal({ p, mode: 'set' })
  }

  function drop(e: React.DragEvent, to: ProjectStatus): void {
    e.preventDefault()
    setDragOver(null)
    const id = Number(e.dataTransfer.getData('text/plain'))
    const p = projects.find((x) => x.id === id)
    if (p && p.status !== to) setStatusModal({ p, to })
  }

  return (
    <div className="module-page ph-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🗂 Projetos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Poucos em foco, cada um com uma próxima ação. Nada morre em silêncio.
          </p>
        </div>
        <div className="ph-header-actions">
          {untriaged > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowTriage(true)} title="Decidir situação, área e próxima ação dos projetos ainda não triados">
              🧭 Triagem <span className="psug-count">{untriaged}</span>
            </button>
          )}
          {untriaged === 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowTriage(true)} title="Vincular tags do timer e TODOs soltos aos projetos">
              🔗 Vínculos
            </button>
          )}
          <button
            className={`btn btn-secondary btn-sm psug-toggle ${showSuggestions ? 'active' : ''}`}
            onClick={() => {
              setShowSuggestions((v) => !v)
              if (!showSuggestions) void loadSuggestions()
            }}
            title="Projetos sugeridos a partir da sua pasta de projetos"
          >
            💡 Sugestões
            {!!suggestions?.items.length && <span className="psug-count">{suggestions.items.length}</span>}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowProgress(true)}>📊 GitHub</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Novo</button>
        </div>
      </div>

      <div className="ph-toolbar">
        <div className="seg-toggle ph-views">
          {VIEWS.map((v) => (
            <button key={v.key} className={`seg-btn ${view === v.key ? 'active' : ''}`} onClick={() => changeView(v.key)}>{v.label}</button>
          ))}
        </div>
        <div className="seg-toggle">
          <button className={`seg-btn ${area === 'todas' ? 'active' : ''}`} onClick={() => changeArea('todas')}>Todos</button>
          {AREAS.map((a) => (
            <button key={a.key} className={`seg-btn ${area === a.key ? 'active' : ''}`} onClick={() => changeArea(a.key)}>{a.label}</button>
          ))}
        </div>
        {loadingOverview && <span className="ph-muted">atualizando…</span>}
      </div>

      {showSuggestions && (
        <ProjectSuggestions
          data={suggestions}
          loading={loadingSuggestions}
          onReload={loadSuggestions}
          onCreate={createFromSuggestion}
          onClose={() => setShowSuggestions(false)}
        />
      )}

      {view === 'cockpit' && (
        <>
          {radar.length > 0 && (
            <div className="ph-radar">
              <div className="ph-radar-title">📡 Radar — precisam de decisão</div>
              <div className="ph-radar-list">
                {radar.slice(0, 8).map(({ p, a }, i) => (
                  <button key={`${p.id}-${i}`} className={`ph-radar-item sev-${a.severity}`} onClick={() => openProject(p.id)}>
                    <span className="ph-dot" style={{ background: p.color }} />
                    <strong>{p.name}</strong>
                    <span>{a.text}</span>
                  </button>
                ))}
                {radar.length > 8 && <span className="ph-muted">+{radar.length - 8} alertas</span>}
              </div>
            </div>
          )}

          {COCKPIT_ORDER.map((st) => {
            const def = statusDef(st)
            const list = open.filter((p) => p.status === st).sort(byPriority)
            const isFocus = st === 'foco'
            return (
              <section
                key={st}
                className={`ph-lane lane-${st} ${dragOver === st ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(st)
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => drop(e, st)}
              >
                <div className="ph-lane-head">
                  <h3 className="ph-section-title">
                    {def.icon} {def.label} <span className="kanban-count">{list.length}{isFocus ? `/${focusLimit}` : ''}</span>
                  </h3>
                  {isFocus && (
                    <label className="ph-muted ph-limit">
                      limite
                      <select value={focusLimit} onChange={(e) => changeFocusLimit(Number(e.target.value))}>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  )}
                  {isFocus && list.length > focusLimit && <span className="ph-warn-inline">acima do limite</span>}
                </div>
                <p className="ph-muted ph-lane-hint">{def.hint}</p>
                <div className={`ph-grid ${isFocus ? 'focus' : ''}`}>
                  {list.length === 0 && <div className="empty-hint">{isFocus ? 'Nada em foco. Escolha 1–3 projetos da fila.' : 'Vazio — arraste um card para cá.'}</div>}
                  {list.map((p) => (
                    <ProjectCard key={p.id} project={p} ov={overview[p.id]} compact={st === 'incubadora' || st === 'pausado'} {...cardProps} />
                  ))}
                </div>
              </section>
            )
          })}
        </>
      )}

      {view === 'estagios' && (
        <div className="pipeline-board">
          {STAGES.map((s) => {
            const inStage = open.filter((p) => (p.stage || '') === s.key)
            return (
              <div
                key={s.key || 'none'}
                className="pipeline-column"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = Number(e.dataTransfer.getData('text/plain'))
                  if (id) void setStage(id, s.key)
                }}
              >
                <div className="pipeline-column-header">{s.label} <span className="kanban-count">{inStage.length}</span></div>
                <div className="pipeline-column-body">
                  {inStage.map((p) => (
                    <div
                      key={p.id}
                      className="pipeline-card"
                      style={{ borderLeft: `3px solid ${p.color}` }}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.id))}
                      onClick={() => openProject(p.id)}
                      title="Arraste para mudar de estágio · clique para abrir"
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{statusDef(p.status).icon} {statusDef(p.status).label}</div>
                      {p.pricing && <span className="project-chip">💵 {p.pricing}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {view === 'estante' && <ProjectShelf projects={visible} onStatus={onStatus} />}
      {view === 'metricas' && <ProjectMetrics projects={visible} />}

      {statusModal && <StatusChangeModal project={statusModal.p} to={statusModal.to} onClose={() => setStatusModal(null)} />}
      {actionModal && <NextActionModal project={projects.find((p) => p.id === actionModal.p.id) ?? actionModal.p} mode={actionModal.mode} onClose={() => setActionModal(null)} />}
      {showTriage && <TriageModal onClose={() => setShowTriage(false)} />}
      {showForm && <ProjectForm project={null} onClose={() => setShowForm(false)} />}
      {showProgress && <ProgressModal projects={open} onClose={() => setShowProgress(false)} />}
    </div>
  )
}
