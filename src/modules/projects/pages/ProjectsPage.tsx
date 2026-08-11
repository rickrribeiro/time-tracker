import React, { useEffect, useState } from 'react'
import { Project } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { ProgressModal } from '../components/ProgressModal'

const PRESET_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4']

interface FormState {
  name: string
  description: string
  githubRepoUrl: string
  color: string
  claudeCommand: string
  localPath: string
}

const emptyForm: FormState = { name: '', description: '', githubRepoUrl: '', color: '#6366f1', claudeCommand: '', localPath: '' }

export function ProjectsPage(): React.ReactElement {
  const { projects, refresh, create, update, remove } = useProjectStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showProgress, setShowProgress] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

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
      localPath: p.localPath ?? ''
    })
    setShowForm(true)
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
        localPath: form.localPath.trim() || null
      })
    } else {
      await create(
        form.name.trim(),
        form.description.trim() || null,
        form.githubRepoUrl.trim() || null,
        form.color,
        form.claudeCommand.trim() || null,
        form.localPath.trim() || null
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
        <div style={{ display: 'flex', gap: 8 }}>
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

      {showProgress && <ProgressModal projects={active} onClose={() => setShowProgress(false)} />}
    </div>
  )
}
