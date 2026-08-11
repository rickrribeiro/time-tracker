import React, { useEffect, useState } from 'react'
import { Rule } from '../../../types'

interface ParamField {
  key: string
  label: string
  min?: number
  max?: number
}
interface RuleDef {
  type: string
  label: string
  describe: (p: Record<string, number>) => string
  defaults: Record<string, number>
  fields: ParamField[]
}

const RULE_DEFS: RuleDef[] = [
  {
    type: 'idle_productive',
    label: '⏳ Sem foco produtivo',
    describe: (p) => `Se ficar ${p.minutes ?? 45}min sem tarefa produtiva entre ${p.startHour ?? 9}h e ${p.endHour ?? 18}h → notifica.`,
    defaults: { minutes: 45, startHour: 9, endHour: 18 },
    fields: [
      { key: 'minutes', label: 'Minutos', min: 5 },
      { key: 'startHour', label: 'Início (h)', min: 0, max: 23 },
      { key: 'endHour', label: 'Fim (h)', min: 1, max: 24 }
    ]
  },
  {
    type: 'budget_threshold',
    label: '💸 Estouro de orçamento',
    describe: (p) => `Se o gasto de uma categoria passar de ${p.percent ?? 80}% do orçamento do mês → cria TODO + notifica.`,
    defaults: { percent: 80 },
    fields: [{ key: 'percent', label: '% do orçamento', min: 1, max: 100 }]
  },
  {
    type: 'due_flashcards',
    label: '🔁 Flashcards acumulando',
    describe: (p) => `Se houver mais de ${p.count ?? 30} flashcards vencidos → notifica.`,
    defaults: { count: 30 },
    fields: [{ key: 'count', label: 'Qtd. vencidos', min: 1 }]
  }
]

function parseParams(json: string): Record<string, number> {
  try {
    const v = JSON.parse(json)
    return typeof v === 'object' && v ? v : {}
  } catch {
    return {}
  }
}

export function AutomationsPage(): React.ReactElement {
  const [rules, setRules] = useState<Rule[]>([])
  const [drafts, setDrafts] = useState<Record<number, Record<string, number>>>({})

  async function refresh(): Promise<void> {
    const r = await window.api.rules.getAll()
    setRules(r)
    setDrafts(Object.fromEntries(r.map((x) => [x.id, parseParams(x.params)])))
  }
  useEffect(() => {
    refresh()
  }, [])

  async function activate(def: RuleDef): Promise<void> {
    await window.api.rules.create(def.type, JSON.stringify(def.defaults))
    refresh()
  }
  async function save(rule: Rule): Promise<void> {
    await window.api.rules.update(rule.id, rule.enabled, JSON.stringify(drafts[rule.id] ?? {}))
    refresh()
  }
  async function toggle(rule: Rule): Promise<void> {
    await window.api.rules.update(rule.id, rule.enabled ? 0 : 1, rule.params)
    refresh()
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>⚡ Automações</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Regras condição → ação, avaliadas de minuto a minuto enquanto o app está aberto.
          </p>
        </div>
      </div>

      <h3 className="dash-heading">Regras</h3>
      <div className="list-stack">
        {RULE_DEFS.map((def) => {
          const rule = rules.find((r) => r.type === def.type)
          const p = rule ? drafts[rule.id] ?? {} : def.defaults
          return (
            <div key={def.type} className="chart-section" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {rule && (
                  <input type="checkbox" checked={rule.enabled === 1} onChange={() => toggle(rule)} title="Ativar/desativar" />
                )}
                <strong style={{ flex: 1 }}>{def.label}</strong>
                {rule ? (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => save(rule)}>Salvar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => window.api.rules.delete(rule.id).then(refresh)}>✕</button>
                  </>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => activate(def)}>Ativar</button>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' }}>{def.describe(p)}</p>
              {rule && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {def.fields.map((f) => (
                    <div key={f.key} className="editor-field" style={{ maxWidth: 120 }}>
                      <label>{f.label}</label>
                      <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        value={p[f.key] ?? def.defaults[f.key]}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [rule.id]: { ...d[rule.id], [f.key]: Number(e.target.value) } }))
                        }
                      />
                    </div>
                  ))}
                  {rule.lastFiredAt && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                      último disparo: {new Date(rule.lastFiredAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
