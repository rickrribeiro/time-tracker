import React, { useState } from 'react'
import type { Project, ProjectArea } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { AREAS, PRESET_COLORS, STAGES } from '../lib/constants'

interface FormState {
  name: string
  description: string
  area: ProjectArea
  stage: string
  githubRepoUrl: string
  localPath: string
  claudeCommand: string
  color: string
  businessModel: string
  pricing: string
  audience: string
}

const fromProject = (p: Project | null): FormState => ({
  name: p?.name ?? '',
  description: p?.description ?? '',
  area: p?.area ?? 'pessoal',
  stage: p?.stage ?? 'ideia',
  githubRepoUrl: p?.githubRepoUrl ?? '',
  localPath: p?.localPath ?? '',
  claudeCommand: p?.claudeCommand ?? '',
  color: p?.color ?? '#6366f1',
  businessModel: p?.businessModel ?? '',
  pricing: p?.pricing ?? '',
  audience: p?.audience ?? ''
})

/** Criar (vai para a incubadora) ou editar os dados cadastrais de um projeto. */
export function ProjectForm({ project, onClose, onCreated }: { project: Project | null; onClose: () => void; onCreated?: (p: Project) => void }): React.ReactElement {
  const { create, patch } = useProjectStore()
  const [form, setForm] = useState<FormState>(fromProject(project))
  const [advanced, setAdvanced] = useState(!!project)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void => setForm({ ...form, [k]: v })

  async function submit(): Promise<void> {
    if (!form.name.trim()) return
    if (project) {
      await patch(project.id, { ...form, name: form.name.trim() })
    } else {
      const p = await create(
        form.name.trim(),
        form.description.trim() || null,
        form.githubRepoUrl.trim() || null,
        form.color,
        form.claudeCommand.trim() || null,
        form.localPath.trim() || null,
        form.stage,
        form.businessModel.trim() || null,
        form.pricing.trim() || null,
        form.audience.trim() || null
      )
      if (form.area !== 'pessoal') await patch(p.id, { area: form.area })
      onCreated?.(p)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal ph-modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{project ? `Editar ${project.name}` : '🥚 Novo projeto (entra na incubadora)'}</h2>
        <div className="ph-form">
          <input placeholder="Nome" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && !advanced && submit()} />
          <input placeholder="Descrição curta (opcional)" value={form.description} onChange={(e) => set('description', e.target.value)} />
          <div className="ph-row">
            <div className="ph-seg">
              {AREAS.map((a) => (
                <button key={a.key} className={form.area === a.key ? 'active' : ''} onClick={() => set('area', a.key)}>
                  {a.label}
                </button>
              ))}
            </div>
            <select value={form.stage} onChange={(e) => set('stage', e.target.value)} title="Estágio (maturidade)">
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <button className="ph-linkbtn" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? '▾' : '▸'} Repositório, pasta local, negócio, cor
          </button>
          {advanced && (
            <>
              <input placeholder="GitHub repo URL" value={form.githubRepoUrl} onChange={(e) => set('githubRepoUrl', e.target.value)} />
              <input placeholder="Caminho local (ex: ~/Projects/app) — commits, branches e ROADMAP_RICKOS.md" value={form.localPath} onChange={(e) => set('localPath', e.target.value)} />
              <input placeholder="Comando do Claude (opcional — padrão global)" value={form.claudeCommand} onChange={(e) => set('claudeCommand', e.target.value)} />
              <div className="ph-row">
                <input placeholder="Modelo de receita" value={form.businessModel} onChange={(e) => set('businessModel', e.target.value)} />
                <input placeholder="Preço" value={form.pricing} onChange={(e) => set('pricing', e.target.value)} />
                <input placeholder="Público-alvo" value={form.audience} onChange={(e) => set('audience', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Cor ${c}`}
                    onClick={() => set('color', c)}
                    className="ph-swatch"
                    style={{ background: c, outline: form.color === c ? '2px solid var(--text-primary)' : 'none' }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={submit}>{project ? 'Salvar' : 'Criar'}</button>
        </div>
      </div>
    </div>
  )
}
