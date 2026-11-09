import React, { useState } from 'react'
import { ProjectSuggestion, ProjectSuggestionsResult } from '../../../types'
import '../suggestions.css'

const COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4']

/** Cor estável por nome, para cada projeto criado nascer com uma cor diferente. */
function colorFor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(days / 365)
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`
}

interface Props {
  data: ProjectSuggestionsResult | null
  loading: boolean
  onReload: () => Promise<void>
  /** Cria o projeto (e recarrega a lista de projetos). */
  onCreate: (s: ProjectSuggestion) => Promise<void>
  onClose: () => void
}

/** Lista de pastas da pasta de projetos do computador que ainda não viraram projeto. */
export function ProjectSuggestions({ data, loading, onReload, onCreate, onClose }: Props): React.ReactElement {
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy((b) => ({ ...b, [key]: true }))
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy((b) => ({ ...b, [key]: false }))
    }
  }

  const changeRoot = async (): Promise<void> => {
    const next = window.prompt('Pasta onde ficam seus projetos (no computador que roda o rickOS):', data?.root ?? '~/Projects')
    if (next == null) return
    await window.api.settings.set('projects_root', next.trim())
    await onReload()
  }

  const items = data?.items ?? []

  return (
    <div className="chart-section psug">
      <div className="psug-head">
        <div style={{ minWidth: 0 }}>
          <div className="chart-title">💡 Projetos sugeridos</div>
          <div className="psug-sub">
            Pastas em <code>{data?.root ?? '~/Projects'}</code> que ainda não são projetos ·{' '}
            <button className="psug-link" onClick={() => void changeRoot()}>alterar pasta</button>
          </div>
        </div>
        <div className="psug-head-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => void onReload()} disabled={loading} title="Ler a pasta de novo">
            {loading ? '…' : '↻'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose} title="Fechar">✕</button>
        </div>
      </div>

      {error && <div className="psug-error">{error}</div>}

      {data && !data.rootExists && (
        <div className="empty-hint">A pasta {data.root} não existe neste computador. Use “alterar pasta”.</div>
      )}
      {data?.rootExists && !items.length && !loading && (
        <div className="empty-hint">🎉 Todas as pastas já estão cadastradas como projetos.</div>
      )}
      {!data && loading && <div className="empty-hint">Lendo a pasta…</div>}

      <div className="psug-list">
        {items.map((s) => (
          <div key={s.path} className="psug-item">
            <span className="psug-swatch" style={{ background: colorFor(s.name) }} />
            <div className="psug-body">
              <div className="psug-title">
                <strong>{s.name}</strong>
                {s.group && <span className="project-chip">{s.group}</span>}
                {s.tags.map((t) => (
                  <span key={t} className="psug-tag">{t}</span>
                ))}
              </div>
              {s.description && <div className="psug-desc">{s.description}</div>}
              <div className="psug-meta">
                <code>{s.displayPath}</code>
                {s.lastActivity && <span> · mexido {timeAgo(s.lastActivity)}</span>}
                {s.githubRepoUrl && <span> · {s.githubRepoUrl.replace(/^https?:\/\/(www\.)?/, '')}</span>}
              </div>
            </div>
            <div className="psug-actions">
              <button
                className="btn btn-primary btn-sm"
                disabled={!!busy[s.path]}
                onClick={() => void run(s.path, () => onCreate(s))}
                title="Criar o projeto com nome, descrição, repo e caminho local preenchidos"
              >
                {busy[s.path] ? '…' : '+ Criar'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={!!busy[s.path]}
                onClick={() =>
                  void run(s.path, async () => {
                    await window.api.projects.ignoreSuggestion(s.path)
                    await onReload()
                  })
                }
                title="Não sugerir mais esta pasta"
              >
                Ignorar
              </button>
            </div>
          </div>
        ))}
      </div>

      {!!data?.ignoredCount && (
        <div className="psug-foot">
          {data.ignoredCount} pasta(s) ignorada(s) ·{' '}
          <button
            className="psug-link"
            onClick={() =>
              void run('restore', async () => {
                await window.api.projects.restoreSuggestions()
                await onReload()
              })
            }
          >
            mostrar de novo
          </button>
        </div>
      )}
    </div>
  )
}

export { colorFor as suggestionColor }
