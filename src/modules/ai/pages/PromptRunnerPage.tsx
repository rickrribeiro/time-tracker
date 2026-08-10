import React, { useEffect, useMemo, useState } from 'react'
import { useSkillStore, parseTags } from '../store/skillStore'
import { useAgentStore } from '../store/agentStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { useExecutionStore } from '../store/executionStore'
import { composePrompt } from '../compose'

// Legacy single-draft key (History "reabrir" writes here); merged into a tab on load.
export const DRAFT_KEY = 'rickos:promptRunnerDraft'
const TABS_KEY = 'rickos:promptRunnerTabs'

interface RunnerTab {
  id: string
  title: string
  agentId: string | null
  projectId: number | null
  skillIds: string[]
  userPrompt: string
  // transient (not persisted)
  output: string
  running: boolean
  runId: string | null
  error: string
}

function makeTab(p: Partial<RunnerTab> = {}): RunnerTab {
  return {
    id: crypto.randomUUID(),
    title: '',
    agentId: null,
    projectId: null,
    skillIds: [],
    userPrompt: '',
    output: '',
    running: false,
    runId: null,
    error: '',
    ...p
  }
}

function loadTabs(): RunnerTab[] {
  let tabs: RunnerTab[] = []
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY) || '[]')
    if (Array.isArray(raw)) {
      tabs = raw.map((t) =>
        makeTab({
          id: typeof t.id === 'string' ? t.id : undefined,
          title: t.title ?? '',
          agentId: t.agentId ?? null,
          projectId: t.projectId ?? null,
          skillIds: Array.isArray(t.skillIds) ? t.skillIds : [],
          userPrompt: t.userPrompt ?? '',
          runId: typeof t.runId === 'string' ? t.runId : null
        })
      )
    }
  } catch {
    // ignore
  }
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (d) {
      tabs = [makeTab({ agentId: d.agentId ?? null, skillIds: Array.isArray(d.skillIds) ? d.skillIds : [], userPrompt: d.userPrompt ?? '' }), ...tabs]
      localStorage.removeItem(DRAFT_KEY)
    }
  } catch {
    // ignore
  }
  return tabs.length ? tabs : [makeTab()]
}

export function PromptRunnerPage(): React.ReactElement {
  const { skills, refresh: refreshSkills } = useSkillStore()
  const { agents, refresh: refreshAgents } = useAgentStore()
  const { projects, refresh: refreshProjects } = useProjectStore()
  const { save } = useExecutionStore()

  const [tabs, setTabs] = useState<RunnerTab[]>(loadTabs)
  const [activeId, setActiveId] = useState<string>(tabs[0].id)
  const [search, setSearch] = useState('')
  const [model, setModel] = useState('')
  const [toast, setToast] = useState('')
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState('')

  function commitTitle(id: string): void {
    patchTab(id, { title: titleDraft.trim() })
    setEditingTabId(null)
  }

  useEffect(() => {
    refreshSkills()
    refreshAgents()
    refreshProjects()
    window.api.settings.get('claude_model').then((m) => setModel(m ?? ''))

    // reconnect to any runs still owned by the main process (survives navigation)
    setTabs((prev) =>
      prev.map((t) => {
        if (!t.runId) return t
        const rid = t.runId
        window.api.ai.getRun(rid).then((r) => {
          setTabs((cur) =>
            cur.map((x) => {
              if (x.id !== t.id || x.runId !== rid) return x
              if (!r) return { ...x, runId: null, running: false }
              if (r.status === 'running') return { ...x, running: true, output: r.output }
              return { ...x, running: false, runId: null, output: r.output, error: r.error ?? '' }
            })
          )
        })
        return { ...t, running: true, output: '' } // optimistic until getRun resolves
      })
    )

    const offChunk = window.api.ai.onChunk((runId, text) => {
      if (!runId) return
      setTabs((prev) => prev.map((t) => (t.runId === runId ? { ...t, output: t.output + text } : t)))
    })
    const offDone = window.api.ai.onDone(({ runId, ok, output, error }) => {
      setTabs((prev) => prev.map((t) => (t.runId === runId ? { ...t, running: false, runId: null, output, error: ok ? '' : error ?? '' } : t)))
    })
    return () => {
      offChunk()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // persist tab config + runId (so an in-progress run can be reconnected after navigation)
  useEffect(() => {
    const slim = tabs.map((t) => ({ id: t.id, title: t.title, agentId: t.agentId, projectId: t.projectId, skillIds: t.skillIds, userPrompt: t.userPrompt, runId: t.runId }))
    localStorage.setItem(TABS_KEY, JSON.stringify(slim))
  }, [tabs])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]
  const patchTab = (id: string, patch: Partial<RunnerTab>): void =>
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const patchActive = (patch: Partial<RunnerTab>): void => patchTab(active.id, patch)

  function composeFor(t: RunnerTab): string {
    const ag = agents.find((a) => a.id === t.agentId) ?? null
    const sk = t.skillIds.map((id) => skills.find((s) => s.id === id)).filter(Boolean) as typeof skills
    return composePrompt(ag ? { systemPrompt: ag.systemPrompt } : null, sk.map((s) => ({ name: s.name, content: s.content })), t.userPrompt)
  }

  const finalPrompt = composeFor(active)

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase()
    return skills.filter((s) => !q || s.name.toLowerCase().includes(q) || parseTags(s.tags).some((t) => t.includes(q)))
  }, [skills, search])

  function flash(m: string): void {
    setToast(m)
    setTimeout(() => setToast(''), 1800)
  }

  function addTab(): void {
    const t = makeTab()
    setTabs((prev) => [...prev, t])
    setActiveId(t.id)
  }
  function closeTab(id: string): void {
    setTabs((prev) => {
      const t = prev.find((x) => x.id === id)
      if (t?.runId) window.api.ai.cancel(t.runId)
      const next = prev.filter((x) => x.id !== id)
      const finalTabs = next.length ? next : [makeTab()]
      if (id === activeId) setActiveId(finalTabs[0].id)
      return finalTabs
    })
  }

  function applyAgent(tabId: string, agentId: string): void {
    const a = agents.find((x) => x.id === agentId)
    patchTab(tabId, { agentId: agentId || null, ...(a ? { skillIds: parseTags(a.defaultSkillIds) } : {}) })
  }
  function toggleSkill(tabId: string, skillId: string): void {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId ? { ...t, skillIds: t.skillIds.includes(skillId) ? t.skillIds.filter((x) => x !== skillId) : [...t.skillIds, skillId] } : t
      )
    )
  }

  async function copyFinal(): Promise<void> {
    if (!finalPrompt.trim()) return
    await navigator.clipboard.writeText(finalPrompt)
    flash('Prompt copiado ✓')
  }

  async function run(tab: RunnerTab): Promise<void> {
    const fp = composeFor(tab)
    if (!fp.trim() || tab.running) return
    // main owns the run (keeps going in background, saves on completion); we get a runId
    // and finish via the ai:done event — reconnected on remount via getRun.
    const runId = await window.api.ai.start({
      prompt: fp,
      projectId: tab.projectId ?? undefined,
      model,
      agentId: tab.agentId,
      skillIds: JSON.stringify(tab.skillIds),
      userPrompt: tab.userPrompt
    })
    patchTab(tab.id, { running: true, runId, output: '', error: '' })
  }

  async function cancel(tab: RunnerTab): Promise<void> {
    if (!tab.runId) return
    await window.api.ai.cancel(tab.runId)
    // ai:done fires with the cancelled state and finalizes the tab
  }

  function tabTitle(t: RunnerTab, i: number): string {
    if (t.title.trim()) return t.title.trim()
    const base = t.userPrompt.trim().split('\n')[0].slice(0, 16)
    return base || `Aba ${i + 1}`
  }

  const favSkillIds = skills.filter((s) => s.isFavorite).map((s) => s.id)

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>▶️ Prompt Runner</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Abas independentes p/ rodar em paralelo · agente + skills + projeto + seu texto.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {toast && <span className="badge-hot" style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)' }}>{toast}</span>}
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Modelo:</label>
          <select value={model} onChange={(e) => { setModel(e.target.value); window.api.settings.set('claude_model', e.target.value) }}>
            <option value="">Padrão</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="runner-tabs">
        {tabs.map((t, i) => (
          <div key={t.id} className={`runner-tab ${t.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(t.id)}>
            {t.running && <span className="active-task-dot" style={{ width: 7, height: 7 }} />}
            {editingTabId === t.id ? (
              <input
                className="runner-tab-input"
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle(t.id)
                  else if (e.key === 'Escape') setEditingTabId(null)
                }}
                onBlur={() => commitTitle(t.id)}
              />
            ) : (
              <span
                onDoubleClick={(e) => { e.stopPropagation(); setEditingTabId(t.id); setTitleDraft(t.title || tabTitle(t, i)) }}
                title="Duplo clique para renomear"
              >
                {tabTitle(t, i)}
              </span>
            )}
            <button className="runner-tab-close" onClick={(e) => { e.stopPropagation(); closeTab(t.id) }} title="Fechar aba">✕</button>
          </div>
        ))}
        <button className="runner-tab-add" onClick={addTab} title="Nova aba">＋</button>
      </div>

      <div className="runner-grid">
        {/* Left */}
        <div className="runner-col">
          <div className="editor-row">
            <div className="editor-field">
              <label>Agente</label>
              <select value={active.agentId ?? ''} onChange={(e) => applyAgent(active.id, e.target.value)}>
                <option value="">Nenhum</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="editor-field">
              <label>Projeto</label>
              <select value={active.projectId ?? ''} onChange={(e) => patchActive({ projectId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Nenhum</option>
                {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <input type="text" placeholder="🔍 Buscar skills…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ margin: '8px 0' }} />
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => patchActive({ skillIds: favSkillIds })}>★ Favoritas</button>
            <button className="btn btn-secondary btn-sm" onClick={() => patchActive({ skillIds: [] })}>Limpar</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>{active.skillIds.length} sel.</span>
          </div>
          <div className="skill-checklist" style={{ flex: 1, minHeight: 200 }}>
            {filteredSkills.map((s) => (
              <label key={s.id} className="skill-check-row">
                <input type="checkbox" checked={active.skillIds.includes(s.id)} onChange={() => toggleSkill(active.id, s.id)} />
                <span>{s.isFavorite ? '★ ' : ''}{s.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="runner-col">
          <div className="editor-field">
            <label>Seu prompt</label>
            <textarea rows={5} value={active.userPrompt} onChange={(e) => patchActive({ userPrompt: e.target.value })} style={{ resize: 'vertical' }} placeholder="Descreva a tarefa…" />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={copyFinal} disabled={!finalPrompt.trim()}>📋 Copiar</button>
            <button className="btn btn-secondary btn-sm" onClick={() => save(active.agentId, active.skillIds, active.userPrompt, finalPrompt, null).then(() => flash('Salvo ✓'))} disabled={!finalPrompt.trim()}>💾 Salvar</button>
            {active.running ? (
              <button className="btn btn-danger btn-sm" onClick={() => cancel(active)}>⏹ Cancelar</button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => run(active)} disabled={!finalPrompt.trim()}>▶️ Executar aqui</button>
            )}
          </div>
          <div className="editor-field">
            <label>Prompt final <span style={{ color: 'var(--text-muted)' }}>({finalPrompt.length} chars)</span></label>
            <pre className="ai-output" style={{ minHeight: 100, maxHeight: 200 }}>{finalPrompt || '(vazio)'}</pre>
          </div>
          {active.error && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{active.error}</div>}
          {(active.output || active.running) && (
            <div className="editor-field">
              <label>Resposta (Claude local){active.running ? ' — executando…' : ''}</label>
              <pre className="ai-output" style={{ maxHeight: 260 }}>{active.output || '…'}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
