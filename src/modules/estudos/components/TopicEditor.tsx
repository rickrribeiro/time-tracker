import React, { useState } from 'react'
import { StudyTopic } from '../../../types'
import { useStudyStore } from '../store/studyStore'

export const TOPIC_STATUSES = ['studying', 'planned', 'paused', 'completed'] as const
export const TOPIC_STATUS_LABEL: Record<string, string> = {
  studying: 'Estudando',
  planned: 'Planejado',
  paused: 'Pausado',
  completed: 'Concluído'
}
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899']

/** Create (topic=null) or edit a study topic. Mirrors TodoEditor. */
export function TopicEditor({ topic, onClose }: { topic: StudyTopic | null; onClose: () => void }): React.ReactElement {
  const { createTopic, updateTopic } = useStudyStore()
  const [name, setName] = useState(topic?.name ?? '')
  const [category, setCategory] = useState(topic?.category ?? '')
  const [status, setStatus] = useState(topic?.status ?? 'studying')
  const [priority, setPriority] = useState(topic?.priority ?? 0)
  const [targetDate, setTargetDate] = useState(topic?.targetDate ?? '')
  const [color, setColor] = useState(topic?.color ?? COLORS[0])

  async function save(): Promise<void> {
    if (!name.trim()) return
    if (topic) {
      await updateTopic({ ...topic, name: name.trim(), category: category.trim() || null, status, priority, targetDate: targetDate || null, color })
    } else {
      await createTopic(name.trim(), category.trim() || null, status, targetDate || null, priority, color)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 380 }}>
        <h2>{topic ? 'Editar tópico' : 'Novo tópico'}</h2>
        <div className="editor-field">
          <label>Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="ex: Kubernetes" />
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Categoria</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ex: DevOps, Idioma" />
          </div>
          <div className="editor-field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {TOPIC_STATUSES.map((s) => (
                <option key={s} value={s}>{TOPIC_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>Prioridade</label>
            <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
              <option value={0}>Nenhuma</option>
              <option value={1}>Baixa</option>
              <option value={2}>Média</option>
              <option value={3}>Alta</option>
            </select>
          </div>
          <div className="editor-field">
            <label>Meta (data)</label>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
        </div>
        <div className="editor-field">
          <label>Cor</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: c,
                  border: color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                  cursor: 'pointer'
                }}
              />
            ))}
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
