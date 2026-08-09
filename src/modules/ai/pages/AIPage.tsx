import React, { useEffect, useState } from 'react'
import { useTodoStore } from '../../todo/store/todoStore'
import { useHabitStore } from '../../habits/store/habitStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'
import { useTripStore } from '../../travel/store/tripStore'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'

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
  weekHours: string
}

const list = (items: string[]): string => items.map((t) => `- ${t}`).join('\n') || '(nenhum)'

function fmtHours(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

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
  },
  {
    key: 'weekly',
    label: 'Resumo semanal',
    build: (c) =>
      `Faça um resumo da minha semana e sugira ajustes para a próxima.\n\nHoras trabalhadas: ${c.weekHours}\n\nTarefas concluídas:\n${list(
        c.todos.filter((t) => t.status === 'done').map((t) => t.title)
      )}\n\nTarefas em aberto:\n${list(
        c.todos.filter((t) => t.status !== 'done' && t.status !== 'inbox').map((t) => t.title)
      )}\n\nHábitos monitorados:\n${list(c.habitNames)}`
  },
  {
    key: 'trip-checklist',
    label: 'Checklist de viagem',
    build: (c) =>
      c.nextTrip
        ? `Monte um checklist completo de preparação para a viagem a ${c.nextTrip.destination}${
            c.nextTrip.startDate ? ` (${c.nextTrip.startDate}${c.nextTrip.endDate ? ` a ${c.nextTrip.endDate}` : ''})` : ''
          }: documentos, bagagem, saúde/seguro, finanças/câmbio e itens específicos do destino.`
        : 'Monte um checklist genérico de preparação de viagem internacional (documentos, bagagem, saúde, finanças).'
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
  const [model, setModel] = useState('')
  const [weekMinutes, setWeekMinutes] = useState(0)

  useEffect(() => {
    rT()
    rH()
    rC()
    rTr()
    window.api.settings.get('claude_model').then((m) => setModel(m ?? ''))

    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    window.api.stats
      .daily(localDayStartISO(localDateStr(monday)), localDayEndISO(localDateStr(now)))
      .then((rows) => setWeekMinutes(rows.reduce((s, r) => s + r.totalMinutes, 0)))

    // Stream tokens into the output as they arrive.
    const off = window.api.ai.onChunk((text) => setOutput((o) => o + text))
    return off
  }, [])

  function changeModel(m: string): void {
    setModel(m)
    window.api.settings.set('claude_model', m)
  }

  const ctx: Ctx = {
    todos,
    habitNames: habits.map((h) => h.name),
    events: upcoming,
    nextTrip: trips[0],
    weekHours: fmtHours(weekMinutes)
  }

  async function run(text: string): Promise<void> {
    if (!text.trim()) return
    setRunning(true)
    setError('')
    setOutput('')
    try {
      const result = await window.api.ai.runStream(text, undefined, model)
      setOutput(result) // canonical final (trimmed), replaces the streamed buffer
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
      <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={running || !prompt.trim()} onClick={() => run(prompt)}>
          {running ? 'Executando…' : 'Executar'}
        </button>
        <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Modelo:</label>
        <select value={model} onChange={(e) => changeModel(e.target.value)} disabled={running}>
          <option value="">Padrão</option>
          <option value="sonnet">Sonnet</option>
          <option value="opus">Opus</option>
          <option value="haiku">Haiku</option>
        </select>
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
