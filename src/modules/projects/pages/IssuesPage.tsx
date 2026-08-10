import React, { useEffect, useState } from 'react'
import { GithubIssue } from '../../../types'
import { useGithubStore, columnFor, parseLabels, repoFromUrl, BoardColumn } from '../store/githubStore'
import { useProjectStore } from '../store/projectStore'

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'in-progress', label: 'Em andamento' },
  { key: 'blocked', label: 'Bloqueado' },
  { key: 'done', label: 'Concluído' }
]

type DoneFilter = 'today' | 'week' | 'month' | 'thisMonth' | 'lastMonth' | 'all'

const DONE_FILTERS: { key: DoneFilter; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: 'week', label: '1 semana' },
  { key: 'month', label: '1 mês' },
  { key: 'thisMonth', label: 'Esse mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'all', label: 'Total' }
]

/** Whether a done issue's updatedAt falls within the selected window (proxy for "when done"). */
function doneWithin(iso: string | null, f: DoneFilter): boolean {
  if (f === 'all') return true
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  switch (f) {
    case 'today': {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      return d >= start
    }
    case 'week':
      return d >= new Date(now.getTime() - 7 * 86400000)
    case 'month':
      return d >= new Date(now.getTime() - 30 * 86400000)
    case 'thisMonth':
      return d >= new Date(now.getFullYear(), now.getMonth(), 1)
    case 'lastMonth':
      return d >= new Date(now.getFullYear(), now.getMonth() - 1, 1) && d < new Date(now.getFullYear(), now.getMonth(), 1)
    default:
      return true
  }
}

interface CardProps {
  issue: GithubIssue
  pushing: boolean
  onPush: (id: number) => void
  onDelete: (id: number) => void
}

function IssueCard({ issue, pushing, onPush, onDelete }: CardProps): React.ReactElement {
  const labels = parseLabels(issue)
  const onGithub = !!issue.url
  return (
    <div className="kanban-card">
      <div className="kanban-card-repo">
        {issue.repo}
        <span className={`issue-origin ${onGithub ? 'gh' : 'local'}`}>{onGithub ? '● GitHub' : '○ Local'}</span>
      </div>
      <button
        className="kanban-card-title"
        onClick={() => issue.url && window.api.app.openExternal(issue.url)}
        title={onGithub ? 'Abrir no GitHub' : 'Issue local (ainda não está no GitHub)'}
        style={{ cursor: onGithub ? 'pointer' : 'default' }}
      >
        {onGithub ? `#${issue.number} ` : ''}
        {issue.title}
      </button>
      {issue.body && <div className="kanban-card-body">{issue.body}</div>}
      {labels.length > 0 && (
        <div className="kanban-card-labels">
          {labels.map((l) => (
            <span key={l} className="project-chip">
              {l}
            </span>
          ))}
        </div>
      )}
      {!onGithub && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => onPush(issue.id)} disabled={pushing}>
            {pushing ? 'Criando…' : '🐙 Criar no GitHub'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(issue.id)} disabled={pushing}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function fmtSyncTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function IssuesPage(): React.ReactElement {
  const { issues, refresh, sync, syncing, error, lastCount, lastSyncAt, createLocal, removeIssue, pushToGithub } =
    useGithubStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [doneFilter, setDoneFilter] = useState<DoneFilter>('week')

  // Add-issue form
  const [showForm, setShowForm] = useState(false)
  const [repo, setRepo] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const [pushingId, setPushingId] = useState<number | null>(null)
  const [pushError, setPushError] = useState('')

  useEffect(() => {
    refresh()
    refreshProjects()
  }, [])

  const linkable = projects
    .filter((p) => p.archived !== 1)
    .map((p) => ({ p, repo: repoFromUrl(p.githubRepoUrl) }))
    .filter((x): x is { p: typeof x.p; repo: string } => !!x.repo)

  function toggleProject(id: number): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // repos of the selected projects (empty selection = show all)
  const selectedRepos = new Set(
    linkable.filter((x) => selectedIds.has(x.p.id)).map((x) => x.repo.toLowerCase())
  )
  const visible =
    selectedIds.size === 0 ? issues : issues.filter((i) => selectedRepos.has(i.repo.toLowerCase()))

  const grouped: Record<BoardColumn, GithubIssue[]> = { backlog: [], 'in-progress': [], blocked: [], done: [] }
  for (const i of visible) {
    const col = columnFor(i)
    // the time filter applies only to the Done column (by updatedAt ≈ when it was closed)
    if (col === 'done' && !doneWithin(i.updatedAt, doneFilter)) continue
    grouped[col].push(i)
  }

  async function handleAdd(): Promise<void> {
    if (!repo.trim() || !title.trim()) return
    await createLocal(repo.trim(), title.trim(), body.trim() || null)
    setTitle('')
    setBody('')
    setShowForm(false)
  }

  async function handlePush(id: number): Promise<void> {
    setPushingId(id)
    setPushError('')
    try {
      await pushToGithub(id)
    } catch (e) {
      setPushError(e instanceof Error ? e.message : String(e))
    } finally {
      setPushingId(null)
    }
  }

  const localCount = issues.filter((i) => !i.url).length

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📌 Issues (Kanban)</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Issues do GitHub + issues locais ({localCount} local{localCount === 1 ? '' : 'is'}). Crie
            local e depois envie ao GitHub via Claude Code.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={doneFilter} onChange={(e) => setDoneFilter(e.target.value as DoneFilter)} title="Período das concluídas">
            {DONE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>Concluídas: {f.label}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Fechar' : '+ Nova issue'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={sync} disabled={syncing}>
            {syncing ? 'Sincronizando…' : '🔄 Sincronizar'}
          </button>
        </div>
      </div>

      {linkable.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>Projetos:</span>
          <button
            className={`btn btn-sm ${selectedIds.size === 0 ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedIds(new Set())}
          >
            Todos
          </button>
          {linkable.map((x) => (
            <button
              key={x.p.id}
              className={`btn btn-sm ${selectedIds.has(x.p.id) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleProject(x.p.id)}
              title={x.repo}
            >
              {x.p.name}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="chart-section" style={{ marginBottom: 12, maxWidth: 620 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              list="repos-datalist"
              placeholder="Repositório (owner/name) *"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
            <datalist id="repos-datalist">
              {linkable.map((x) => (
                <option key={x.p.id} value={x.repo} />
              ))}
            </datalist>
            <input placeholder="Título *" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea placeholder="Descrição (opcional)" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd}>Adicionar local</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="empty-hint" style={{ color: 'var(--danger)' }}>{error}</div>}
      {pushError && <div className="empty-hint" style={{ color: 'var(--danger)' }}>{pushError}</div>}

      {issues.length === 0 && !error && (
        <div className="empty-hint">
          Nenhuma issue. Sincronize com o GitHub (token em <strong>Configurações</strong>) ou crie uma
          issue local com <strong>+ Nova issue</strong>.
        </div>
      )}

      {issues.length > 0 && visible.length === 0 && (
        <div className="empty-hint">Nenhuma issue para o projeto selecionado.</div>
      )}

      {visible.length > 0 && (
        <div className="kanban-board">
          {COLUMNS.map((col) => (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-header">
                {col.label} <span className="kanban-count">{grouped[col.key].length}</span>
              </div>
              <div className="kanban-column-body">
                {grouped[col.key].map((i) => (
                  <IssueCard
                    key={i.id}
                    issue={i}
                    pushing={pushingId === i.id}
                    onPush={handlePush}
                    onDelete={removeIssue}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(lastCount !== null || lastSyncAt) && !error && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Última sincronização{lastSyncAt ? `: ${fmtSyncTime(lastSyncAt)}` : ''}
          {lastCount !== null ? ` · ${lastCount} issues` : ''}
        </p>
      )}
    </div>
  )
}
