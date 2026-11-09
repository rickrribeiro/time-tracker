import React, { useState } from 'react'
import type { Project, ProjectCycle } from '../../../types'
import { localDateStr } from '../../../utils/dates'
import { fmtDate } from '../lib/constants'

type Mode = 'new' | 'extend' | 'close'

/** Ciclos/versões: iniciar (com prazo), estender (conta extensões + motivo) e entregar/cancelar. */
export function CycleModal({ project, cycle, mode, onClose, onDone, onClosed }: { project: Project; cycle: ProjectCycle | null; mode: Mode; onClose: () => void; onDone: () => void; onClosed?: (cycleId: number) => void }): React.ReactElement {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [due, setDue] = useState(mode === 'extend' ? cycle?.dueDate ?? '' : localDateStr(new Date(Date.now() + 14 * 86400000)))
  const [reason, setReason] = useState('')
  const [closeCurrent, setCloseCurrent] = useState(true)
  const [retro, setRetro] = useState('')
  const [error, setError] = useState('')

  async function save(status?: 'concluido' | 'cancelado'): Promise<void> {
    setError('')
    if (mode === 'new') {
      if (!name.trim()) return setError('Dê um nome ao ciclo (ex: v1.3).')
      if (cycle && closeCurrent) await window.api.cycles.close(cycle.id, 'concluido', null)
      await window.api.cycles.create(project.id, name.trim(), goal.trim() || null, localDateStr(new Date()), due || null)
    } else if (mode === 'extend' && cycle) {
      if (!due) return setError('Escolha o novo prazo.')
      if (!reason.trim()) return setError('Registre o motivo da extensão.')
      await window.api.cycles.extend(cycle.id, due, reason.trim())
    } else if (mode === 'close' && cycle && status) {
      await window.api.cycles.close(cycle.id, status, retro.trim() || null)
    }
    onDone()
    onClose()
    if (mode === 'close' && cycle && status === 'concluido') onClosed?.(cycle.id)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        {mode === 'new' && (
          <>
            <h2>🔁 Novo ciclo — {project.name}</h2>
            <p className="ph-muted">Projetos contínuos avançam em ciclos curtos com prazo e entrega clara.</p>
            <label className="ph-label">Nome / versão</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: v1.3, Novembro" />
            <label className="ph-label">O que este ciclo entrega</label>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex: central de projetos utilizável" />
            <label className="ph-label">Prazo</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            {cycle && (
              <label className="ph-check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={closeCurrent} onChange={() => setCloseCurrent((v) => !v)} />
                <span>Marcar o ciclo atual “{cycle.name}” como entregue</span>
              </label>
            )}
          </>
        )}
        {mode === 'extend' && cycle && (
          <>
            <h2>⏩ Estender “{cycle.name}”</h2>
            <p className="ph-muted">
              Prazo atual {fmtDate(cycle.dueDate)}
              {cycle.extensions > 0 ? ` · já estendido ${cycle.extensions}x (original ${fmtDate(cycle.originalDueDate)})` : ''}
            </p>
            {cycle.extensions >= 2 && <div className="ph-warn">Terceira extensão: talvez seja hora de cortar escopo em vez de empurrar o prazo.</div>}
            <label className="ph-label">Novo prazo</label>
            <input type="date" autoFocus value={due} onChange={(e) => setDue(e.target.value)} />
            <label className="ph-label">Motivo</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: escopo cresceu, semana de trabalho pesada" />
          </>
        )}
        {mode === 'close' && cycle && (
          <>
            <h2>🏁 Fechar “{cycle.name}”</h2>
            <label className="ph-label">Retrospectiva rápida (opcional)</label>
            <textarea autoFocus rows={3} value={retro} onChange={(e) => setRetro(e.target.value)} placeholder="O que foi entregue? O que ficou para o próximo?" />
            <p className="ph-muted">Ao entregar, o rickOS monta o changelog do ciclo a partir dos commits — dá para reescrever com IA e copiar.</p>
          </>
        )}
        {error && <div className="ph-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          {mode === 'close' ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => save('cancelado')}>Cancelar ciclo</button>
              <button className="btn btn-primary btn-sm" onClick={() => save('concluido')}>✓ Entregue</button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => save()}>{mode === 'new' ? 'Iniciar ciclo' : 'Estender'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
