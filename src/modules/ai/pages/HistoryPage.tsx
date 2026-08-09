import React, { useEffect, useMemo, useState } from 'react'
import { PromptExecution } from '../../../types'
import { useExecutionStore } from '../store/executionStore'
import { useAgentStore } from '../store/agentStore'
import { parseTags } from '../store/skillStore'
import { useUIStore } from '../../../store/uiStore'
import { DRAFT_KEY } from './PromptRunnerPage'

function skillCount(e: PromptExecution): number {
  return parseTags(e.skillIds).length
}

export function HistoryPage(): React.ReactElement {
  const { executions, refresh, save, remove } = useExecutionStore()
  const { agents, refresh: refreshAgents } = useAgentStore()
  const { setPage } = useUIStore()
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    refresh()
    refreshAgents()
  }, [])

  const agentName = (id: string | null): string => (id ? agents.find((a) => a.id === id)?.name ?? '—' : '—')

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return executions.filter((e) => !q || e.userPrompt.toLowerCase().includes(q) || e.finalPrompt.toLowerCase().includes(q))
  }, [executions, search])

  function flash(m: string): void {
    setToast(m)
    setTimeout(() => setToast(''), 1600)
  }

  function reopen(e: PromptExecution): void {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ agentId: e.agentId, skillIds: parseTags(e.skillIds), userPrompt: e.userPrompt }))
    setPage('ai-runner')
  }

  async function duplicate(e: PromptExecution): Promise<void> {
    await save(e.agentId, parseTags(e.skillIds), e.userPrompt, e.finalPrompt, e.response)
    flash('Execução duplicada ✓')
  }

  async function copyFinal(e: PromptExecution): Promise<void> {
    await navigator.clipboard.writeText(e.finalPrompt)
    flash('Prompt copiado ✓')
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🕐 Histórico</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{executions.length} execuções salvas</p>
        </div>
        {toast && <span className="badge-hot" style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)' }}>{toast}</span>}
      </div>

      <div className="todo-toolbar">
        <input type="text" placeholder="🔍 Buscar no histórico…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
      </div>

      <div className="list-stack">
        {list.length === 0 && <div className="empty-hint">Nenhuma execução salva.</div>}
        {list.map((e) => (
          <div key={e.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="due-badge due-future">{e.createdAt.slice(0, 16).replace('T', ' ')}</span>
              <span className="cat-chip">{agentName(e.agentId)}</span>
              <span className="project-chip">🧩 {skillCount(e)}</span>
              {e.response && <span className="project-chip">✓ executado</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={() => reopen(e)}>Reabrir</button>
                <button className="btn btn-secondary btn-sm" onClick={() => copyFinal(e)}>Copiar</button>
                <button className="btn btn-secondary btn-sm" onClick={() => duplicate(e)}>Duplicar</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(e.id)}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {e.userPrompt || e.finalPrompt.slice(0, 120)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
