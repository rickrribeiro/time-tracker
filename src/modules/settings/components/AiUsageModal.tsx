import React, { useEffect, useMemo, useState } from 'react'
import type { AiUsage } from '../../../types'

/** Rótulos dos módulos que disparam o Claude CLI (chave = `source` gravada no servidor). */
const SOURCE_LABELS: Record<string, string> = {
  assistente: '🤖 Assistente',
  'prompt-runner': '🧪 Prompt Runner',
  estudos: '📚 Estudos',
  home: '🏠 Home (standup)',
  projetos: '📁 Projetos',
  github: '🐙 GitHub (issues)',
  braindump: '🧠 Brain Dump',
  crm: '👥 CRM',
  viagens: '🏨 Viagens',
  revisao: '🗓️ Revisão semanal',
  agendador: '⏰ Agendador',
  inbox: '📥 Inbox (OCR)',
  outro: '• Outro'
}
const sourceLabel = (s: string): string => SOURCE_LABELS[s] ?? s

type Preset = 'today' | '7d' | 'month' | 'lastMonth' | 'custom'
const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: 'month', label: 'Este mês' },
  { key: 'lastMonth', label: 'Mês passado' },
  { key: 'custom', label: 'Período' }
]

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function presetRange(p: Preset): { from: string; to: string } {
  const n = new Date()
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  if (p === 'today') return { from: ymd(today), to: ymd(today) }
  if (p === '7d') return { from: ymd(new Date(today.getTime() - 6 * 86400000)), to: ymd(today) }
  if (p === 'lastMonth') {
    return { from: ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: ymd(new Date(n.getFullYear(), n.getMonth(), 0)) }
  }
  return { from: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to: ymd(today) }
}

/** Local YYYY-MM-DD → ISO no início do dia local (fim = dia seguinte, exclusivo). */
function dayStartIso(day: string, plusDays = 0): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d + plusDays).toISOString()
}

const fmtTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n)
const fmtUsd = (n: number): string => `US$ ${n.toFixed(n >= 10 ? 2 : 3)}`
const fmtWhen = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const inTokens = (r: AiUsage): number => r.inputTokens + r.cacheCreationTokens
const totalTokens = (r: AiUsage): number => r.inputTokens + r.cacheCreationTokens + r.cacheReadTokens + r.outputTokens

interface Group {
  key: string
  source: string
  projectName: string | null
  projectColor: string | null
  runs: number
  input: number
  cacheRead: number
  output: number
  total: number
  cost: number
}

/** Tela (modal) com o consumo de tokens do Claude CLI por módulo e projeto. */
export function AiUsageModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState(presetRange('month').from)
  const [to, setTo] = useState(presetRange('month').to)
  const [rows, setRows] = useState<AiUsage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState('')
  const [project, setProject] = useState('')
  const [view, setView] = useState<'grouped' | 'runs'>('grouped')

  function pickPreset(p: Preset): void {
    setPreset(p)
    if (p !== 'custom') {
      const r = presetRange(p)
      setFrom(r.from)
      setTo(r.to)
    }
  }

  useEffect(() => {
    if (!from || !to) return
    let alive = true
    setLoading(true)
    setError('')
    window.api.ai
      .usage(dayStartIso(from), dayStartIso(to, 1))
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [from, to])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const projectKey = (r: AiUsage): string => (r.projectId == null ? '-' : String(r.projectId))
  const sources = useMemo(() => [...new Set(rows.map((r) => r.source))].sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b))), [rows])
  const projects = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) m.set(projectKey(r), r.projectName ?? (r.projectId == null ? 'Sem projeto' : `#${r.projectId}`))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = useMemo(
    () => rows.filter((r) => (!source || r.source === source) && (!project || projectKey(r) === project)),
    [rows, source, project]
  )

  const groups = useMemo(() => {
    const m = new Map<string, Group>()
    for (const r of filtered) {
      const key = `${r.source}|${projectKey(r)}`
      const g =
        m.get(key) ??
        { key, source: r.source, projectName: r.projectName, projectColor: r.projectColor, runs: 0, input: 0, cacheRead: 0, output: 0, total: 0, cost: 0 }
      g.runs++
      g.input += inTokens(r)
      g.cacheRead += r.cacheReadTokens
      g.output += r.outputTokens
      g.total += totalTokens(r)
      g.cost += r.costUsd
      m.set(key, g)
    }
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [filtered])

  const totals = useMemo(
    () =>
      filtered.reduce(
        (t, r) => ({ runs: t.runs + 1, tokens: t.tokens + totalTokens(r), output: t.output + r.outputTokens, cost: t.cost + r.costUsd }),
        { runs: 0, tokens: 0, output: 0, cost: 0 }
      ),
    [filtered]
  )

  const projectCell = (name: string | null, color: string | null): React.ReactNode =>
    name ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color ?? 'var(--accent)', flexShrink: 0 }} />
        {name}
      </span>
    ) : (
      <span style={{ color: 'var(--text-muted)' }}>—</span>
    )

  const num: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(980px, calc(100vw - 24px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ margin: 0 }}>📊 Uso de tokens da IA</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Fechar</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          Execuções do Claude CLI disparadas pelo rickOS, com os tokens reportados pelo próprio CLI. O custo é a
          estimativa do CLI em preço de API (numa assinatura, serve como medida de consumo).
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {PRESETS.map((p) => (
            <button key={p.key} className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => pickPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div className="editor-field" style={{ flex: '1 1 120px', margin: 0 }}>
            <label>De</label>
            <input type="date" value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }} />
          </div>
          <div className="editor-field" style={{ flex: '1 1 120px', margin: 0 }}>
            <label>Até</label>
            <input type="date" value={to} min={from} onChange={(e) => { setPreset('custom'); setTo(e.target.value) }} />
          </div>
          <div className="editor-field" style={{ flex: '1 1 160px', margin: 0 }}>
            <label>Módulo</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Todos</option>
              {sources.map((s) => (
                <option key={s} value={s}>{sourceLabel(s)}</option>
              ))}
            </select>
          </div>
          <div className="editor-field" style={{ flex: '1 1 160px', margin: 0 }}>
            <label>Projeto</label>
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">Todos</option>
              {projects.map(([k, name]) => (
                <option key={k} value={k}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Execuções', value: String(totals.runs) },
            { label: 'Tokens (total)', value: fmtTokens(totals.tokens) },
            { label: 'Tokens de saída', value: fmtTokens(totals.output) },
            { label: 'Custo estimado', value: fmtUsd(totals.cost) }
          ].map((t) => (
            <div key={t.label} style={{ flex: '1 1 120px', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg-tertiary)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{t.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button className={`btn btn-sm ${view === 'grouped' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('grouped')}>Por módulo/projeto</button>
          <button className={`btn btn-sm ${view === 'runs' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('runs')}>Execuções</button>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
        {loading && rows.length === 0 ? (
          <div className="empty-hint">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-hint">Nenhuma execução registrada nesse período.</div>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {view === 'grouped' ? (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    <th>Projeto</th>
                    <th style={num}>Execuções</th>
                    <th style={num}>Entrada</th>
                    <th style={num}>Cache lido</th>
                    <th style={num}>Saída</th>
                    <th style={num}>Total</th>
                    <th style={num}>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key}>
                      <td style={{ whiteSpace: 'nowrap' }}>{sourceLabel(g.source)}</td>
                      <td>{projectCell(g.projectName, g.projectColor)}</td>
                      <td style={num}>{g.runs}</td>
                      <td style={num}>{fmtTokens(g.input)}</td>
                      <td style={num}>{fmtTokens(g.cacheRead)}</td>
                      <td style={num}>{fmtTokens(g.output)}</td>
                      <td style={{ ...num, fontWeight: 600 }}>{fmtTokens(g.total)}</td>
                      <td style={num}>{fmtUsd(g.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Módulo</th>
                    <th>Projeto</th>
                    <th>Modelo</th>
                    <th style={num}>Entrada</th>
                    <th style={num}>Cache lido</th>
                    <th style={num}>Saída</th>
                    <th style={num}>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtWhen(r.createdAt)}{r.isError ? ' ⚠️' : ''}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{sourceLabel(r.source)}</td>
                      <td>{projectCell(r.projectName, r.projectColor)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.model ?? '—'}</td>
                      <td style={num}>{fmtTokens(inTokens(r))}</td>
                      <td style={num}>{fmtTokens(r.cacheReadTokens)}</td>
                      <td style={num}>{fmtTokens(r.outputTokens)}</td>
                      <td style={num}>{fmtUsd(r.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
