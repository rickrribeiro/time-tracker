import React, { useState } from 'react'
import { StudyNode } from '../../../types'
import { useStudyStore } from '../store/studyStore'

interface TreeItem {
  node: StudyNode
  children: TreeItem[]
}

function buildTree(nodes: StudyNode[]): TreeItem[] {
  const byParent = new Map<number | null, StudyNode[]>()
  for (const n of nodes) {
    const key = n.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(n)
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
  const build = (pid: number | null): TreeItem[] => (byParent.get(pid) ?? []).map((n) => ({ node: n, children: build(n.id) }))
  return build(null)
}

function subtreeProgress(item: TreeItem): { done: number; total: number } {
  let done = item.node.status === 'done' ? 1 : 0
  let total = 1
  for (const c of item.children) {
    const p = subtreeProgress(c)
    done += p.done
    total += p.total
  }
  return { done, total }
}

const STATUS_ICON: Record<string, string> = { todo: '○', doing: '◑', done: '●' }
const STATUS_COLOR: Record<string, string> = { todo: 'var(--text-muted)', doing: 'var(--warning, #f59e0b)', done: 'var(--success)' }

function NodeEditor({ node, onClose }: { node: StudyNode; onClose: () => void }): React.ReactElement {
  const { updateNode } = useStudyStore()
  const [title, setTitle] = useState(node.title)
  const [description, setDescription] = useState(node.description ?? '')
  const [hours, setHours] = useState(node.estimatedHours != null ? String(node.estimatedHours) : '')
  async function save(): Promise<void> {
    if (!title.trim()) return
    const h = parseFloat(hours)
    await updateNode(node.id, title.trim(), description.trim() || null, node.status, isNaN(h) ? null : h)
    onClose()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>Editar item</h2>
        <div className="editor-field">
          <label>Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="editor-field">
          <label>Descrição</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="editor-field">
          <label>Horas estimadas</label>
          <input type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

type DropZone = 'before' | 'after' | 'inside'

function NodeRow({ item, depth, siblings }: { item: TreeItem; depth: number; siblings: TreeItem[]; index: number }): React.ReactElement {
  const { selectedNodeId, selectNode, cycleNodeStatus, createNode, moveNode, removeNode, reorderNode } = useStudyStore()
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)
  const [childTitle, setChildTitle] = useState('')
  const [editing, setEditing] = useState(false)
  const [zone, setZone] = useState<DropZone | null>(null)
  const n = item.node
  const hasChildren = item.children.length > 0
  const prog = subtreeProgress(item)
  const pct = hasChildren ? Math.round((prog.done / prog.total) * 100) : n.status === 'done' ? 100 : 0

  async function addChild(): Promise<void> {
    if (!childTitle.trim()) return
    await createNode(n.id, childTitle.trim())
    setChildTitle('')
    setAdding(false)
    setCollapsed(false)
  }

  function onDragOver(e: React.DragEvent): void {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    const z: DropZone = y < r.height * 0.28 ? 'before' : y > r.height * 0.72 ? 'after' : 'inside'
    setZone(z)
  }

  async function onDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault()
    e.stopPropagation()
    const draggedId = Number(e.dataTransfer.getData('text/plain'))
    const z = zone
    setZone(null)
    if (!draggedId || draggedId === n.id || !z) return
    if (z === 'inside') {
      const childrenIds = item.children.map((c) => c.node.id).filter((cid) => cid !== draggedId)
      await reorderNode(draggedId, n.id, childrenIds.length) // append as last child
      setCollapsed(false)
    } else {
      const order = siblings.map((s) => s.node.id).filter((sid) => sid !== draggedId)
      const targetPos = order.indexOf(n.id)
      const newIndex = z === 'before' ? targetPos : targetPos + 1
      await reorderNode(draggedId, n.parentId ?? null, newIndex)
    }
  }

  return (
    <div className="study-node">
      <div
        className={`study-node-row ${selectedNodeId === n.id ? 'selected' : ''} ${zone ? `drop-${zone}` : ''}`}
        style={{ paddingLeft: depth * 16 }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', String(n.id))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setZone(null)}
        onDrop={onDrop}
      >
        <button
          className={`nav-group-chevron ${collapsed ? 'collapsed' : ''}`}
          style={{ visibility: hasChildren ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          onClick={() => setCollapsed((c) => !c)}
        >
          ▾
        </button>
        <button
          className="study-status"
          title={`Status: ${n.status} (clique p/ alternar)`}
          style={{ color: STATUS_COLOR[n.status] }}
          onClick={() => cycleNodeStatus(n)}
        >
          {STATUS_ICON[n.status] ?? '○'}
        </button>
        <button
          className="study-node-title"
          style={{ textDecoration: n.status === 'done' ? 'line-through' : 'none' }}
          onClick={() => selectNode(n.id)}
        >
          {n.title}
        </button>
        {hasChildren && <span className="study-node-pct">{pct}%</span>}
        <span className="study-node-actions">
          <button title="Adicionar subitem" onClick={() => setAdding((a) => !a)}>＋</button>
          <button title="Subir" onClick={() => moveNode(n.id, 'up')}>↑</button>
          <button title="Descer" onClick={() => moveNode(n.id, 'down')}>↓</button>
          <button title="Editar" onClick={() => setEditing(true)}>✎</button>
          <button title="Excluir" onClick={() => window.confirm(`Excluir "${n.title}" e subitens?`) && removeNode(n.id)}>✕</button>
        </span>
      </div>

      {adding && (
        <div className="study-node-add" style={{ paddingLeft: (depth + 1) * 16 }}>
          <input
            autoFocus
            placeholder="Novo subitem…"
            value={childTitle}
            onChange={(e) => setChildTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' ? addChild() : e.key === 'Escape' ? setAdding(false) : undefined}
          />
          <button className="btn btn-primary btn-sm" onClick={addChild}>Adicionar</button>
        </div>
      )}

      {!collapsed && item.children.map((c, ci) => <NodeRow key={c.node.id} item={c} depth={depth + 1} siblings={item.children} index={ci} />)}

      {editing && <NodeEditor node={n} onClose={() => setEditing(false)} />}
    </div>
  )
}

export function RoadmapTree(): React.ReactElement {
  const { nodes, createNode } = useStudyStore()
  const [rootTitle, setRootTitle] = useState('')
  const tree = buildTree(nodes)

  async function addRoot(): Promise<void> {
    if (!rootTitle.trim()) return
    await createNode(null, rootTitle.trim())
    setRootTitle('')
  }

  return (
    <div>
      <div className="study-node-add" style={{ marginBottom: 8 }}>
        <input
          placeholder="Nova seção/item…"
          value={rootTitle}
          onChange={(e) => setRootTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRoot()}
        />
        <button className="btn btn-primary btn-sm" onClick={addRoot}>＋</button>
      </div>
      <div className="study-tree">
        {tree.length === 0 && <div className="empty-hint">Sem itens. Adicione a primeira seção acima.</div>}
        {tree.map((item, i) => <NodeRow key={item.node.id} item={item} depth={0} siblings={tree} index={i} />)}
      </div>
    </div>
  )
}
