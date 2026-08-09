import React, { useEffect, useMemo, useState } from 'react'
import { Skill } from '../../../types'
import { useSkillStore, parseTags } from '../store/skillStore'

interface FormState {
  name: string
  description: string
  category: string
  tags: string[]
  content: string
}
const empty: FormState = { name: '', description: '', category: '', tags: [], content: '' }

function SkillEditor({ skill, onClose }: { skill: Skill | null; onClose: () => void }): React.ReactElement {
  const { create, update } = useSkillStore()
  const [form, setForm] = useState<FormState>(
    skill
      ? { name: skill.name, description: skill.description ?? '', category: skill.category ?? '', tags: parseTags(skill.tags), content: skill.content }
      : empty
  )
  const [tagDraft, setTagDraft] = useState('')

  function addTag(): void {
    const t = tagDraft.trim()
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] })
    setTagDraft('')
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) return
    const args = [form.name.trim(), form.description.trim() || null, form.category.trim() || null, form.tags, form.content] as const
    if (skill) await update(skill.id, ...args)
    else await create(...args)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 460, maxWidth: 640 }}>
        <h2>{skill ? 'Editar skill' : 'Nova skill'}</h2>
        <div className="editor-field">
          <label>Nome</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Descrição</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="editor-field">
            <label>Categoria</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
        </div>
        <div className="editor-field">
          <label>Tags</label>
          <div className="tag-input">
            {form.tags.map((t) => (
              <span key={t} className="project-chip" onClick={() => setForm({ ...form, tags: form.tags.filter((x) => x !== t) })} style={{ cursor: 'pointer' }}>
                {t} ✕
              </span>
            ))}
            <input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ',') && (e.preventDefault(), addTag())}
              placeholder="tag + Enter"
              style={{ flex: 1, minWidth: 100, border: 'none', background: 'transparent', padding: 4 }}
            />
          </div>
        </div>
        <div className="editor-field">
          <label>Conteúdo <span style={{ color: 'var(--text-muted)' }}>({form.content.length} chars)</span></label>
          <textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ resize: 'vertical' }} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

export function SkillsPage(): React.ReactElement {
  const { skills, refresh, remove, toggleFavorite, duplicate, exportOne, importOne } = useSkillStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [sort, setSort] = useState<'updated' | 'name'>('updated')
  const [editing, setEditing] = useState<Skill | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

  const categories = useMemo(() => Array.from(new Set(skills.map((s) => s.category).filter(Boolean))) as string[], [skills])
  const allTags = useMemo(() => Array.from(new Set(skills.flatMap((s) => parseTags(s.tags)))).sort(), [skills])
  const maxUsage = useMemo(() => Math.max(0, ...skills.map((s) => s.usageCount)), [skills])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return skills
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q))
      .filter((s) => categoryFilter === 'all' || s.category === categoryFilter)
      .filter((s) => tagFilter === 'all' || parseTags(s.tags).includes(tagFilter))
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return b.isFavorite - a.isFavorite
        return sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)
      })
  }, [skills, search, categoryFilter, tagFilter, sort])

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🧩 Skills</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{skills.length} skills</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={importOne}>📥 Importar</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true) }}>+ Nova skill</button>
        </div>
      </div>

      <div className="todo-toolbar">
        <input type="text" placeholder="🔍 Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">Todas categorias</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="all">Todas tags</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as 'updated' | 'name')}>
          <option value="updated">Recentes</option>
          <option value="name">Nome</option>
        </select>
      </div>

      <div className="cards-grid">
        {list.length === 0 && <div className="empty-hint">Nenhuma skill.</div>}
        {list.map((s) => (
          <div key={s.id} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <span className="stat-card-value" style={{ fontSize: 15 }}>
                <button className="star-btn" onClick={() => toggleFavorite(s.id)} title="Favoritar">{s.isFavorite ? '★' : '☆'}</button> {s.name}
              </span>
              {s.usageCount > 0 && s.usageCount === maxUsage && <span className="badge-hot">🔥 Mais usada</span>}
            </div>
            {s.description && <div className="stat-card-sub">{s.description}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {s.category && <span className="cat-chip">{s.category}</span>}
              {parseTags(s.tags).map((t) => (
                <span key={t} className="project-chip" style={{ cursor: 'pointer' }} onClick={() => setTagFilter(t)}>{t}</span>
              ))}
            </div>
            <div className="stat-card-sub" style={{ marginTop: 6 }}>usos: {s.usageCount} · {s.updatedAt.slice(0, 10)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(s); setShowForm(true) }}>Editar</button>
              <button className="btn btn-secondary btn-sm" onClick={() => duplicate(s)}>Duplicar</button>
              <button className="btn btn-secondary btn-sm" onClick={() => exportOne(s.id)}>Exportar</button>
              <button className="btn btn-danger btn-sm" onClick={() => confirm(`Excluir "${s.name}"?`) && remove(s.id)}>Excluir</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && <SkillEditor skill={editing} onClose={() => setShowForm(false)} />}
    </div>
  )
}
