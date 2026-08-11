import React, { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../../../store/uiStore'
import { renderMarkdown } from '../../estudos/markdown'
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates'

interface Step {
  key: string
  title: string
  hint: string
  goto?: string
  build: () => Promise<{ summary: string; prompt: string }>
}

export function WeeklyReviewPage(): React.ReactElement {
  const { setPage } = useUIStore()
  const [idx, setIdx] = useState(0)
  const [draft, setDraft] = useState('')
  const [summary, setSummary] = useState('')
  const [running, setRunning] = useState(false)
  const runId = useRef<string | null>(null)

  const today = localDateStr(new Date())

  const steps: Step[] = [
    {
      key: 'inbox',
      title: '1. Inbox zero',
      hint: 'Processe cada item do inbox: vira TODO, é feito na hora, ou some.',
      goto: 'inbox',
      build: async () => {
        const todos = await window.api.todos.getAll()
        const inbox = todos.filter((t) => t.status === 'inbox')
        const summary = `${inbox.length} itens no inbox:\n${inbox.map((t) => `- ${t.title}`).join('\n') || '(vazio 🎉)'}`
        return {
          summary,
          prompt: `Sou eu na minha revisão semanal. Ajude a esvaziar meu inbox: para cada item, sugira uma ação curta (virar tarefa com prazo, delegar, fazer agora <2min, ou descartar). Itens:\n${inbox.map((t) => `- ${t.title}`).join('\n') || '(vazio)'}`
        }
      }
    },
    {
      key: 'zombies',
      title: '2. TODOs zumbis',
      hint: 'Tarefas abertas antigas: reescreva, reagende ou mate.',
      goto: 'todo',
      build: async () => {
        const todos = await window.api.todos.getAll()
        const cutoff = Date.now() - 14 * 86400000
        const zombies = todos.filter((t) => t.status !== 'done' && t.status !== 'inbox' && new Date(t.createdAt).getTime() < cutoff)
        const summary = `${zombies.length} tarefas abertas há +14 dias:\n${zombies.map((t) => `- ${t.title}`).join('\n') || '(nenhuma 🎉)'}`
        return {
          summary,
          prompt: `Estas tarefas estão abertas há mais de 2 semanas (zumbis). Para cada uma, diga sem rodeios: reescrever menor, reagendar, ou matar — e por quê. Tarefas:\n${zombies.map((t) => `- ${t.title}`).join('\n') || '(nenhuma)'}`
        }
      }
    },
    {
      key: 'habits',
      title: '3. Hábitos da semana',
      hint: 'Como foi a consistência? O que ajustar?',
      goto: 'habits',
      build: async () => {
        const habits = await window.api.habits.getAll()
        const from = localDateStr(new Date(Date.now() - 6 * 86400000))
        const entries = await window.api.habits.getEntriesRange(from, today)
        const done = new Set(entries.map((e) => `${e.habitId}|${e.date}`))
        const lines = habits
          .filter((h) => h.active === 1)
          .map((h) => {
            let n = 0
            for (let i = 0; i < 7; i++) {
              const d = localDateStr(new Date(Date.now() - i * 86400000))
              if (done.has(`${h.id}|${d}`)) n++
            }
            return `- ${h.name}: ${n}/7`
          })
        const summary = `Consistência (últimos 7 dias):\n${lines.join('\n') || '(sem hábitos)'}`
        return {
          summary,
          prompt: `Minha consistência de hábitos na última semana:\n${lines.join('\n') || '(sem hábitos)'}\n\nDiga o que está indo bem, o hábito mais frágil, e 1 ajuste concreto para a próxima semana.`
        }
      }
    },
    {
      key: 'finance',
      title: '4. Finanças do mês',
      hint: 'Gastos vs. orçamento — algum ponto de atenção?',
      goto: 'finance-dashboard',
      build: async () => {
        const month = today.slice(0, 7)
        const [txs, budgets] = await Promise.all([window.api.transactions.getAll(month), window.api.budgets.getForMonth(month)])
        const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
        const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const budget = budgets.reduce((s, b) => s + b.amount, 0)
        const summary = `Mês ${month}: receitas ${income.toFixed(0)} · gastos ${expense.toFixed(0)} · orçamento ${budget.toFixed(0)}`
        return {
          summary,
          prompt: `Minhas finanças do mês: receitas ${income.toFixed(0)}, gastos ${expense.toFixed(0)}, orçamento total ${budget.toFixed(0)}. Faça uma leitura rápida (estou no caminho?) e 1-2 sugestões objetivas.`
        }
      }
    },
    {
      key: 'plan',
      title: '5. Plano da semana',
      hint: 'A IA monta um plano com base em tudo acima.',
      build: async () => {
        const todos = await window.api.todos.getAll()
        const open = todos.filter((t) => t.status !== 'done' && t.status !== 'inbox')
        const events = await window.api.calendar.range(localDayStartISO(today), localDayEndISO(localDateStr(new Date(Date.now() + 6 * 86400000))))
        const summary = `${open.length} tarefas abertas · ${events.length} eventos nos próximos 7 dias.`
        return {
          summary,
          prompt: `Monte meu plano para a próxima semana. Tarefas abertas (priorize):\n${open.slice(0, 20).map((t) => `- ${t.title}${t.dueDate ? ` (prazo ${t.dueDate})` : ''}`).join('\n')}\n\nEventos:\n${events.map((e) => `- ${e.title} (${e.startTime.slice(0, 16).replace('T', ' ')})`).join('\n') || '(nenhum)'}\n\nDê um plano realista por dia (seg-dom), com os 3 focos da semana no topo.`
        }
      }
    }
  ]

  const step = steps[idx]

  useEffect(() => {
    const offChunk = window.api.ai.onChunk((rid, text) => {
      if (rid && rid === runId.current) setDraft((d) => d + text)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error }) => {
      if (rid !== runId.current) return
      runId.current = null
      setRunning(false)
      setDraft(ok ? output : error || 'Falha.')
    })
    return () => {
      offChunk()
      offDone()
    }
  }, [])

  // load the step's summary whenever the step changes
  useEffect(() => {
    setDraft('')
    setSummary('carregando…')
    step.build().then(({ summary }) => setSummary(summary))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  async function generate(): Promise<void> {
    setRunning(true)
    setDraft('')
    const { prompt } = await step.build()
    const model = (await window.api.settings.get('claude_model')) ?? ''
    runId.current = await window.api.ai.start({ prompt, model, save: false })
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🗓️ Revisão semanal</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ritual guiado — a IA chega com o rascunho de cada etapa.</p>
        </div>
        <span className="project-chip">Etapa {idx + 1}/{steps.length}</span>
      </div>

      <div className="bar-track" style={{ marginBottom: 12 }}>
        <div className="bar-fill" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
      </div>

      <div className="chart-section">
        <div className="chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{step.title}</span>
          {step.goto && <button className="btn btn-secondary btn-sm" onClick={() => setPage(step.goto as never)}>Abrir módulo →</button>}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' }}>{step.hint}</p>
        <pre className="ai-output" style={{ maxHeight: 160 }}>{summary}</pre>
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={running}>
            {running ? 'Pensando…' : draft ? '↻ Gerar de novo' : '✨ Rascunho da IA'}
          </button>
        </div>
        {(running || draft) && (
          <div className="md-preview-pane" style={{ marginTop: 10, minHeight: 0 }}>
            {draft ? renderMarkdown(draft) : <div className="empty-hint">…</div>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>← Anterior</button>
        {idx < steps.length - 1 ? (
          <button className="btn btn-primary btn-sm" onClick={() => setIdx((i) => i + 1)}>Próxima →</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setPage('home')}>Concluir ✓</button>
        )}
      </div>
    </div>
  )
}
