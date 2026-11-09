import type { Project, ProjectMilestone, ProjectOverview, Todo } from '../../../types'
import { statusLabel, stageLabel, fmtMinutes } from './constants'

/** Roda o Claude local e devolve o primeiro objeto/array JSON da resposta. */
export async function runJson<T>(prompt: string, source = 'projetos'): Promise<T> {
  const out = await window.api.ai.run(
    `${prompt}\n\nResponda APENAS com JSON válido, sem texto antes ou depois, sem cercas de código.`,
    undefined,
    undefined,
    source
  )
  const text = String(out ?? '')
  const start = text.search(/[[{]/)
  if (start < 0) throw new Error('A IA não devolveu JSON.')
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  const end = text.lastIndexOf(close)
  if (end <= start) throw new Error('JSON incompleto na resposta da IA.')
  return JSON.parse(text.slice(start, end + 1)) as T
}

/** Texto livre (markdown) do Claude local. */
export async function runText(prompt: string, source = 'projetos'): Promise<string> {
  const out = await window.api.ai.run(prompt, undefined, undefined, source)
  return String(out ?? '').trim()
}

/** Contexto compacto de um projeto para prompts. */
export async function projectContext(p: Project, ov?: ProjectOverview | null): Promise<string> {
  const [milestones, todos, events, commits, tasks] = await Promise.all([
    window.api.milestones.getAll(),
    window.api.todos.getAll(),
    window.api.projects.events(p.id, 25),
    window.api.projects.commits(p.id, 15).catch(() => []),
    window.api.projects.tasks(p.id, 15).catch(() => [])
  ])
  const ms = milestones.filter((m: ProjectMilestone) => m.projectId === p.id)
  const pt = todos.filter((t: Todo) => t.projectId === p.id)
  const lines = [
    `Projeto: ${p.name} (${statusLabel(p.status)}, ${p.area}${p.stage ? `, estágio ${stageLabel(p.stage)}` : ''})`,
    p.description ? `Descrição: ${p.description}` : '',
    p.finishLine ? `Linha de chegada (pronto quando…): ${p.finishLine}` : 'Linha de chegada: (não definida)',
    p.scope ? `Escopo da entrega atual: ${p.scope}` : '',
    p.futureIdeas ? `Melhorias futuras: ${p.futureIdeas}` : '',
    p.nextAction ? `Próxima ação: ${p.nextAction}` : 'Próxima ação: (nenhuma)',
    p.whereLeftOff ? `Onde parei (${p.whereLeftOffAt?.slice(0, 10) ?? ''}): ${p.whereLeftOff}` : '',
    p.blocker ? `Bloqueio: ${p.blocker}${p.blockerNeed ? ` — precisa: ${p.blockerNeed}` : ''}` : '',
    ov ? `Horas: ${fmtMinutes(ov.minutesTotal)} no total, ${fmtMinutes(ov.minutes7d)} nos últimos 7 dias. Última atividade: ${ov.lastActivityAt?.slice(0, 10) ?? 'nunca'}.` : '',
    ms.length ? `Marcos:\n${ms.map((m) => `- [${m.doneAt ? 'x' : ' '}] ${m.title}${m.targetDate ? ` (alvo ${m.targetDate})` : ''}`).join('\n')}` : 'Marcos: (nenhum)',
    pt.length ? `Tarefas:\n${pt.slice(0, 25).map((t) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title}`).join('\n')}` : '',
    commits.length ? `Commits recentes:\n${commits.map((c) => `- ${c.date.slice(0, 10)} ${c.subject}`).join('\n')}` : '',
    tasks.length ? `Sessões no timer:\n${tasks.map((t) => `- ${t.startTime.slice(0, 10)} ${t.title}`).join('\n')}` : '',
    events.length ? `Histórico recente:\n${events.map((e) => `- ${e.createdAt.slice(0, 10)} ${e.kind}: ${e.text ?? `${e.fromStatus ?? ''} → ${e.toStatus ?? ''}`}`).join('\n')}` : ''
  ]
  return lines.filter(Boolean).join('\n')
}
