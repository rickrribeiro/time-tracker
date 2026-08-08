import React, { useState } from 'react'

const CHECKLIST = ['Passaporte', 'Visto', 'Vacina', 'Seguro viagem', 'Comprovante de hospedagem', 'Câmbio / cartão internacional']

export function DocumentsPage(): React.ReactElement {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  function toggle(item: string): void {
    setChecked((c) => ({ ...c, [item]: !c[item] }))
  }

  const done = CHECKLIST.filter((i) => checked[i]).length

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>📄 Documentos</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Checklist de viagem — {done}/{CHECKLIST.length} (não persiste ainda)
          </p>
        </div>
      </div>

      <div className="list-stack">
        {CHECKLIST.map((item) => (
          <label key={item} className="list-row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={!!checked[item]} onChange={() => toggle(item)} />
            <span
              className="list-row-title"
              style={{
                textDecoration: checked[item] ? 'line-through' : 'none',
                color: checked[item] ? 'var(--text-muted)' : 'var(--text-primary)'
              }}
            >
              {item}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
