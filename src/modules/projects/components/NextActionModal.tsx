import React, { useEffect, useState } from 'react'
import type { Project, Todo } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { projectContext, runJson } from '../lib/ai'

/**
 * Concluir a próxima ação já pede a seguinte (sugestões: TODOs abertos do projeto,
 * próximo marco, ou IA). Também serve para só definir a próxima ação.
 */
export function NextActionModal({ project, mode, onClose }: { project: Project; mode: 'complete' | 'set'; onClose: () => void }): React.ReactElement {
  const { completeNextAction, patch, overview, milestones } = useProjectStore()
  const [next, setNext] = useState(mode === 'set' ? project.nextAction ?? '' : '')
  const [todos, setTodos] = useState<Todo[]>([])
  const [aiIdeas, setAiIdeas] = useState<string[]>([])
  const [aiRunning, setAiRunning] = useState(false)
  const [error, setError] = useState('')
  const nextMs = milestones.find((m) => m.projectId === project.id && !m.doneAt)

  useEffect(() => {
    window.api.todos.getAll().then((all) => setTodos(all.filter((t) => t.projectId === project.id && t.status !== 'done' && t.status !== 'inbox')))
  }, [project.id])

  async function suggest(): Promise<void> {
    setAiRunning(true)
    setError('')
    try {
      const ctx = await projectContext(project, overview[project.id])
      const r = await runJson<{ actions: string[] }>(
        `${mode === 'complete' ? `Acabei de concluir a ação: "${project.nextAction}".` : ''} Sugira 3 opções de PRÓXIMA AÇÃO para este projeto: cada uma concreta, física, que caiba em uma sessão de 25-90 minutos e aproxime da linha de chegada. Formato: {"actions": ["...", "...", "..."]}\n\n${ctx}`
      )
      setAiIdeas((r.actions ?? []).slice(0, 3))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiRunning(false)
    }
  }

  async function save(): Promise<void> {
    if (mode === 'complete') await completeNextAction(project.id, next.trim() || null)
    else await patch(project.id, { nextAction: next.trim() || null })
    onClose()
  }

  const chips = [...(nextMs ? [`Avançar marco: ${nextMs.title}`] : []), ...todos.slice(0, 5).map((t) => t.title), ...aiIdeas]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'complete' ? '✅ Ação concluída! E agora?' : '👉 Próxima ação'}</h2>
        {mode === 'complete' && project.nextAction && <p className="ph-muted ph-strike">{project.nextAction}</p>}
        <label className="ph-label">Próxima ação de {project.name}</label>
        <input autoFocus value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Uma ação concreta" />
        {chips.length > 0 && (
          <div className="ph-chips">
            {chips.map((c) => (
              <button key={c} className="ph-chip" onClick={() => setNext(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={suggest} disabled={aiRunning}>
            {aiRunning ? 'Pensando…' : '✨ Sugerir com IA'}
          </button>
        </div>
        {error && <div className="ph-error">{error}</div>}
        {project.status === 'foco' && !next.trim() && <div className="ph-warn">Projetos em foco devem ter uma próxima ação — ele vai aparecer no radar.</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
