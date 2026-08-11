import React, { useEffect, useState } from 'react'
import { Project, ProjectMilestone } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { ProgressModal } from '../components/ProgressModal'

const PRESET_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4']

const STAGES: { key: string; label: string }[] = [
  { key: 'ideia', label: '💡 Ideia' },
  { key: 'validacao', label: '🔎 Validação' },
  { key: 'mvp', label: '🛠 MVP' },
  { key: 'lancado', label: '🚀 Lançado' },
  { key: 'monetizando', label: '💰 Monetizando' },
  { key: 'morto', label: '💀 Morto' },
  { key: 'trabalho', label: '🏢 Trabalho' }
]
const stageLabel = (k: string): string => STAGES.find((s) => s.key === k)?.label ?? k

interface FormState {
  name: string
  description: string
  githubRepoUrl: string
  color: string
  claudeCommand: string
  localPath: string
  stage: string
  businessModel: string
  pricing: string
  audience: string
}

const emptyForm: FormState = { name: '', description: '', githubRepoUrl: '', color: '#6366f1', claudeCommand: '', localPath: '', stage: 'ideia', businessModel: '', pricing: '', audience: '' }

export function ProjectsPage(): React.ReactElement {
  const { projects, refresh, create, update, setStage, remove } = useProjectStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showProgress, setShowProgress] = useState(false)
  const [view, setView] = useState<'cards' | 'pipeline'>(() => (localStorage.getItem('rickos:projectsView') as 'cards' | 'pipeline') || 'cards')
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [msTitle, setMsTitle] = useState('')
  const [msDate, setMsDate] = useState('')

  async function refreshMilestones(): Promise<void> {
    setMilestones(await window.api.milestones.getAll())
  }

  useEffect(() => {
    refresh()
    refreshMilestones()
  }, [])

  function changeView(v: 'cards' | 'pipeline'): void {
    setView(v)
    localStorage.setItem('rickos:projectsView', v)
  }

  const nextMilestone = (projectId: number): ProjectMilestone | undefined =>
    milestones.find((m) => m.projectId === projectId && !m.doneAt)

  function startCreate(): void {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function startEdit(p: Project): void {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      githubRepoUrl: p.githubRepoUrl ?? '',
      color: p.color,
      claudeCommand: p.claudeCommand ?? '',
      localPath: p.localPath ?? '',
      stage: p.stage ?? 'ideia',
      businessModel: p.businessModel ?? '',
      pricing: p.pricing ?? '',
      audience: p.audience ?? ''
    })
    setShowForm(true)
  }

  async function addMilestone(): Promise<void> {
    if (!editing || !msTitle.trim()) return
    await window.api.milestones.create(editing.id, msTitle.trim(), msDate || null)
    setMsTitle('')
    setMsDate('')
    refreshMilestones()
  }

  async function handleSubmit(): Promise<void> {
    if (!form.name.trim()) return
    if (editing) {
      await update({
        ...editing,
        name: form.name.trim(),
        description: form.description.trim() || null,
        githubRepoUrl: form.githubRepoUrl.trim() || null,
        color: form.color,
        claudeCommand: form.claudeCommand.trim() || null,
        localPath: form.localPath.trim() || null,
        stage: form.stage,
        businessModel: form.businessModel.trim() || null,
        pricing: form.pricing.trim() || null,
        audience: form.audience.trim() || null
      })
    } else {
      await create(
        form.name.trim(),
        form.description.trim() || null,
        form.githubRepoUrl.trim() || null,
        form.color,
        form.claudeCommand.trim() || null,
        form.localPath.trim() || null,
        form.stage,
        form.businessModel.trim() || null,
        form.pricing.trim() || null,
        form.audience.trim() || null
      )
    }
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
  }

  async function toggleArchive(p: Project): Promise<void> {
    await update({ ...p, archived: p.archived ? 0 : 1 })
  }

  const active = projects.filter((p) => !p.archived)
  const archived = projects.filter((p) => p.archived)

  function renderCard(p: Project): React.ReactElement {
    return (
      <div key={p.id} className="stat-card" style={{ borderLeft: `3px solid ${p.color}`, opacity: p.archived ? 0.55 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="stat-card-value" style={{ fontSize: 15 }}>
            {p.name}
          </span>
          <button className="btn btn-danger btn-sm" onClick={() => remove(p.id)}>
            ✕
          </button>
        </div>
        {p.description && <div className="stat-card-sub">{p.description}</div>}
        {p.githubRepoUrl && (
          <div className="stat-card-sub" style={{ wordBreak: 'break-all' }}>
            {p.githubRepoUrl}
          </div>
        )}
        {p.claudeCommand && (
          <div className="stat-card-sub">🤖 <code>{p.claudeCommand}</code></div>
        )}
        {p.localPath && (
          <div className="stat-card-sub" style={{ wordBreak: 'break-all' }}>📂 <code>{p.localPath}</code></div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          <span className="project-chip">{stageLabel(p.stage)}</span>
          {p.pricing && <span className="project-chip">💵 {p.pricing}</span>}
          {nextMilestone(p.id) && <span className="due-badge due-future">🎯 {nextMilestone(p.id)!.title}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => startEdit(p)}>
            Editar
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => toggleArchive(p)}>
            {p.archived ? 'Desarquivar' : 'Arquivar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🗂 Projetos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Associe um repo do GitHub e veja as issues em <strong>Issues (Kanban)</strong>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg-toggle">
            <button className={view === 'cards' ? 'active' : ''} onClick={() => changeView('cards')}>Cards</button>
            <button className={view === 'pipeline' ? 'active' : ''} onClick={() => changeView('pipeline')}>Pipeline</button>
          </div>
          <button className="btn btn-secondary" onClick={() => setShowProgress(true)}>📊 Progresso</button>
          <button className="btn btn-primary" onClick={startCreate}>
            + Novo Projeto
          </button>
        </div>
      </div>

      {showForm && (
        <div className="chart-section" style={{ marginBottom: 16, maxWidth: 520 }}>
          <div className="chart-title">{editing ? 'Editar projeto' : 'Novo projeto'}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            <input placeholder="Descrição (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input placeholder="GitHub repo URL (opcional)" value={form.githubRepoUrl} onChange={(e) => setForm({ ...form, githubRepoUrl: e.target.value })} />
            <input placeholder="Comando do Claude (opcional — padrão global)" value={form.claudeCommand} onChange={(e) => setForm({ ...form, claudeCommand: e.target.value })} />
            <input placeholder="Caminho local (ex: /Users/você/Projects/app) — o Prompt Runner roda o Claude aqui" value={form.localPath} onChange={(e) => setForm({ ...form, localPath: e.target.value })} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} title="Estágio de negócio">
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <input placeholder="Modelo de receita (ex: SaaS, one-off)" value={form.businessModel} onChange={(e) => setForm({ ...form, businessModel: e.target.value })} style={{ flex: 1, minWidth: 140 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input placeholder="Preço (ex: R$ 29/mês)" value={form.pricing} onChange={(e) => setForm({ ...form, pricing: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
              <input placeholder="Público-alvo" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
            </div>
            {editing && (
              <div className="chart-section" style={{ padding: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Marcos</div>
                <div className="list-stack">
                  {milestones.filter((m) => m.projectId === editing.id).map((m) => (
                    <div key={m.id} className="list-row" style={{ padding: '4px 6px' }}>
                      <input type="checkbox" checked={!!m.doneAt} onChange={() => window.api.milestones.toggle(m.id, m.doneAt ? 0 : 1).then(refreshMilestones)} />
                      <span className="list-row-title" style={{ textDecoration: m.doneAt ? 'line-through' : 'none' }}>{m.title}</span>
                      {m.targetDate && <span className="due-badge due-future">{m.targetDate}</span>}
                      <button className="btn btn-danger btn-sm" onClick={() => window.api.milestones.delete(m.id).then(refreshMilestones)}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input placeholder="Novo marco" value={msTitle} onChange={(e) => setMsTitle(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && addMilestone()} />
                  <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} />
                  <button className="btn btn-secondary btn-sm" onClick={addMilestone}>+ Marco</button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 4 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    border: form.color === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
                {editing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'cards' ? (
        <>
          <div className="cards-grid">
            {active.length === 0 && <div className="empty-hint">Nenhum projeto ativo.</div>}
            {active.map(renderCard)}
          </div>
          {archived.length > 0 && (
            <>
              <div className="nav-group-label" style={{ marginTop: 20 }}>
                Arquivados
              </div>
              <div className="cards-grid">{archived.map(renderCard)}</div>
            </>
          )}
        </>
      ) : (
        <div className="pipeline-board">
          {STAGES.map((s) => {
            const inStage = active.filter((p) => (p.stage || 'trabalho') === s.key)
            return (
              <div
                key={s.key}
                className="pipeline-column"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = Number(e.dataTransfer.getData('text/plain'))
                  if (id) setStage(id, s.key)
                }}
              >
                <div className="pipeline-column-header">{s.label} <span className="kanban-count">{inStage.length}</span></div>
                <div className="pipeline-column-body">
                  {inStage.map((p) => {
                    const ms = nextMilestone(p.id)
                    return (
                      <div
                        key={p.id}
                        className="pipeline-card"
                        style={{ borderLeft: `3px solid ${p.color}` }}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.id))}
                        onClick={() => startEdit(p)}
                        title="Arraste para mudar de estágio · clique para editar"
                      >
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                        {p.businessModel && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.businessModel}</div>}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {p.pricing && <span className="project-chip">💵 {p.pricing}</span>}
                          {ms && <span className="due-badge due-future">🎯 {ms.title}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showProgress && <ProgressModal projects={active} onClose={() => setShowProgress(false)} />}
    </div>
  )
}
