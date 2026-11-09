import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  getProjects,
  getProject,
  getProjectNumbers,
  getProjectMilestones,
  getProjectCycles,
  getGithubIssues,
  getTodos,
  getSetting,
  setSetting,
  patchProject,
  addProjectEvent,
  getProjectCycle,
  setCycleChangelog,
  DbProject,
  DbProjectCycle
} from '../database/queries'
import { runClaude } from './claude'
import { upsertRecurringBlock, deleteRecurringBlock } from './google'
import { gitQuiet } from './gitscan'
import { notify } from './notifications'

/**
 * Central de Projetos — visão consolidada de cada projeto: horas (timer), TODOs,
 * issues, commits, marcos e ciclos → "sinal de vida" + radar de alertas.
 * Tudo calculado no servidor para valer igual no desktop e na web.
 */

export type Pulse = 'vivo' | 'morno' | 'frio' | 'parado'

export interface ProjectAlert {
  kind: string
  severity: 'alta' | 'media' | 'baixa'
  text: string
}

export interface ProjectOverview {
  projectId: number
  minutesTotal: number
  minutes7d: number
  minutes30d: number
  openTodos: number
  doneTodos: number
  openIssues: number
  milestonesTotal: number
  milestonesDone: number
  progress: number // 0..100
  lastCommitAt: string | null
  commits7d: number
  lastActivityAt: string | null
  lastActivitySource: string | null
  idleDays: number | null
  pulse: Pulse
  activeCycle: DbProjectCycle | null
  hasRoadmap: boolean
  alerts: ProjectAlert[]
}

const DAY = 86400000
const ROADMAP_FILE = 'ROADMAP_RICKOS.md'

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

export function repoFromUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/github\.com[/:]([^/]+\/[^/#?]+?)(?:\.git)?\/?$/i)
  return m ? m[1] : null
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── git (cache curto: o overview é aberto com frequência) ─────────────────────
const gitCache = new Map<string, { at: number; lastCommitAt: string | null; commits7d: number }>()

async function gitPulse(localPath: string | null): Promise<{ lastCommitAt: string | null; commits7d: number }> {
  if (!localPath) return { lastCommitAt: null, commits7d: 0 }
  const dir = expandHome(localPath)
  const hit = gitCache.get(dir)
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit
  if (!fs.existsSync(path.join(dir, '.git')) && !fs.existsSync(dir)) return { lastCommitAt: null, commits7d: 0 }
  const [last, count] = await Promise.all([
    gitQuiet(dir, ['log', '--all', '-1', '--format=%aI']),
    gitQuiet(dir, ['rev-list', '--all', '--count', '--since=7.days'])
  ])
  const v = { at: Date.now(), lastCommitAt: last?.trim() || null, commits7d: Number(count?.trim() || 0) || 0 }
  gitCache.set(dir, v)
  return v
}

export interface ProjectCommit {
  hash: string
  subject: string
  author: string
  date: string
  refs: string
}

/** Commits recentes de todas as branches do repositório local do projeto. */
export async function projectCommits(projectId: number, limit = 30): Promise<ProjectCommit[]> {
  const p = await getProject(projectId)
  if (!p?.localPath) return []
  const out = await gitQuiet(expandHome(p.localPath), ['log', '--all', `-${limit}`, '--format=%h%x1f%s%x1f%an%x1f%aI%x1f%D'])
  if (!out) return []
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, date, refs] = line.split('\x1f')
      return { hash, subject, author, date, refs: refs ?? '' }
    })
}

// ── Roadmap (ROADMAP_RICKOS.md na raiz do projeto) ────────────────────────────
function roadmapPath(p: DbProject): string | null {
  if (!p.localPath) return null
  return path.join(expandHome(p.localPath), ROADMAP_FILE)
}

export async function readRoadmap(projectId: number): Promise<{ path: string | null; exists: boolean; content: string }> {
  const p = await getProject(projectId)
  const file = p ? roadmapPath(p) : null
  if (!file || !fs.existsSync(file)) return { path: file, exists: false, content: '' }
  return { path: file, exists: true, content: fs.readFileSync(file, 'utf8') }
}

/** Troca o marcador de um item ([ ] [x] [~] [-]) na linha indicada — confere o texto antes de gravar. */
export async function setRoadmapItem(projectId: number, line: number, expected: string, mark: ' ' | 'x' | '~' | '-'): Promise<{ content: string }> {
  const p = await getProject(projectId)
  const file = p ? roadmapPath(p) : null
  if (!file || !fs.existsSync(file)) throw new Error('ROADMAP_RICKOS.md não encontrado')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const cur = lines[line]
  if (cur == null || !cur.includes(expected)) throw new Error('O arquivo mudou — recarregue o roadmap')
  lines[line] = cur.replace(/\[( |x|X|~|-)\]/, `[${mark}]`)
  const content = lines.join('\n')
  fs.writeFileSync(file, content, 'utf8')
  return { content }
}

export async function createRoadmapTemplate(projectId: number): Promise<{ content: string }> {
  const p = await getProject(projectId)
  const file = p ? roadmapPath(p) : null
  if (!p || !file) throw new Error('Defina o caminho local do projeto primeiro')
  if (fs.existsSync(file)) return { content: fs.readFileSync(file, 'utf8') }
  const content = `# Roadmap — ${p.name}

> Padrão RickOS. \`##\` = área/épico · \`###\` = funcionalidade · \`- [ ]\` = tarefa.
> Marcadores: \`[ ]\` a fazer · \`[~]\` em andamento · \`[x]\` feito · \`[-]\` descartado.
> Opcional no fim do item: \`@v1.2\` (versão/ciclo) · \`!alta\` / \`!media\` / \`!baixa\` (prioridade).

## Agora (entrega atual)

### Funcionalidade principal
- [ ] Primeira tarefa @v1 !alta
- [ ] Segunda tarefa @v1

## Próximo

- [ ] Melhoria planejada @v2

## Futuro / ideias

- [ ] Ideia para depois
`
  fs.writeFileSync(file, content, 'utf8')
  return { content }
}

// ── Overview + radar ──────────────────────────────────────────────────────────
function pulseOf(idleDays: number | null): Pulse {
  if (idleDays == null) return 'parado'
  if (idleDays <= 3) return 'vivo'
  if (idleDays <= 14) return 'morno'
  if (idleDays <= 30) return 'frio'
  return 'parado'
}

export async function projectsOverview(): Promise<ProjectOverview[]> {
  const [projects, numbers, milestones, cycles, issues, todos] = await Promise.all([
    getProjects(),
    getProjectNumbers(),
    getProjectMilestones(),
    getProjectCycles(null),
    getGithubIssues(),
    getTodos()
  ])
  const today = todayStr()
  const focusLimit = Number((await getSetting('projects_focus_limit')) || 3) || 3
  const inFocus = projects.filter((p) => p.status === 'foco').length

  const gits = await Promise.all(projects.map((p) => (p.status === 'concluido' || p.status === 'encerrado' ? Promise.resolve({ lastCommitAt: null, commits7d: 0 }) : gitPulse(p.localPath))))

  return projects.map((p, i) => {
    const n = numbers.find((x) => x.projectId === p.id)
    const ms = milestones.filter((m) => m.projectId === p.id)
    const repo = repoFromUrl(p.githubRepoUrl)
    const projIssues = repo ? issues.filter((x) => x.repo.toLowerCase() === repo.toLowerCase()) : []
    const openIssues = projIssues.filter((x) => x.state === 'open').length
    const lastIssueAt = projIssues.reduce<string | null>((max, x) => (x.updatedAt && (!max || x.updatedAt > max) ? x.updatedAt : max), null)
    const g = gits[i]

    // progresso: marcos (parciais pelos TODOs vinculados) → senão TODOs do projeto
    let progress = 0
    if (ms.length) {
      const parts = ms.map((m) => {
        if (m.doneAt) return 1
        const linked = todos.filter((t) => t.milestoneId === m.id)
        return linked.length ? linked.filter((t) => t.status === 'done').length / linked.length : 0
      })
      progress = Math.round((parts.reduce((a, b) => a + b, 0) / ms.length) * 100)
    } else if (n && n.openTodos + n.doneTodos > 0) {
      progress = Math.round((n.doneTodos / (n.openTodos + n.doneTodos)) * 100)
    }
    if (p.status === 'concluido') progress = 100

    const sources: [string, string | null][] = [
      ['commit', g.lastCommitAt],
      ['timer', n?.lastTaskAt ?? null],
      ['tarefa', n?.lastTodoAt ?? null],
      ['registro', n?.lastEventAt ?? null],
      ['issue', lastIssueAt]
    ]
    let lastActivityAt: string | null = null
    let lastActivitySource: string | null = null
    for (const [src, at] of sources) {
      if (at && (!lastActivityAt || new Date(at).getTime() > new Date(lastActivityAt).getTime())) {
        lastActivityAt = at
        lastActivitySource = src
      }
    }
    const idleDays = lastActivityAt ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / DAY) : null
    const activeCycle = cycles.find((c) => c.projectId === p.id && c.status === 'ativo') ?? null

    const alerts: ProjectAlert[] = []
    const open = p.status !== 'concluido' && p.status !== 'encerrado'
    if (p.status === 'foco' && !p.nextAction) alerts.push({ kind: 'sem_proxima_acao', severity: 'alta', text: 'Em foco sem próxima ação' })
    if (open && p.blocker) alerts.push({ kind: 'travado', severity: 'alta', text: `Travado: ${p.blocker}` })
    if (p.status === 'pausado' && p.resumeAt && p.resumeAt <= today) alerts.push({ kind: 'pausa_vencida', severity: 'alta', text: `Pausa venceu em ${p.resumeAt} — retomar ou decidir` })
    if (p.status === 'foco' && (idleDays == null || idleDays >= 7)) alerts.push({ kind: 'parado', severity: 'media', text: idleDays == null ? 'Em foco sem nenhuma atividade' : `Em foco, mas parado há ${idleDays} dias` })
    if ((p.status === 'fila' || p.status === 'incubadora') && idleDays != null && idleDays >= 45)
      alerts.push({ kind: 'esquecido', severity: 'baixa', text: `Esquecido há ${idleDays} dias` })
    if (activeCycle?.dueDate) {
      if (activeCycle.dueDate < today) alerts.push({ kind: 'ciclo_vencido', severity: 'alta', text: `Ciclo "${activeCycle.name}" venceu em ${activeCycle.dueDate}` })
      else if (new Date(`${activeCycle.dueDate}T12:00:00`).getTime() - Date.now() <= 3 * DAY)
        alerts.push({ kind: 'ciclo_vence', severity: 'media', text: `Ciclo "${activeCycle.name}" vence em ${activeCycle.dueDate}` })
    }
    const lateMs = ms.filter((m) => !m.doneAt && m.targetDate && m.targetDate < today)
    if (open && lateMs.length) alerts.push({ kind: 'marco_vencido', severity: 'media', text: `${lateMs.length} marco(s) atrasado(s): ${lateMs[0].title}` })
    if (p.status === 'foco' && !p.finishLine) alerts.push({ kind: 'sem_linha_chegada', severity: 'baixa', text: 'Sem linha de chegada ("pronto quando…")' })
    if (p.status === 'foco' && inFocus > focusLimit) alerts.push({ kind: 'foco_excedido', severity: 'baixa', text: `${inFocus} projetos em foco (limite ${focusLimit})` })
    if (!p.triagedAt && open) alerts.push({ kind: 'sem_triagem', severity: 'baixa', text: 'Ainda não passou pela triagem' })

    const file = p.localPath ? path.join(expandHome(p.localPath), ROADMAP_FILE) : null

    return {
      projectId: p.id,
      minutesTotal: n?.minutesTotal ?? 0,
      minutes7d: n?.minutes7d ?? 0,
      minutes30d: n?.minutes30d ?? 0,
      openTodos: n?.openTodos ?? 0,
      doneTodos: n?.doneTodos ?? 0,
      openIssues,
      milestonesTotal: ms.length,
      milestonesDone: ms.filter((m) => m.doneAt).length,
      progress,
      lastCommitAt: g.lastCommitAt,
      commits7d: g.commits7d,
      lastActivityAt,
      lastActivitySource,
      idleDays,
      pulse: open ? pulseOf(idleDays) : 'parado',
      activeCycle,
      hasRoadmap: !!file && fs.existsSync(file),
      alerts
    }
  })
}

/**
 * Notificações automáticas (1x por dia): pausas vencidas, foco sem próxima ação,
 * projetos parados, ciclos vencendo e revisão semanal pendente.
 */
export async function checkProjectRadar(force = false): Promise<number> {
  const today = todayStr()
  if (!force && (await getSetting('projects_radar_last')) === today) return 0
  await setSetting('projects_radar_last', today)
  const [projects, overview] = await Promise.all([getProjects(), projectsOverview()])
  const name = (id: number): string => projects.find((p) => p.id === id)?.name ?? `#${id}`
  const important = overview.flatMap((o) =>
    o.alerts.filter((a) => a.severity !== 'baixa').map((a) => `• ${name(o.projectId)}: ${a.text}`)
  )
  let sent = 0
  if (important.length) {
    await notify({
      title: `🗂 ${important.length} alerta(s) nos projetos`,
      body: important.slice(0, 6).join('\n') + (important.length > 6 ? `\n… e mais ${important.length - 6}` : ''),
      source: 'projetos',
      page: 'projects'
    })
    sent++
  }
  // revisão de projetos: lembra se a última foi há mais de 7 dias (só aos domingos/segundas)
  const dow = new Date().getDay()
  const lastReview = await getSetting('projects_last_review')
  if ((dow === 0 || dow === 1) && (!lastReview || Date.now() - new Date(lastReview).getTime() > 7 * DAY)) {
    await notify({ title: '🗓️ Revisão semanal dos projetos', body: 'Decida: continuar, pausar, retomar ou encerrar.', source: 'projetos', page: 'weekly-review' })
    sent++
  }
  return sent
}

// ── Changelog do ciclo (a partir dos commits) ────────────────────────────────
const GROUPS: { key: string; title: string; re: RegExp }[] = [
  { key: 'feat', title: '✨ Novidades', re: /^feat(\(.+?\))?!?:/i },
  { key: 'fix', title: '🐛 Correções', re: /^fix(\(.+?\))?!?:/i },
  { key: 'perf', title: '⚡ Melhorias', re: /^(perf|refactor|style|ux)(\(.+?\))?!?:/i },
  { key: 'docs', title: '📝 Documentação', re: /^docs(\(.+?\))?!?:/i },
  { key: 'chore', title: '🔧 Manutenção', re: /^(chore|build|ci|test)(\(.+?\))?!?:/i }
]

export interface CycleCommit {
  hash: string
  subject: string
  date: string
}

export async function cycleCommits(cycleId: number): Promise<CycleCommit[]> {
  const c = await getProjectCycle(cycleId)
  if (!c) throw new Error('Ciclo não encontrado')
  const p = await getProject(c.projectId)
  if (!p?.localPath) return []
  const until = c.closedAt ?? new Date().toISOString()
  const out = await gitQuiet(expandHome(p.localPath), ['log', '--no-merges', `--since=${c.startDate}T00:00:00`, `--until=${until}`, '--format=%h%x1f%s%x1f%aI'])
  return (out ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, subject, date] = l.split('\x1f')
      return { hash, subject, date }
    })
}

/** Versão mecânica: agrupa por prefixo convencional (feat/fix/…) — sem IA. */
export function groupedChangelog(name: string, commits: CycleCommit[]): string {
  if (!commits.length) return `## ${name}\n\n_Nenhum commit no período do ciclo._`
  const buckets = new Map<string, string[]>()
  for (const c of commits) {
    const g = GROUPS.find((x) => x.re.test(c.subject))
    const title = g?.title ?? '📦 Outros'
    const text = g ? c.subject.replace(g.re, '').trim() : c.subject
    if (!buckets.has(title)) buckets.set(title, [])
    buckets.get(title)!.push(`- ${text.charAt(0).toUpperCase()}${text.slice(1)} (${c.hash})`)
  }
  const order = [...GROUPS.map((g) => g.title), '📦 Outros']
  return [`## ${name}`, '', ...order.filter((t) => buckets.has(t)).flatMap((t) => [`### ${t}`, ...buckets.get(t)!, ''])].join('\n').trim()
}

export async function generateCycleChangelog(cycleId: number, useAi: boolean): Promise<string> {
  const c = await getProjectCycle(cycleId)
  if (!c) throw new Error('Ciclo não encontrado')
  const p = await getProject(c.projectId)
  const commits = await cycleCommits(cycleId)
  let md = groupedChangelog(c.name, commits)
  if (useAi && commits.length) {
    try {
      const command = p?.claudeCommand?.trim() || (await getSetting('claude_command')) || 'claude'
      const out = await runClaude(
        `[rickos:changelog] Escreva o CHANGELOG da versão/ciclo "${c.name}" do projeto "${p?.name ?? ''}"${c.goal ? ` (objetivo: ${c.goal})` : ''} a partir dos commits abaixo.
Markdown, em português, voltado a quem USA o produto: comece com "## ${c.name}" e 1 frase de destaque; depois seções curtas (✨ Novidades, ⚡ Melhorias, 🐛 Correções) com bullets claros. Junte commits repetidos, ignore ruído (merges, builds, "wip", atualizações de dist). Não invente nada. Responda só o Markdown.

Commits (${commits.length}):
${commits.map((x) => `- ${x.date.slice(0, 10)} ${x.subject}`).join('\n')}`,
        command,
        { model: ((await getSetting('claude_model')) || '').trim(), timeoutMs: 180000, usage: { source: 'changelog', projectId: c.projectId } }
      )
      if (out.trim()) md = out.trim()
    } catch {
      // mantém a versão agrupada
    }
  }
  await setCycleChangelog(cycleId, md)
  return md
}

// ── Dias da semana do projeto + bloco no Google Calendar ─────────────────────
export async function setProjectSchedule(
  projectId: number,
  days: number[],
  start: string | null,
  minutes: number | null,
  syncCalendar: boolean
): Promise<{ eventLink: string | null }> {
  const p = await getProject(projectId)
  if (!p) throw new Error('Projeto não encontrado')
  const clean = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort()
  await patchProject(projectId, { workDays: clean.length ? JSON.stringify(clean) : null, workStart: start, workMinutes: minutes })
  let eventLink: string | null = null
  if (syncCalendar) {
    if (clean.length && start && minutes) {
      const ev = await upsertRecurringBlock({
        summary: `🗂 ${p.name}`,
        description: `Bloco do projeto ${p.name} (rickOS).${p.nextAction ? `\nPróxima ação: ${p.nextAction}` : ''}${p.finishLine ? `\nPronto quando: ${p.finishLine}` : ''}`,
        days: clean,
        start,
        minutes,
        eventId: p.calendarEventId,
        email: p.calendarAccount
      })
      await patchProject(projectId, { calendarEventId: ev.eventId, calendarAccount: ev.account })
      eventLink = ev.link
      const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
      await addProjectEvent(projectId, 'decisao', `Dias do projeto: ${clean.map((d) => names[d]).join(', ')} às ${start} (${minutes} min) — bloco no Google Calendar`)
    } else if (p.calendarEventId) {
      await deleteRecurringBlock(p.calendarEventId, p.calendarAccount)
      await patchProject(projectId, { calendarEventId: null, calendarAccount: null })
    }
  }
  return { eventLink }
}
