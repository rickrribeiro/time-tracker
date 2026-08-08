import React, { useEffect, useState } from 'react'
import { useTodoStore } from '../../todo/store/todoStore'
import { useHabitStore } from '../../habits/store/habitStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'
import { useTripStore } from '../../travel/store/tripStore'

interface QuickAction {
  key: string
  label: string
  build: (ctx: Ctx) => string
}

interface Ctx {
  todos: ReturnType<typeof useTodoStore.getState>['todos']
  habitNames: string[]
  events: ReturnType<typeof useCalendarStore.getState>['upcoming']
  nextTrip: ReturnType<typeof useTripStore.getState>['trips'][number] | undefined
}

const list = (items: string[]): string => items.map((t) => `- ${t}`).join('\n') || '(nenhum)'

const ACTIONS: QuickAction[] = [
  {
    key: 'prioritize',
    label: 'Priorizar tarefas',
    build: (c) =>
      `Você é meu assistente de produtividade. Priorize as tarefas abaixo (mais importante primeiro), explicando brevemente o porquê:\n\n${list(
        c.todos.filter((t) => t.status !== 'done' && t.status !== 'inbox').map((t) => t.title)
      )}`
  },
  {
    key: 'inbox',
    label: 'Revisar inbox',
    build: (c) =>
      `Revise minha inbox e sugira, para cada item, se vira tarefa, projeto, viagem ou financeiro, e a próxima ação:\n\n${list(
        c.todos.filter((t) => t.status === 'inbox').map((t) => t.title)
      )}`
  },
  {
    key: 'week',
    label: 'Planejar a semana',
    build: (c) =>
      `Monte um plano de semana equilibrado a partir de:\n\nTarefas abertas:\n${list(
        c.todos.filter((t) => t.status !== 'done' && t.status !== 'inbox').map((t) => t.title)
      )}\n\nHábitos:\n${list(c.habitNames)}\n\nReuniões:\n${list(
        c.events.map((e) => `${e.title} (${e.startTime.slice(0, 16).replace('T', ' ')})`)
      )}`
  },
  {
    key: 'trip',
    label: 'Roteiro de viagem',
    build: (c) =>
      c.nextTrip
        ? `Crie um roteiro para uma viagem a ${c.nextTrip.destination}${
            c.nextTrip.startDate ? ` (a partir de ${c.nextTrip.startDate})` : ''
          }. Considere meu perfil: gosto de café, anime, ramen/izakaya, vida noturna e bairros caminháveis.`
        : 'Sugira um destino de viagem para alguém que gosta de café, anime, ramen/izakaya, vida noturna e bairros caminháveis.'
  }
]

export function AIPage(): React.ReactElement {
  const { todos, refresh: rT } = useTodoStore()
  const { habits, refresh: rH } = useHabitStore()
  const { upcoming, refresh: rC } = useCalendarStore()
  const { trips, refresh: rTr } = useTripStore()

  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    rT()
    rH()
    rC()
    rTr()
  }, [])

  const ctx: Ctx = {
    todos,
    habitNames: habits.map((h) => h.name),
    events: upcoming,
    nextTrip: trips[0]
  }

  async function run(text: string): Promise<void> {
    if (!text.trim()) return
    setRunning(true)
    setError('')
    setOutput('')
    try {
      const result = await window.api.ai.run(text)
      setOutput(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🤖 IA (Claude local)</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Usa o Claude Code CLI local (`claude -p`). Nada é enviado a APIs pagas diretamente.
          </p>
        </div>
      </div>

      <div className="suggested-row" style={{ marginBottom: 12 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            className="btn btn-secondary btn-sm"
            disabled={running}
            onClick={() => {
              const p = a.build(ctx)
              setPrompt(p)
              run(p)
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <textarea
        rows={4}
        placeholder="Pergunte algo ou edite o prompt gerado…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ marginTop: 8 }}>
        <button className="btn btn-primary" disabled={running || !prompt.trim()} onClick={() => run(prompt)}>
          {running ? 'Executando…' : 'Executar'}
        </button>
      </div>

      {error && (
        <div className="chart-section" style={{ marginTop: 12, borderColor: 'var(--danger)' }}>
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        </div>
      )}

      {output && (
        <div className="chart-section" style={{ marginTop: 12 }}>
          <div className="chart-title">Resposta</div>
          <pre className="ai-output">{output}</pre>
        </div>
      )}
    </div>
  )
}
