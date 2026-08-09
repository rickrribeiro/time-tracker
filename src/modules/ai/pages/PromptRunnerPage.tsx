import React, { useEffect, useMemo, useState } from 'react'
import { useSkillStore, parseTags } from '../store/skillStore'
import { useAgentStore } from '../store/agentStore'
import { useExecutionStore } from '../store/executionStore'
import { composePrompt } from '../compose'

export const DRAFT_KEY = 'rickos:promptRunnerDraft'

interface Draft {
  agentId: string | null
  skillIds: string[]
  userPrompt: string
}

function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')
    return { agentId: d.agentId ?? null, skillIds: Array.isArray(d.skillIds) ? d.skillIds : [], userPrompt: d.userPrompt ?? '' }
  } catch {
    return { agentId: null, skillIds: [], userPrompt: '' }
  }
}

export function PromptRunnerPage(): React.ReactElement {
  const { skills, refresh: refreshSkills } = useSkillStore()
  const { agents, refresh: refreshAgents } = useAgentStore()
  const { save } = useExecutionStore()

  const initial = loadDraft()
  const [agentId, setAgentId] = useState<string | null>(initial.agentId)
  const [skillIds, setSkillIds] = useState<string[]>(initial.skillIds)
  const [userPrompt, setUserPrompt] = useState(initial.userPrompt)
  const [search, setSearch] = useState('')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [toast, setToast] = useState('')
  const [model, setModel] = useState('')

  useEffect(() => {
    refreshSkills()
    refreshAgents()
    window.api.settings.get('claude_model').then((m) => setModel(m ?? ''))
    const off = window.api.ai.onChunk((t) => setOutput((o) => o + t))
    return off
  }, [])

  // autosave draft
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ agentId, skillIds, userPrompt }))
  }, [agentId, skillIds, userPrompt])

  const agent = agents.find((a) => a.id === agentId) ?? null
  const selectedSkills = useMemo(
    () => skillIds.map((id) => skills.find((s) => s.id === id)).filter(Boolean) as typeof skills,
    [skillIds, skills]
  )
  const finalPrompt = useMemo(
    () => composePrompt(agent ? { systemPrompt: agent.systemPrompt } : null, selectedSkills.map((s) => ({ name: s.name, content: s.content })), userPrompt),
    [agent, selectedSkills, userPrompt]
  )

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase()
    return skills.filter((s) => !q || s.name.toLowerCase().includes(q) || parseTags(s.tags).some((t) => t.includes(q)))
  }, [skills, search])

  function flash(msg: string): void {
    setToast(msg)
    setTimeout(() => setToast(''), 1800)
  }

  function toggleSkill(id: string): void {
    setSkillIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  function applyAgent(id: string): void {
    setAgentId(id || null)
    const a = agents.find((x) => x.id === id)
    if (a) setSkillIds(parseTags(a.defaultSkillIds))
  }

  async function copyFinal(): Promise<void> {
    if (!finalPrompt.trim()) return
    await navigator.clipboard.writeText(finalPrompt)
    flash('Prompt copiado ✓')
  }

  async function saveExecution(response: string | null): Promise<void> {
    await save(agentId, skillIds, userPrompt, finalPrompt, response)
    flash('Execução salva ✓')
  }

  async function runHere(): Promise<void> {
    if (!finalPrompt.trim() || running) return
    setRunning(true)
    setOutput('')
    try {
      const result = await window.api.ai.runStream(finalPrompt, undefined, model)
      setOutput(result)
      await save(agentId, skillIds, userPrompt, finalPrompt, result)
      flash('Executado e salvo ✓')
    } catch (e) {
      setOutput(e instanceof Error ? e.message : String(e))
      flash('Erro ao executar')
    } finally {
      setRunning(false)
    }
  }

  // keyboard shortcuts: Ctrl/Cmd+Enter = gerar/copiar preview, Ctrl/Cmd+Shift+C = copiar
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        flash('Prompt final atualizado ✓')
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault()
        copyFinal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalPrompt])

  const favSkillIds = skills.filter((s) => s.isFavorite).map((s) => s.id)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>▶️ Prompt Runner</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Monte o prompt (agente + skills + seu texto), copie ou execute no Claude local. Ctrl+Enter atualiza · Ctrl+Shift+C copia.
          </p>
        </div>
        {toast && <span className="badge-hot" style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)' }}>{toast}</span>}
      </div>

      <div className="runner-grid">
        {/* Left: selectors */}
        <div className="runner-col">
          <div className="editor-field">
            <label>Agente</label>
            <select value={agentId ?? ''} onChange={(e) => applyAgent(e.target.value)}>
              <option value="">Nenhum</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <input type="text" placeholder="🔍 Buscar skills…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ margin: '8px 0' }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSkillIds(favSkillIds)}>★ Favoritas</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSkillIds([])}>Limpar</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>{skillIds.length} sel.</span>
          </div>
          <div className="skill-checklist" style={{ flex: 1, minHeight: 200 }}>
            {filteredSkills.map((s) => (
              <label key={s.id} className="skill-check-row">
                <input type="checkbox" checked={skillIds.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                <span>{s.isFavorite ? '★ ' : ''}{s.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Right: prompt + preview */}
        <div className="runner-col">
          <div className="editor-field">
            <label>Seu prompt</label>
            <textarea rows={5} value={userPrompt} onChange={(e) => setUserPrompt(e.target.value)} style={{ resize: 'vertical' }} placeholder="Descreva a tarefa…" />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={copyFinal} disabled={!finalPrompt.trim()}>📋 Copiar</button>
            <button className="btn btn-secondary btn-sm" onClick={() => saveExecution(null)} disabled={!finalPrompt.trim()}>💾 Salvar</button>
            <button className="btn btn-primary btn-sm" onClick={runHere} disabled={!finalPrompt.trim() || running}>{running ? 'Executando…' : '▶️ Executar aqui'}</button>
          </div>
          <div className="editor-field">
            <label>Prompt final <span style={{ color: 'var(--text-muted)' }}>({finalPrompt.length} chars)</span></label>
            <pre className="ai-output" style={{ minHeight: 120, maxHeight: 220 }}>{finalPrompt || '(vazio)'}</pre>
          </div>
          {output && (
            <div className="editor-field">
              <label>Resposta (Claude local)</label>
              <pre className="ai-output" style={{ maxHeight: 260 }}>{output}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
