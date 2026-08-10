import React, { useEffect, useRef, useState } from 'react'
import { useTodoStore } from '../../todo/store/todoStore'
import { useProjectStore } from '../../projects/store/projectStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'
import { localDateStr } from '../../../utils/dates'

const STATE_KEY = 'rickos:brainDump'

interface PlanTask {
  title: string
  notes: string | null
  priority: number
  dueDate: string | null
}
interface PlanProject {
  name: string
  description: string | null
}
interface PlanEvent {
  title: string
  date: string
  time: string | null
  durationMin: number | null
}
interface Plan {
  tasks: PlanTask[]
  projects: PlanProject[]
  nextSteps: string[]
  calendar: PlanEvent[]
}

const EMPTY_PLAN: Plan = { tasks: [], projects: [], nextSteps: [], calendar: [] }

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** Extract a plan JSON from Claude's (possibly fenced) text output. */
function extractPlan(raw: string): Plan | null {
  if (!raw) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    const o = JSON.parse(s) as Record<string, unknown>
    return {
      tasks: asArray<Record<string, unknown>>(o.tasks).map((t) => ({
        title: String(t.title ?? '').trim(),
        notes: t.notes ? String(t.notes) : null,
        priority: Number.isFinite(Number(t.priority)) ? Math.max(0, Math.min(3, Number(t.priority))) : 0,
        dueDate: typeof t.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : null
      })).filter((t) => t.title),
      projects: asArray<Record<string, unknown>>(o.projects).map((p) => ({
        name: String(p.name ?? '').trim(),
        description: p.description ? String(p.description) : null
      })).filter((p) => p.name),
      nextSteps: asArray<unknown>(o.nextSteps).map((s2) => String(s2).trim()).filter(Boolean),
      calendar: asArray<Record<string, unknown>>(o.calendar).map((e) => ({
        title: String(e.title ?? '').trim(),
        date: typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : localDateStr(new Date()),
        time: typeof e.time === 'string' && /^\d{2}:\d{2}$/.test(e.time) ? e.time : null,
        durationMin: Number.isFinite(Number(e.durationMin)) ? Number(e.durationMin) : null
      })).filter((e) => e.title)
    }
  } catch {
    return null
  }
}

function buildPrompt(dump: string): string {
  const today = localDateStr(new Date())
  return `Você é meu organizador pessoal. Abaixo está um "despejo mental" — tudo que está na minha cabeça agora, desorganizado. Transforme em um plano acionável.

Responda APENAS com um JSON válido (sem markdown, sem comentários, sem texto fora do JSON), exatamente neste formato:
{
  "tasks": [{ "title": string, "notes": string|null, "priority": 0|1|2|3, "dueDate": "YYYY-MM-DD"|null }],
  "projects": [{ "name": string, "description": string|null }],
  "nextSteps": [string],
  "calendar": [{ "title": string, "date": "YYYY-MM-DD", "time": "HH:MM"|null, "durationMin": number|null }]
}

Regras:
- Títulos curtos e acionáveis, começando com um verbo.
- priority: 3 = alta, 0 = nenhuma.
- Hoje é ${today}; use como referência para prazos e sugestões de agenda.
- "nextSteps": 3 a 5 primeiros passos concretos para começar já.
- "calendar": sugira blocos/eventos com data (e horário/duração quando fizer sentido).
- Agrupe temas grandes em "projects"; itens soltos viram "tasks".
- Se alguma seção não se aplica, use lista vazia.

Despejo mental:
"""
${dump}
"""`
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function BrainDumpPage(): React.ReactElement {
  const { refresh: refreshTodos } = useTodoStore()
  const { refresh: refreshProjects } = useProjectStore()
  const { refresh: refreshEvents } = useCalendarStore()

  const [text, setText] = useState('')
  const [model, setModel] = useState('')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [importing, setImporting] = useState(false)

  // 5-minute writing timer
  const [secondsLeft, setSecondsLeft] = useState(300)
  const [timerOn, setTimerOn] = useState(false)

  const runIdRef = useRef<string | null>(null)

  useEffect(() => {
    window.api.settings.get('claude_model').then((m) => setModel(m ?? ''))
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
      if (saved) {
        if (typeof saved.text === 'string') setText(saved.text)
        if (typeof saved.output === 'string') setOutput(saved.output)
        if (saved.plan) setPlan(saved.plan)
        if (typeof saved.runId === 'string') {
          runIdRef.current = saved.runId
          setRunning(true)
          window.api.ai.getRun(saved.runId).then((r) => {
            if (!r) {
              runIdRef.current = null
              setRunning(false)
            } else if (r.status === 'running') {
              setOutput(r.output)
            } else {
              runIdRef.current = null
              setRunning(false)
              finalize(r.output, r.error)
            }
          })
        }
      }
    } catch {
      // ignore
    }

    const offChunk = window.api.ai.onChunk((rid, chunk) => {
      if (rid && rid === runIdRef.current) setOutput((o) => o + chunk)
    })
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output: out, error: err }) => {
      if (rid !== runIdRef.current) return
      runIdRef.current = null
      setRunning(false)
      finalize(out, ok ? null : err)
    })
    return () => {
      offChunk()
      offDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // persist text/output/plan/runId
  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify({ text, output, plan, runId: runIdRef.current }))
  }, [text, output, plan])

  // countdown
  useEffect(() => {
    if (!timerOn || secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [timerOn, secondsLeft])

  function finalize(out: string, err: string | null): void {
    if (err) {
      setError(err)
      return
    }
    const parsed = extractPlan(out)
    if (!parsed) {
      setError('Não consegui interpretar o plano gerado. Tente novamente (a IA não devolveu um JSON válido).')
      return
    }
    setPlan(parsed)
    setExcluded(new Set())
    setError('')
  }

  async function generate(): Promise<void> {
    if (!text.trim() || running) return
    setError('')
    setOutput('')
    setPlan(null)
    setRunning(true)
    try {
      const rid = await window.api.ai.start({ prompt: buildPrompt(text), model, save: false })
      runIdRef.current = rid
      // persist immediately so a reload can reconnect
      localStorage.setItem(STATE_KEY, JSON.stringify({ text, output: '', plan: null, runId: rid }))
    } catch (e) {
      setRunning(false)
      runIdRef.current = null
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function cancel(): Promise<void> {
    if (runIdRef.current) await window.api.ai.cancel(runIdRef.current)
  }

  function toggle(key: string): void {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const isOn = (key: string): boolean => !excluded.has(key)

  function flash(m: string): void {
    setToast(m)
    setTimeout(() => setToast(''), 2500)
  }

  async function importPlan(): Promise<void> {
    if (!plan || importing) return
    setImporting(true)
    let nT = 0
    let nP = 0
    let nE = 0
    try {
      for (let i = 0; i < plan.tasks.length; i++) {
        if (!isOn(`task:${i}`)) continue
        const t = plan.tasks[i]
        await window.api.todos.create(t.title, t.notes, 'todo', 'braindump', t.priority, t.dueDate, null)
        nT++
      }
      for (let i = 0; i < plan.nextSteps.length; i++) {
        if (!isOn(`step:${i}`)) continue
        await window.api.todos.create(plan.nextSteps[i], 'Próximo passo (brain dump)', 'todo', 'braindump', 2, null, null)
        nT++
      }
      for (let i = 0; i < plan.projects.length; i++) {
        if (!isOn(`proj:${i}`)) continue
        const p = plan.projects[i]
        await window.api.projects.create(p.name, p.description, null, '#6366f1', null)
        nP++
      }
      for (let i = 0; i < plan.calendar.length; i++) {
        if (!isOn(`cal:${i}`)) continue
        const e = plan.calendar[i]
        const start = new Date(`${e.date}T${e.time ?? '09:00'}:00`)
        const dur = e.durationMin && e.durationMin > 0 ? e.durationMin : 60
        const end = new Date(start.getTime() + dur * 60000)
        await window.api.calendar.create(e.title, start.toISOString(), end.toISOString(), null)
        nE++
      }
      await Promise.all([refreshTodos(), refreshProjects(), refreshEvents()])
      flash(`Importado: ${nT} tarefas · ${nP} projetos · ${nE} eventos`)
      setPlan(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  function reset(): void {
    setText('')
    setOutput('')
    setPlan(null)
    setError('')
    setSecondsLeft(300)
    setTimerOn(false)
    localStorage.removeItem(STATE_KEY)
  }

  const totalSelected = plan
    ? plan.tasks.filter((_, i) => isOn(`task:${i}`)).length +
      plan.nextSteps.filter((_, i) => isOn(`step:${i}`)).length +
      plan.projects.filter((_, i) => isOn(`proj:${i}`)).length +
      plan.calendar.filter((_, i) => isOn(`cal:${i}`)).length
    : 0

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🧠 Despejar minha cabeça</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Escreva por ~5 minutos tudo o que está pensando. A IA transforma em tarefas, projetos,
            próximos passos e agenda sugerida.
          </p>
        </div>
        {toast && <span className="badge-hot" style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)' }}>{toast}</span>}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: secondsLeft === 0 ? 'var(--success)' : 'var(--text-primary)' }}>
          ⏱ {fmtClock(secondsLeft)}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => setTimerOn((v) => !v)}>
          {timerOn ? 'Pausar' : secondsLeft === 300 ? 'Iniciar 5 min' : 'Retomar'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => { setSecondsLeft(300); setTimerOn(false) }}>
          Zerar timer
        </button>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>Modelo:</label>
        <select value={model} onChange={(e) => { setModel(e.target.value); window.api.settings.set('claude_model', e.target.value) }}>
          <option value="">Padrão</option>
          <option value="sonnet">Sonnet</option>
          <option value="opus">Opus</option>
          <option value="haiku">Haiku</option>
        </select>
      </div>

      <textarea
        rows={12}
        placeholder="Despeje tudo aqui — tarefas soltas, ideias, preocupações, projetos, prazos… sem se preocupar com organização."
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (!timerOn && secondsLeft === 300 && e.target.value.length === 1) setTimerOn(true)
        }}
        style={{ width: '100%', resize: 'vertical', fontSize: 14, lineHeight: 1.5 }}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
        {running ? (
          <button className="btn btn-danger" onClick={cancel}>⏹ Cancelar</button>
        ) : (
          <button className="btn btn-primary" disabled={!text.trim()} onClick={generate}>
            ✨ Transformar em plano
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={reset} disabled={running}>Limpar</button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{text.trim().length} caracteres</span>
      </div>

      {error && <div className="chart-section" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}><div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div></div>}

      {running && (
        <div className="chart-section" style={{ marginBottom: 12 }}>
          <div className="chart-title">Organizando… 🤔</div>
          <pre className="ai-output" style={{ maxHeight: 180 }}>{output || '…'}</pre>
        </div>
      )}

      {plan && !running && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={importPlan} disabled={importing || totalSelected === 0}>
              {importing ? 'Importando…' : `✓ Importar selecionados (${totalSelected})`}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={generate}>↻ Gerar de novo</button>
          </div>

          <PlanSection title="✅ Tarefas" empty="Nenhuma tarefa.">
            {plan.tasks.map((t, i) => (
              <label key={i} className="list-row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={isOn(`task:${i}`)} onChange={() => toggle(`task:${i}`)} />
                <span className="list-row-title">
                  {t.title}
                  {t.notes && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>📝 {t.notes}</span>}
                </span>
                {t.priority > 0 && <span className="project-chip">P{t.priority}</span>}
                {t.dueDate && <span className="due-badge due-future">{t.dueDate}</span>}
              </label>
            ))}
          </PlanSection>

          <PlanSection title="👣 Próximos passos" empty="Nenhum próximo passo.">
            {plan.nextSteps.map((s, i) => (
              <label key={i} className="list-row">
                <input type="checkbox" checked={isOn(`step:${i}`)} onChange={() => toggle(`step:${i}`)} />
                <span className="list-row-title">{s}</span>
              </label>
            ))}
          </PlanSection>

          <PlanSection title="📁 Projetos" empty="Nenhum projeto.">
            {plan.projects.map((p, i) => (
              <label key={i} className="list-row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={isOn(`proj:${i}`)} onChange={() => toggle(`proj:${i}`)} />
                <span className="list-row-title">
                  {p.name}
                  {p.description && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{p.description}</span>}
                </span>
              </label>
            ))}
          </PlanSection>

          <PlanSection title="📅 Agenda sugerida" empty="Nenhum evento sugerido.">
            {plan.calendar.map((e, i) => (
              <label key={i} className="list-row">
                <input type="checkbox" checked={isOn(`cal:${i}`)} onChange={() => toggle(`cal:${i}`)} />
                <span className="list-row-title">{e.title}</span>
                <span className="due-badge due-future">
                  {e.date}{e.time ? ` ${e.time}` : ''}{e.durationMin ? ` · ${e.durationMin}min` : ''}
                </span>
              </label>
            ))}
          </PlanSection>
        </>
      )}
    </div>
  )
}

function PlanSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }): React.ReactElement {
  const arr = React.Children.toArray(children)
  return (
    <div className="chart-section" style={{ marginBottom: 12 }}>
      <div className="chart-title">{title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({arr.length})</span></div>
      <div className="list-stack" style={{ marginTop: 8 }}>
        {arr.length === 0 ? <div className="empty-hint">{empty}</div> : children}
      </div>
    </div>
  )
}
