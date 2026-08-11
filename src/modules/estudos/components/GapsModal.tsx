import React, { useEffect, useRef, useState } from 'react'
import { StudyTopic, StudyNode } from '../../../types'
import { useStudyStore } from '../store/studyStore'

interface Gap {
  title: string
  reason: string
}

function extractGaps(raw: string): Gap[] | null {
  if (!raw) return null
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('[')
  const last = s.lastIndexOf(']')
  if (first >= 0 && last > first) s = s.slice(first, last + 1)
  try {
    const v = JSON.parse(s)
    if (!Array.isArray(v)) return null
    return v
      .map((g: Record<string, unknown>) => ({ title: String(g.title ?? '').trim(), reason: String(g.reason ?? '').trim() }))
      .filter((g) => g.title)
  } catch {
    return null
  }
}

/** Renders the roadmap tree as an indented outline for the prompt. */
function outline(nodes: StudyNode[]): string {
  const byParent = new Map<number | null, StudyNode[]>()
  for (const n of nodes) {
    const k = n.parentId ?? null
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(n)
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
  const lines: string[] = []
  const walk = (pid: number | null, depth: number): void => {
    for (const n of byParent.get(pid) ?? []) {
      lines.push(`${'  '.repeat(depth)}- ${n.title}${n.status === 'done' ? ' (concluído)' : ''}`)
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return lines.join('\n') || '(roadmap vazio)'
}

export function GapsModal({ topic, onClose }: { topic: StudyTopic; onClose: () => void }): React.ReactElement {
  const { nodes, createNode, refreshActive } = useStudyStore()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [gaps, setGaps] = useState<Gap[]>([])
  const [added, setAdded] = useState<Set<number>>(new Set())
  const runId = useRef<string | null>(null)

  useEffect(() => {
    const offDone = window.api.ai.onDone(({ runId: rid, ok, output, error: err }) => {
      if (rid !== runId.current) return
      runId.current = null
      setBusy(false)
      if (!ok) return setError(err || 'Falha ao analisar.')
      const g = extractGaps(output)
      if (!g || !g.length) return setError('Nenhuma lacuna detectada (ou resposta inválida).')
      setGaps(g)
    })
    ;(async () => {
      const m = (await window.api.settings.get('claude_model')) ?? ''
      const prompt = `Você é um mentor de estudos. Abaixo está o roadmap do tópico "${topic.name}".
Analise a sequência e aponte PRÉ-REQUISITOS ou tópicos importantes que estão FALTANDO (lacunas) para dominar o assunto — coisas que não aparecem no roadmap mas deveriam.

Responda APENAS com JSON válido (sem markdown), um array:
[{ "title": "item faltando", "reason": "por que é importante / onde encaixa" }]
Regras: 3 a 8 itens; títulos curtos e acionáveis; não repita itens que já estão no roadmap.

Roadmap atual:
${outline(nodes)}`
      try {
        runId.current = await window.api.ai.start({ prompt, model: m, save: false })
      } catch (e) {
        setBusy(false)
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return offDone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addAsNode(i: number): Promise<void> {
    await createNode(null, gaps[i].title) // add as a root roadmap node
    setAdded((prev) => new Set(prev).add(i))
    await refreshActive()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 440, maxWidth: 600 }}>
        <h2>🕳️ Lacunas do roadmap — {topic.name}</h2>
        {busy && <div className="empty-hint" style={{ padding: 24 }}>Analisando o roadmap com IA…</div>}
        {error && <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>}
        {!busy && gaps.length > 0 && (
          <div className="list-stack" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {gaps.map((g, i) => (
              <div key={i} className="list-row" style={{ alignItems: 'flex-start' }}>
                <span className="list-row-title" style={{ whiteSpace: 'normal' }}>
                  <strong>{g.title}</strong>
                  {g.reason && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{g.reason}</span>}
                </span>
                <button className="btn btn-secondary btn-sm" onClick={() => addAsNode(i)} disabled={added.has(i)}>
                  {added.has(i) ? '✓ Adicionado' : '+ Roadmap'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
