import React, { useEffect, useState } from 'react'
import type { Project } from '../../../types'
import { useProjectStore } from '../store/projectStore'
import { WEEKDAYS, parseWorkDays } from '../lib/constants'

/** "Terça e quinta: apostas lol" — dias fixos do projeto + bloco recorrente no Google Calendar. */
export function ScheduleEditor({ project }: { project: Project }): React.ReactElement {
  const { refresh } = useProjectStore()
  const [days, setDays] = useState<number[]>(parseWorkDays(project.workDays))
  const [start, setStart] = useState(project.workStart ?? '19:00')
  const [minutes, setMinutes] = useState(project.workMinutes ?? 120)
  const [calendar, setCalendar] = useState(!!project.calendarEventId)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setDays(parseWorkDays(project.workDays))
    setStart(project.workStart ?? '19:00')
    setMinutes(project.workMinutes ?? 120)
    setCalendar(!!project.calendarEventId)
  }, [project.id])

  async function save(): Promise<void> {
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const r = await window.api.projects.setSchedule(project.id, days, days.length ? start : null, days.length ? minutes : null, calendar || !!project.calendarEventId)
      await refresh()
      setMsg(calendar && days.length ? (r.eventLink ? 'Salvo e agendado no Google Calendar.' : 'Salvo no Google Calendar.') : 'Salvo.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (d: number): void => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())

  return (
    <div className="ph-panel">
      <div className="ph-panel-title">📅 Dias do projeto</div>
      <div className="ph-days">
        {WEEKDAYS.map((w, i) => (
          <button key={i} className={days.includes(i) ? 'active' : ''} onClick={() => toggle(i)} aria-pressed={days.includes(i)} title={w.long}>
            {w.short}
          </button>
        ))}
      </div>
      {days.length > 0 && (
        <div className="ph-row">
          <label className="ph-muted">
            às <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="ph-muted">
            por{' '}
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[30, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>{m >= 60 ? `${m / 60}h` : `${m} min`}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="ph-check">
        <input type="checkbox" checked={calendar} onChange={() => setCalendar((v) => !v)} />
        <span>Bloco recorrente no Google Calendar{project.calendarEventId ? ' (agendado)' : ''}</span>
      </label>
      <div className="ph-btnrow">
        <button className="btn btn-secondary btn-sm" onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar dias'}</button>
      </div>
      {msg && <div className="ph-ok">{msg}</div>}
      {error && <div className="ph-error">{error}</div>}
      <div className="ph-muted">Menos troca de contexto: nesses dias o projeto aparece em destaque na Home.</div>
    </div>
  )
}
