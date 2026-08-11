import React, { useEffect, useRef, useState } from 'react'
import { Project } from '../../../types'
import { renderMarkdown } from '../../estudos/markdown'
import { repoFromUrl } from '../store/githubStore'

type Period = 'week' | 'month' | 'lastMonth'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' }
]

/** Uses the local Claude + gh to summarize commit/issue progress over a period. */
export function ProgressModal({ projects, onClose }: { projects: Project[]; onClose: () => void }): React.ReactElement {
  const [period, setPeriod] = useState<Period>('week')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const runId = useRef<string | null>(null)

  useEffect(() => {
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runId.current) setOutput((o) => o + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output: out, error: err }) => {
      if (rid !== runId.current) return
      runId.current = null
      setRunning(false)
      if (!ok) return setError(err || 'Falha ao gerar o resumo.')
      setOutput(out)
    })
    return () => {
      offChunk()
      offDone()
    }
  }, [])

  const repos = projects.map((p) => repoFromUrl(p.githubRepoUrl)).filter((r): r is string => !!r)

  async function run(): Promise<void> {
    setError('')
    setOutput('')
    if (repos.length === 0) {
      setError('Nenhum projeto com repositório GitHub configurado.')
      return
    }
    setRunning(true)
    const model = (await window.api.settings.get('claude_model')) ?? ''
    const periodDesc =
      period === 'week' ? 'os últimos 7 dias' : period === 'month' ? 'o mês atual' : 'o mês passado'
    const prompt = `Você é meu assistente de engenharia. Gere um RESUMO DE PROGRESSO em Markdown cobrindo ${periodDesc}, com base nos meus commits, PRs e issues.

Use a ferramenta gh (GitHub CLI) para coletar os dados destes repositórios: ${repos.join(', ')}.
Sugestões de comandos: \`gh search commits --author=@me --repo=<repo> --created=<intervalo>\`, \`gh pr list\`, \`gh issue list --repo=<repo> --state=all\`. Descubra o intervalo de datas de ${periodDesc}.

Estruture o resumo em Markdown:
1. **Visão geral** (2-3 linhas: ritmo e destaques).
2. **Por repositório**: principais commits/PRs e issues abertas/fechadas.
3. **O que ficou pendente** e uma sugestão de foco.
Seja factual — use apenas o que o gh retornar. Se um repositório não existir ou o gh falhar, apenas mencione e siga.`
    try {
      runId.current = await window.api.ai.start({ prompt, model, save: false })
    } catch (e) {
      setRunning(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 520, maxWidth: 720 }}>
        <h2>📊 Resumo de progresso (GitHub)</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          {PERIODS.map((p) => (
            <button key={p.key} className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriod(p.key)} disabled={running}>
              {p.label}
            </button>
          ))}
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={run} disabled={running}>
            {running ? 'Analisando…' : '✨ Gerar'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          Repos: {repos.join(', ') || '—'}. Usa o gh CLI da sua máquina via Claude local.
        </p>
        {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
        {(running || output) && (
          <div className="md-preview-pane" style={{ minHeight: 0, maxHeight: 420 }}>
            {output ? renderMarkdown(output) : <div className="empty-hint">Coletando dados do GitHub…</div>}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
