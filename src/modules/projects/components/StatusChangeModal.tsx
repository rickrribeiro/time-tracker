import React, { useEffect, useState } from 'react'
import type { Project, ProjectStatus } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { statusDef, FOCUS_LIMIT_KEY } from '../lib/constants'
import { ClosingRitualModal } from './ClosingRitualModal'

/**
 * Toda mudança de situação passa por aqui e vira uma decisão registrada:
 * pausar exige motivo + data ou condição de retomada; encerrar exige motivo;
 * entrar em foco exige exatamente uma próxima ação (e avisa sobre o limite de foco).
 */
export function StatusChangeModal({ project, to, onClose }: { project: Project; to: ProjectStatus; onClose: () => void }): React.ReactElement {
  const { projects, setStatus } = useProjectStore()
  const [reason, setReason] = useState('')
  const [resumeAt, setResumeAt] = useState('')
  const [resumeCondition, setResumeCondition] = useState('')
  const [nextAction, setNextAction] = useState(project.nextAction ?? '')
  const [note, setNote] = useState('')
  const [limit, setLimit] = useState(3)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const def = statusDef(to)

  useEffect(() => {
    window.api.settings.get(FOCUS_LIMIT_KEY).then((v) => setLimit(Number(v) || 3))
  }, [])

  if (to === 'concluido') return <ClosingRitualModal project={project} onClose={onClose} />

  const inFocus = projects.filter((p) => p.status === 'foco' && p.id !== project.id).length

  async function save(): Promise<void> {
    setError('')
    if (to === 'pausado' && !reason.trim()) return setError('Diga por que está pausando.')
    if (to === 'pausado' && !resumeAt && !resumeCondition.trim()) return setError('Defina uma data ou condição de retomada.')
    if (to === 'encerrado' && !reason.trim()) return setError('Registre o motivo do encerramento.')
    if (to === 'foco' && !nextAction.trim()) return setError('Projeto em foco precisa de exatamente uma próxima ação.')
    setSaving(true)
    try {
      await setStatus(project.id, to, {
        reason: reason.trim() || null,
        resumeAt: resumeAt || null,
        resumeCondition: resumeCondition.trim() || null,
        nextAction: to === 'foco' || to === 'baixa' ? nextAction.trim() || null : null,
        note: note.trim() || null
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {def.icon} {project.name} → {def.label}
        </h2>
        <p className="ph-muted">{def.hint}</p>

        {to === 'foco' && (
          <>
            {inFocus >= limit && (
              <div className="ph-warn">
                ⚠️ Você já tem {inFocus} projeto(s) em foco (limite {limit}). Considere pausar ou mandar outro para a fila.
              </div>
            )}
            <label className="ph-label">Próxima ação (uma só, concreta)</label>
            <input autoFocus value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Ex: escrever o endpoint de login" />
          </>
        )}

        {to === 'pausado' && (
          <>
            <label className="ph-label">Por que pausar?</label>
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: prioridade do trabalho, esperando cliente…" />
            <div className="ph-row">
              <div style={{ flex: '0 0 auto' }}>
                <label className="ph-label">Retomar em</label>
                <input type="date" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <label className="ph-label">…ou quando</label>
                <input value={resumeCondition} onChange={(e) => setResumeCondition(e.target.value)} placeholder="Ex: depois do lançamento do X" />
              </div>
            </div>
          </>
        )}

        {to === 'encerrado' && (
          <>
            <label className="ph-label">Por que encerrar?</label>
            <textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: perdi interesse, mercado não existe, outro projeto resolve isso…" />
            <p className="ph-muted">Encerrar não é fracasso: é liberar espaço. O projeto vai para a estante com o motivo registrado.</p>
          </>
        )}

        {to === 'baixa' && (
          <>
            <label className="ph-label">Próxima ação (opcional — para quando sobrar um tempo)</label>
            <input autoFocus value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Ex: adicionar gráfico semanal" />
          </>
        )}

        {(to === 'fila' || to === 'incubadora') && (
          <>
            <label className="ph-label">Nota da decisão (opcional)</label>
            <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex: entra em foco depois do RickOS v2" />
          </>
        )}

        {error && <div className="ph-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? 'Salvando…' : `Mover para ${def.label}`}
          </button>
        </div>
      </div>
    </div>
  )
}
