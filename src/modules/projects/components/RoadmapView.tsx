import React, { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { MARK_ICON, MARK_LABEL, RoadmapMark, RoadmapNode, flattenRoadmap, nextMark, parseRoadmap, roadmapStats } from '../lib/roadmap'

type Mode = 'arvore' | 'tabela'

/** Roadmap de funcionalidades lido do ROADMAP_RICKOS.md na raiz do projeto (árvore ou tabela). */
export function RoadmapView({ project }: { project: Project }): React.ReactElement {
  const [data, setData] = useState<{ path: string | null; exists: boolean; content: string } | null>(null)
  const [mode, setMode] = useState<Mode>('arvore')
  const [filter, setFilter] = useState<'todos' | 'abertos' | RoadmapMark>('todos')
  const [version, setVersion] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')

  async function load(): Promise<void> {
    setError('')
    try {
      setData(await window.api.projects.roadmap(project.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => {
    void load()
  }, [project.id])

  const tree = useMemo(() => (data?.exists ? parseRoadmap(data.content) : []), [data])
  const stats = useMemo(() => roadmapStats(tree), [tree])
  const rows = useMemo(() => flattenRoadmap(tree), [tree])
  const versions = useMemo(() => [...new Set(rows.map((r) => r.node.version).filter(Boolean))] as string[], [rows])

  async function cycle(n: RoadmapNode, to?: RoadmapMark): Promise<void> {
    if (!n.mark) return
    const mark = to ?? nextMark(n.mark)
    try {
      const r = await window.api.projects.roadmapSet(project.id, n.line, n.raw.trim(), mark)
      setData((d) => (d ? { ...d, content: r.content } : d))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      void load()
    }
  }

  async function createTemplate(): Promise<void> {
    try {
      await window.api.projects.roadmapCreate(project.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const matches = (n: RoadmapNode): boolean =>
    (filter === 'todos' || (filter === 'abertos' ? n.mark === ' ' || n.mark === '~' : n.mark === filter)) && (!version || n.version === version)

  if (!project.localPath) {
    return <div className="empty-hint">Defina o caminho local do projeto (Editar) para ler o <code>ROADMAP_RICKOS.md</code>.</div>
  }
  if (!data) return <div className="empty-hint">Carregando roadmap…</div>
  if (!data.exists) {
    return (
      <div className="chart-section">
        <div className="chart-title">🗺 Sem roadmap ainda</div>
        <p className="ph-muted" style={{ margin: '8px 0' }}>
          Crie <code>ROADMAP_RICKOS.md</code> na raiz de <code>{project.localPath}</code> seguindo o padrão: <code>##</code> área, <code>###</code> funcionalidade, <code>- [ ]</code> tarefa, <code>@v1</code> versão, <code>!alta</code> prioridade.
        </p>
        <button className="btn btn-primary btn-sm" onClick={createTemplate}>Criar a partir do modelo</button>
        {error && <div className="ph-error">{error}</div>}
      </div>
    )
  }

  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0

  const renderNode = (n: RoadmapNode): React.ReactElement | null => {
    if (n.kind === 'heading') {
      const s = roadmapStats(n.children)
      const isCollapsed = collapsed.has(n.id)
      const kids = n.children.map(renderNode).filter(Boolean)
      if (!kids.length && filter !== 'todos') return null
      return (
        <div key={n.id} className={`ph-rm-group lvl-${n.level}`}>
          <button
            className="ph-rm-heading"
            onClick={() => {
              const next = new Set(collapsed)
              if (isCollapsed) next.delete(n.id)
              else next.add(n.id)
              setCollapsed(next)
            }}
          >
            <span>{isCollapsed ? '▸' : '▾'}</span>
            <span className="ph-rm-heading-text">{n.text}</span>
            {s.total > 0 && (
              <>
                <span className="ph-rm-mini"><span style={{ width: `${(s.done / s.total) * 100}%` }} /></span>
                <span className="ph-muted">{s.done}/{s.total}</span>
              </>
            )}
          </button>
          {!isCollapsed && <div className="ph-rm-children">{kids}</div>}
        </div>
      )
    }
    const kids = n.children.map(renderNode).filter(Boolean)
    if (!matches(n) && !kids.length) return null
    return (
      <div key={n.id} className="ph-rm-item-wrap">
        <div className={`ph-rm-item mark-${n.mark === ' ' ? 'todo' : n.mark === 'x' ? 'done' : n.mark === '~' ? 'doing' : n.mark === '-' ? 'drop' : 'none'}`}>
          {n.mark ? (
            <button className="ph-rm-mark" onClick={() => cycle(n)} title={`${MARK_LABEL[n.mark]} — clique para avançar`}>
              {MARK_ICON[n.mark]}
            </button>
          ) : (
            <span className="ph-rm-mark">•</span>
          )}
          <span className="ph-rm-text">{n.text}</span>
          {n.version && <span className="ph-tag">@{n.version}</span>}
          {n.priority && <span className={`ph-tag prio-${n.priority}`}>!{n.priority}</span>}
        </div>
        {kids.length > 0 && <div className="ph-rm-children">{kids}</div>}
      </div>
    )
  }

  return (
    <div className="ph-roadmap">
      <div className="ph-rm-toolbar">
        <div className="seg-toggle">
          <button className={`seg-btn ${mode === 'arvore' ? 'active' : ''}`} onClick={() => setMode('arvore')}>🌳 Árvore</button>
          <button className={`seg-btn ${mode === 'tabela' ? 'active' : ''}`} onClick={() => setMode('tabela')}>▦ Tabela</button>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="todos">Todos</option>
          <option value="abertos">Abertos</option>
          <option value="~">Em andamento</option>
          <option value="x">Feitos</option>
          <option value="-">Descartados</option>
        </select>
        {versions.length > 0 && (
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            <option value="">Todas as versões</option>
            {versions.map((v) => <option key={v} value={v}>@{v}</option>)}
          </select>
        )}
        <span className="ph-muted">
          {stats.done}/{stats.total} feitos · {stats.doing} em andamento · {pct}%
        </span>
        <button className="btn btn-secondary btn-sm" onClick={load} title={data.path ?? ''}>↻</button>
      </div>
      <div className="ph-progress big"><div style={{ width: `${pct}%` }} /></div>
      {error && <div className="ph-error">{error}</div>}

      {mode === 'arvore' ? (
        <div className="ph-rm-tree">{tree.map(renderNode)}</div>
      ) : (
        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Item</th>
                <th>Área</th>
                <th>Funcionalidade</th>
                <th>Versão</th>
                <th>Prior.</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.node.mark && matches(r.node)).map((r) => (
                <tr key={r.node.id}>
                  <td>
                    <select value={r.node.mark ?? ' '} onChange={(e) => cycle(r.node, e.target.value as RoadmapMark)}>
                      {(Object.keys(MARK_LABEL) as RoadmapMark[]).map((m) => (
                        <option key={m} value={m}>{MARK_ICON[m]} {MARK_LABEL[m]}</option>
                      ))}
                    </select>
                  </td>
                  <td>{r.parent ? <span className="ph-muted">{r.parent} › </span> : null}{r.node.text}</td>
                  <td>{r.area}</td>
                  <td>{r.feature}</td>
                  <td>{r.node.version ? `@${r.node.version}` : ''}</td>
                  <td>{r.node.priority ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
