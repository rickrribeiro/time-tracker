import React, { useEffect, useState } from 'react'
import { NAV_GROUPS, groupKey, isToggleable } from '../../../navigation'
import { useModuleStore } from '../../../store/moduleStore'

const TOGGLEABLE = NAV_GROUPS.filter(isToggleable)

/** Configurações → Módulos: liga/desliga grupos da sidebar. */
export function ModulesSection(): React.ReactElement {
  const hidden = useModuleStore((s) => s.hidden)
  const [open, setOpen] = useState(false)
  const active = TOGGLEABLE.filter((g) => !hidden.includes(groupKey(g))).length

  return (
    <div className="chart-section" style={{ maxWidth: 560 }}>
      <div className="chart-title">🧩 Módulos</div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>
        {active} de {TOGGLEABLE.length} ativos. Módulos desativados somem da barra lateral (os dados continuam salvos).
      </p>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Escolher módulos</button>
      {open && <ModulesModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function ModulesModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const { hidden, setHidden } = useModuleStore()
  const [draft, setDraft] = useState<string[]>(hidden)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(key: string): void {
    setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]))
  }

  async function save(): Promise<void> {
    await setHidden(draft)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🧩 Módulos</h2>
        <div className="modules-list">
          {TOGGLEABLE.map((g) => {
            const key = groupKey(g)
            const on = !draft.includes(key)
            const icon = g.groupIcon ?? g.items[0].icon
            const name = g.label || g.items[0].label
            return (
              <label key={key} className={`modules-row${on ? '' : ' off'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(key)} />
                <span className="modules-icon">{icon}</span>
                <span className="modules-name">{name}</span>
                {g.label && <span className="modules-pages">{g.items.map((i) => i.label).join(' · ')}</span>}
              </label>
            )
          })}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setDraft([])}>Ativar todos</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
