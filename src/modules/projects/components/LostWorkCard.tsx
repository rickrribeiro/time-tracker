import React, { useEffect } from 'react'
import { useGitStore } from '../store/gitStore'
import { useUIStore } from '../../../store/uiStore'
import { STATUS_BY_ID, timeAgo } from '../git'

/**
 * Home card: branches/worktrees with work that isn't delivered (risk + forgotten).
 * Uses the server's cached scan (≤ 10 min) so the Home stays fast. Hidden when
 * there are no repos or nothing needs attention.
 */
export function LostWorkCard(): React.ReactElement | null {
  const { scan, loadSummary } = useGitStore()
  const setPage = useUIStore((s) => s.setPage)

  useEffect(() => {
    if (!scan) void loadSummary()
  }, [scan, loadSummary])

  if (!scan) return null
  const lost = scan.branches
    .filter((b) => b.status === 'risk' || b.status === 'forgotten')
    .sort((a, b) => (b.idleDays ?? 0) - (a.idleDays ?? 0))
  const orphans = scan.branches.filter((b) => b.status === 'orphan').length
  if (!lost.length && !orphans) return null
  const risk = lost.filter((b) => b.status === 'risk').length
  const forgotten = lost.length - risk

  return (
    <div className="chart-section" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="chart-title">🌿 Trabalho esquecido em branches</div>
        <button className="btn btn-secondary btn-sm" onClick={() => setPage('worktrees')}>
          Ver tudo →
        </button>
      </div>
      <div className="git-card-counts">
        {risk > 0 && (
          <span>
            {STATUS_BY_ID.risk.emoji} <b>{risk}</b> em risco
          </span>
        )}
        {forgotten > 0 && (
          <span>
            {STATUS_BY_ID.forgotten.emoji} <b>{forgotten}</b> esquecida(s)
          </span>
        )}
        {orphans > 0 && (
          <span>
            {STATUS_BY_ID.orphan.emoji} <b>{orphans}</b> órfã(s)
          </span>
        )}
      </div>
      <div className="git-card-list">
        {lost.slice(0, 4).map((b) => (
          <div key={b.id} style={{ display: 'flex', gap: 8, minWidth: 0 }}>
            <span>{STATUS_BY_ID[b.status].emoji}</span>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.repoName}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{b.branch ?? '(HEAD destacado)'}</span>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.lastCommitAt ? `há ${timeAgo(b.lastCommitAt)}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
