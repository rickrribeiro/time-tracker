import React, { useEffect, useState } from 'react'
import type { DelegationReview, Project, ProjectDelegation } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { renderMarkdown } from '../../estudos/markdown'
import { timeAgo } from '../../../utils/dates'
import { copyText, shortPath } from '../git'

export const DELEGATION_STATUS: Record<ProjectDelegation['status'], { label: string; cls: string }> = {
  rodando: { label: '⏳ rodando', cls: 'run' },
  pronta: { label: '👀 pronta p/ revisão', cls: 'ready' },
  erro: { label: '⚠️ erro', cls: 'err' },
  cancelada: { label: '✕ cancelada', cls: 'off' },
  aceita: { label: '✅ aceita', cls: 'ok' },
  descartada: { label: '🗑 descartada', cls: 'off' }
}

/** Confirma a delegação da próxima ação (com instruções opcionais). */
export function DelegateModal({ project, onClose }: { project: Project; onClose: () => void }): React.ReactElement {
  const { refreshDelegations } = useProjectStore()
  const [action, setAction] = useState(project.nextAction ?? '')
  const [instructions, setInstructions] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function go(): Promise<void> {
    setBusy(true)
    setError('')
    try {
      await window.api.delegations.start(project.id, action.trim() || null, instructions.trim() || null)
      await refreshDelegations()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>🤖 Delegar ao Claude — {project.name}</h2>
        <p className="ph-muted">
          O Claude executa a tarefa num <strong>worktree isolado</strong> (branch <code>claude/rickos-…</code>, ao lado de {shortPath(project.localPath)}), com
          commits locais e sem push. Quando terminar, você revisa: diff, PR ou descartar.
        </p>
        <label className="ph-label">Tarefa</label>
        <textarea rows={2} value={action} onChange={(e) => setAction(e.target.value)} />
        <label className="ph-label">Instruções extras (opcional)</label>
        <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Ex: use o componente X, não mude a API pública, escreva testes…" />
        {error && <div className="ph-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={go} disabled={busy || !action.trim()}>
            {busy ? 'Criando worktree…' : '🤖 Delegar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Lista de delegações do projeto, com revisão (resumo, commits, diff) e ações. */
export function DelegationsPanel({ project, onAccepted }: { project: Project; onAccepted: (d: ProjectDelegation) => void }): React.ReactElement | null {
  const { delegations, refreshDelegations } = useProjectStore()
  const list = delegations.filter((d) => d.projectId === project.id && d.status !== 'descartada')
  const [open, setOpen] = useState<number | null>(null)
  const [review, setReview] = useState<DelegationReview | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open == null) return
    setReview(null)
    window.api.delegations.review(open).then(setReview).catch(() => setReview(null))
  }, [open, delegations])

  if (!list.length) return null

  async function act(d: ProjectDelegation, kind: 'cancel' | 'discard' | 'accept' | 'pr'): Promise<void> {
    if (kind === 'discard' && !window.confirm('Remover o worktree e apagar a branch desta delegação?')) return
    setBusy(`${kind}${d.id}`)
    setError('')
    try {
      if (kind === 'cancel') await window.api.delegations.cancel(d.id)
      if (kind === 'discard') await window.api.delegations.discard(d.id)
      if (kind === 'accept') {
        await window.api.delegations.accept(d.id)
        onAccepted(d)
      }
      if (kind === 'pr') {
        const r = await window.api.delegations.pr(d.id)
        if (r.url) window.api.app.openExternal(r.url)
      }
      await refreshDelegations()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="ph-panel">
      <div className="ph-panel-title">🤖 Delegações</div>
      {error && <div className="ph-error">{error}</div>}
      {list.map((d) => {
        const st = DELEGATION_STATUS[d.status]
        const isOpen = open === d.id
        return (
          <div key={d.id} className="ph-deleg">
            <button className="ph-deleg-head" onClick={() => setOpen(isOpen ? null : d.id)}>
              <span className={`ph-deleg-status ${st.cls}`}>{st.label}</span>
              <span className="ph-deleg-action">{d.action}</span>
              <span className="ph-muted">{timeAgo(d.finishedAt ?? d.createdAt)}</span>
            </button>
            {isOpen && (
              <div className="ph-deleg-body">
                <div className="ph-muted">
                  <code>{d.branch}</code> · {shortPath(d.worktreePath)}
                  {d.prUrl && (
                    <>
                      {' · '}
                      <button className="ph-linkbtn" onClick={() => window.api.app.openExternal(d.prUrl!)}>PR ↗</button>
                    </>
                  )}
                </div>
                {d.error && <div className="ph-error">{d.error}</div>}
                {review && (
                  <>
                    {review.commits.length > 0 && (
                      <div className="ph-commits">
                        {review.commits.map((c) => (
                          <div key={c.hash} className="ph-commit"><code>{c.hash}</code><span className="ph-commit-subject">{c.subject}</span></div>
                        ))}
                      </div>
                    )}
                    {review.diffStat && <pre className="ph-diffstat">{review.diffStat}</pre>}
                    {review.uncommitted.length > 0 && <div className="ph-warn">{review.uncommitted.length} arquivo(s) sem commit no worktree.</div>}
                    {!review.commits.length && !review.uncommitted.length && d.status !== 'rodando' && <div className="ph-muted">Nenhuma mudança no código.</div>}
                  </>
                )}
                {d.status === 'rodando' && <div className="ph-muted">O Claude está trabalhando… você será notificado ao terminar.</div>}
                {d.output && <div className="md-preview-pane ph-deleg-out">{renderMarkdown(d.output)}</div>}
                <div className="ph-btnrow">
                  {d.status === 'rodando' ? (
                    <button className="btn btn-secondary btn-sm" onClick={() => act(d, 'cancel')} disabled={!!busy}>■ Cancelar</button>
                  ) : (
                    <>
                      {review?.worktreeExists && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => window.api.git.openPath(d.worktreePath, 'vscode')}>VS Code</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => copyText(`cd ${JSON.stringify(d.worktreePath)} && claude`)} title="Copia o comando para continuar a conversa no worktree">⧉ Continuar</button>
                        </>
                      )}
                      {!d.prUrl && !!review?.commits.length && (
                        <button className="btn btn-secondary btn-sm" onClick={() => act(d, 'pr')} disabled={!!busy}>{busy === `pr${d.id}` ? 'Abrindo…' : '🔀 Criar PR'}</button>
                      )}
                      {d.status !== 'aceita' && <button className="btn btn-primary btn-sm" onClick={() => act(d, 'accept')} disabled={!!busy}>✓ Aceitar</button>}
                      <button className="btn btn-danger btn-sm" onClick={() => act(d, 'discard')} disabled={!!busy}>Descartar</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
