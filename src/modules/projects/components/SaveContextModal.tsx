import React, { useEffect, useState } from 'react'
import type { Project } from '../../../types'
import { useContextPromptStore } from '../store/contextPromptStore'
import { useProjectStore } from '../store/projectStore'
import { fmtMinutes } from '../lib/constants'
import { projectContext, runText } from '../lib/ai'

/** Aparece ao encerrar uma sessão do timer vinculada a um projeto: "onde parei" + próximo passo. */
export function SaveContextModal(): React.ReactElement | null {
  const { prompt, dismiss } = useContextPromptStore()
  const { patch } = useProjectStore()
  const [project, setProject] = useState<Project | null>(null)
  const [where, setWhere] = useState('')
  const [next, setNext] = useState('')
  const [aiRunning, setAiRunning] = useState(false)

  useEffect(() => {
    if (!prompt) return
    setWhere('')
    window.api.projects.get(prompt.projectId).then((p) => {
      setProject(p)
      setNext(p?.nextAction ?? '')
    })
  }, [prompt])

  if (!prompt || !project) return null

  async function draft(): Promise<void> {
    if (!project || !prompt) return
    setAiRunning(true)
    try {
      const ctx = await projectContext(project)
      const txt = await runText(
        `Acabei uma sessão de ${prompt.minutes} min em "${prompt.taskTitle}". Escreva um "ONDE PAREI" de 2-3 frases, em primeira pessoa, para eu retomar rápido amanhã (o que estava fazendo, estado atual, detalhe que eu esqueceria). Use os commits e o histórico recentes. Só o texto.\n\n${ctx}`
      )
      setWhere(txt)
    } catch {
      // IA indisponível: segue manual
    } finally {
      setAiRunning(false)
    }
  }

  async function save(): Promise<void> {
    if (!project) return
    const fields: Record<string, string | null> = {}
    if (where.trim()) fields.whereLeftOff = where.trim()
    if (next.trim() !== (project.nextAction ?? '')) fields.nextAction = next.trim() || null
    if (Object.keys(fields).length) await patch(project.id, fields)
    dismiss()
  }

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="modal ph-modal" onClick={(e) => e.stopPropagation()}>
        <h2>📍 Salvar contexto — {project.name}</h2>
        <p className="ph-muted">
          Sessão de {fmtMinutes(prompt.minutes)} em “{prompt.taskTitle}”. Deixe um bilhete para o você do futuro.
        </p>
        <label className="ph-label">Onde parei</label>
        <textarea autoFocus rows={3} value={where} onChange={(e) => setWhere(e.target.value)} placeholder={project.whereLeftOff ?? 'Ex: login funcionando, falta tratar refresh token em api/auth.ts'} />
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={draft} disabled={aiRunning}>
          {aiRunning ? 'Escrevendo…' : '✨ Rascunho pela IA'}
        </button>
        <label className="ph-label">Próximo passo</label>
        <input value={next} onChange={(e) => setNext(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={dismiss}>Agora não</button>
          <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
