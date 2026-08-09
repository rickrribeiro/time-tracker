import React, { useEffect, useMemo, useState } from 'react'
import { Agent } from '../../../types'
import { useAgentStore } from '../store/agentStore'
import { useSkillStore, parseTags } from '../store/skillStore'

interface FormState {
  name: string
  description: string
  role: string
  systemPrompt: string
  defaultSkillIds: string[]
  tags: string[]
}
const empty: FormState = { name: '', description: '', role: '', systemPrompt: '', defaultSkillIds: [], tags: [] }

function AgentEditor({ agent, onClose }: { agent: Agent | null; onClose: () => void }): React.ReactElement {
  const { create, update } = useAgentStore()
  const { skills } = useSkillStore()
  const [form, setForm] = useState<FormState>(
    agent
      ? { name: agent.name, description: agent.description ?? '', role: agent.role ?? '', systemPrompt: agent.systemPrompt, defaultSkillIds: parseTags(agent.defaultSkillIds), tags: parseTags(agent.tags) }
      : empty
  )
  const [tagDraft, setTagDraft] = useState('')

  function toggleSkill(id: string): void {
    setForm((f) => ({
      ...f,
      defaultSkillIds: f.defaultSkillIds.includes(id) ? f.defaultSkillIds.filter((x) => x !== id) : [...f.defaultSkillIds, id]
    }))
  }
  function addTag(): void {
    const t = tagDraft.trim()
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] })
    setTagDraft('')
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) return
    const args = [form.name.trim(), form.description.trim() || null, form.role.trim() || null, form.systemPrompt, form.defaultSkillIds, form.tags] as const
    if (agent) await update(agent.id, ...args)
    else await create(...args)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 460, maxWidth: 640 }}>
        <h2>{agent ? 'Editar agente' : 'Novo agente'}</h2>
        <div className="editor-row">
          <div className="editor-field">
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="editor-field">
            <label>Papel/função</label>
            <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </div>
        </div>
        <div className="editor-field">
          <label>Descrição</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="editor-field">
          <label>System Prompt <span style={{ color: 'var(--text-muted)' }}>({form.systemPrompt.length} chars)</span></label>
          <textarea rows={6} value={form.systemPrompt} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} style={{ resize: 'vertical' }} />
        </div>
        <div className="editor-field">
          <label>Skills padrão ({form.defaultSkillIds.length})</label>
          <div className="skill-checklist" style={{ maxHeight: 160 }}>
            {skills.length === 0 && <div className="empty-hint" style={{ padding: 8 }}>Nenhuma skill cadastrada.</div>}
            {skills.map((s) => (
              <label key={s.id} className="skill-check-row">
                <input type="checkbox" checked={form.defaultSkillIds.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="editor-field">
          <label>Tags</label>
          <div className="tag-input">
            {form.tags.map((t) => (
              <span key={t} className="project-chip" onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} style={{ cursor: 'pointer' }}>{t} ✕</span>
            ))}
            <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTag())} placeholder="tag + Enter" style={{ flex: 1, minWidth: 100, border: 'none', background: 'transparent', padding: 4 }} />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

export function AgentsPage(): React.ReactElement {
  const { agents, refresh, remove, toggleFavorite, duplicate, exportOne, importOne } = useAgentStore()
  const { skills, refresh: refreshSkills } = useSkillStore()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Agent | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    refresh()
    refreshSkills()
  }, [])

  const skillName = (id: string): string => skills.find((s) => s.id === id)?.name ?? '?'

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return agents
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.isFavorite !== b.isFavorite ? b.isFavorite - a.isFavorite : b.updatedAt.localeCompare(a.updatedAt)))
  }, [agents, search])

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🤝 Agentes</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{agents.length} agentes</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={importOne}>📥 Importar</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>+ Novo agente</button>
        </div>
      </div>

      <div className="todo-toolbar">
        <input type="text" placeholder="🔍 Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
      </div>

      <div className="cards-grid">
        {list.length === 0 && <div className="empty-hint">Nenhum agente.</div>}
        {list.map((a) => {
          const skillIds = parseTags(a.defaultSkillIds)
          return (
            <div key={a.id} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span className="stat-card-value" style={{ fontSize: 15 }}>
                  <button className="star-btn" onClick={() => toggleFavorite(a.id)} title="Favoritar">{a.isFavorite ? '★' : '☆'}</button> {a.name}
                </span>
                {a.role && <span className="cat-chip">{a.role}</span>}
              </div>
              {a.description && <div className="stat-card-sub">{a.description}</div>}
              <div className="stat-card-sub" style={{ marginTop: 6 }}>🧩 {skillIds.length} skills{skillIds.length > 0 ? `: ${skillIds.map(skillName).join(', ')}` : ''}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(a); setShowForm(true) }}>Editar</button>
                <button className="btn btn-secondary btn-sm" onClick={() => duplicate(a)}>Duplicar</button>
                <button className="btn btn-secondary btn-sm" onClick={() => exportOne(a.id)}>Exportar</button>
                <button className="btn btn-danger btn-sm" onClick={() => confirm(`Excluir "${a.name}"?`) && remove(a.id)}>Excluir</button>
              </div>
            </div>
          )
        })}
      </div>

      {showForm && <AgentEditor agent={editing} onClose={() => setShowForm(false)} />}
    </div>
  )
}
