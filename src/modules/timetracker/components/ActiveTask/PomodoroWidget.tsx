import React, { useEffect, useRef, useState } from 'react'
import { useTaskStore } from '../../store/taskStore'
import { useTagStore } from '../../store/tagStore'

const STATE_KEY = 'rickos:pomodoro'
const IDLE_TAG_ID = 1 // seeded default/Idle tag

type Phase = 'idle' | 'work' | 'break'

interface PomoState {
  phase: Phase
  endsAt: number // ms epoch
  title: string
  tagId: number | null
  cycles: number
}

function loadState(): PomoState {
  try {
    const v = JSON.parse(localStorage.getItem(STATE_KEY) || 'null')
    if (v && typeof v === 'object') return { phase: v.phase ?? 'idle', endsAt: v.endsAt ?? 0, title: v.title ?? '', tagId: v.tagId ?? null, cycles: v.cycles ?? 0 }
  } catch {
    // ignore
  }
  return { phase: 'idle', endsAt: 0, title: '', tagId: null, cycles: 0 }
}

function notify(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') new Notification(title, { body })
    else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => p === 'granted' && new Notification(title, { body }))
  } catch {
    // ignore
  }
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Pomodoro that drives the real active task: starting a focus session creates the
 * task on the timeline (grows live); when the timer ends the task is stopped
 * (block finalized). Breaks run as a "Pausa" Idle task to keep the timeline
 * continuous. State persists so it survives navigation/reload.
 */
export function PomodoroWidget(): React.ReactElement {
  const { activeTask, startTask, stopActiveTask } = useTaskStore()
  const { tags } = useTagStore()

  const [open, setOpen] = useState(false)
  const [workMin, setWorkMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [st, setSt] = useState<PomoState>(loadState)
  const [now, setNow] = useState(Date.now())
  const advancing = useRef(false)

  // load durations from settings
  useEffect(() => {
    window.api.settings.get('pomodoro_work_minutes').then((v) => { const n = parseInt(v || ''); if (n > 0) setWorkMin(n) })
    window.api.settings.get('pomodoro_break_minutes').then((v) => { const n = parseInt(v || ''); if (n > 0) setBreakMin(n) })
  }, [])

  // persist state
  useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify(st))
  }, [st])

  // 1s tick
  useEffect(() => {
    if (st.phase === 'idle') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [st.phase])

  // if the user stopped the task manually while a session was running, reset
  useEffect(() => {
    if (st.phase !== 'idle' && !activeTask) setSt((s) => ({ ...s, phase: 'idle', endsAt: 0 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask])

  // phase expiry
  useEffect(() => {
    if (st.phase === 'idle' || now < st.endsAt || advancing.current) return
    advancing.current = true
    ;(async () => {
      if (st.phase === 'work') {
        await stopActiveTask()
        notify('🍅 Foco concluído!', 'Hora da pausa.')
        await startTask('Pausa ☕', IDLE_TAG_ID, null)
        setSt((s) => ({ ...s, phase: 'break', endsAt: Date.now() + breakMin * 60000, cycles: s.cycles + 1 }))
      } else {
        await stopActiveTask()
        notify('☕ Pausa acabou', 'Pronto para o próximo foco?')
        setSt((s) => ({ ...s, phase: 'idle', endsAt: 0 }))
      }
      advancing.current = false
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, st.phase, st.endsAt])

  async function startWork(): Promise<void> {
    const title = st.title.trim() || 'Foco'
    await window.api.settings.set('pomodoro_work_minutes', String(workMin))
    await window.api.settings.set('pomodoro_break_minutes', String(breakMin))
    await startTask(title, st.tagId, null)
    setSt((s) => ({ ...s, phase: 'work', endsAt: Date.now() + workMin * 60000, title }))
    setOpen(true)
  }

  async function skip(): Promise<void> {
    setNow(Date.now())
    setSt((s) => ({ ...s, endsAt: Date.now() - 1 })) // trigger expiry handler
  }

  async function stopAll(): Promise<void> {
    setSt((s) => ({ ...s, phase: 'idle', endsAt: 0 }))
    if (activeTask) await stopActiveTask()
  }

  const remaining = st.phase === 'idle' ? 0 : st.endsAt - now
  const running = st.phase !== 'idle'

  return (
    <div className="pomodoro-widget">
      <button
        className={`btn btn-sm ${running ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setOpen((o) => !o)}
        title="Pomodoro"
      >
        🍅 {running ? `${st.phase === 'work' ? 'Foco' : 'Pausa'} ${fmt(remaining)}` : 'Pomodoro'}
      </button>

      {open && (
        <div className="pomodoro-panel">
          {!running ? (
            <>
              <div className="editor-field">
                <label>Foco em</label>
                <input value={st.title} placeholder="O que vai focar?" onChange={(e) => setSt((s) => ({ ...s, title: e.target.value }))} />
              </div>
              <div className="editor-field">
                <label>Tag</label>
                <select value={st.tagId ?? ''} onChange={(e) => setSt((s) => ({ ...s, tagId: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">Nenhuma</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="editor-row">
                <div className="editor-field">
                  <label>Foco (min)</label>
                  <input type="number" min={1} value={workMin} onChange={(e) => setWorkMin(Number(e.target.value) || 25)} />
                </div>
                <div className="editor-field">
                  <label>Pausa (min)</label>
                  <input type="number" min={1} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value) || 5)} />
                </div>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={startWork}>▶ Iniciar foco</button>
              {st.cycles > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>🍅 {st.cycles} ciclos hoje</div>}
            </>
          ) : (
            <>
              <div className="pomodoro-count">{fmt(remaining)}</div>
              <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {st.phase === 'work' ? `🍅 Foco: ${st.title}` : '☕ Pausa'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={skip}>Pular</button>
                <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={stopAll}>Parar</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
