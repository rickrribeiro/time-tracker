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

function IssueCard({ issue }: { issue: GithubIssue }): React.ReactElement {
  const labels = parseLabels(issue)
  return (
    <div className="kanban-card">
      <div className="kanban-card-repo">{issue.repo}</div>
      <button
        className="kanban-card-title"
        onClick={() => issue.url && window.api.app.openExternal(issue.url)}
        title="Abrir no GitHub"
      >
        #{issue.number} {issue.title}
      </button>
      {labels.length > 0 && (
        <div className="kanban-card-labels">
          {labels.map((l) => (
            <span key={l} className="project-chip">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function IssuesPage(): React.ReactElement {
  const { issues, refresh, sync, syncing, error, lastCount } = useGithubStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all')

  useEffect(() => {
    refresh()
    refreshProjects()
  }, [])

  // Projects that carry a resolvable GitHub repo can filter the board.
  const linkable = projects
    .map((p) => ({ p, repo: repoFromUrl(p.githubRepoUrl) }))
    .filter((x) => x.repo)
  const selectedRepo =
    projectFilter === 'all' ? null : linkable.find((x) => x.p.id === projectFilter)?.repo ?? null
  const visible = selectedRepo
    ? issues.filter((i) => i.repo.toLowerCase() === selectedRepo.toLowerCase())
    : issues

  const grouped: Record<BoardColumn, GithubIssue[]> = {
    backlog: [],
    'in-progress': [],
    blocked: [],
    done: []
  }
  for (const i of visible) grouped[columnFor(i)].push(i)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📌 Issues (Kanban)</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Issues atribuídas a você no GitHub (somente leitura).
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {linkable.length > 0 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">Todos os projetos</option>
              {linkable.map((x) => (
                <option key={x.p.id} value={x.p.id}>
                  {x.p.name} ({x.repo})
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-primary btn-sm" onClick={sync} disabled={syncing}>
            {syncing ? 'Sincronizando…' : '🔄 Sincronizar'}
          </button>
        </div>
      </div>

      {error && <div className="empty-hint" style={{ color: 'var(--danger)' }}>{error}</div>}

      {issues.length === 0 && !error && (
        <div className="empty-hint">
          Nenhuma issue. Configure o token do GitHub em <strong>Configurações</strong> e clique em
          Sincronizar.
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
                  <IssueCard key={i.id} issue={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {lastCount !== null && !error && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Última sincronização: {lastCount} issues.
        </p>
      )}
    </div>
  )
}
