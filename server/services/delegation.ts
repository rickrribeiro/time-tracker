import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  getProject,
  getSetting,
  getDelegation,
  getDelegations,
  createDelegation,
  updateDelegation,
  addProjectEvent,
  DbProjectDelegation
} from '../database/queries'
import { runClaude } from './claude'
import { gitQuiet, scanGit, createPullRequest } from './gitscan'
import { notify } from './notifications'
import { broadcast } from '../events'

/**
 * "🤖 Delegar": a próxima ação do projeto é executada pelo Claude num worktree
 * isolado (branch claude/rickos-…, pasta irmã .worktrees/), com edição liberada
 * só ali. Ao terminar, volta como "pronta para revisão": diff, PR ou descartar.
 */

const kills = new Map<number, () => void>()

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

function slugify(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'tarefa'
  )
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

const changed = (projectId: number): void => {
  broadcast('projects:updated', { id: projectId })
  broadcast('delegations:updated', { projectId })
}

/** Ao subir o servidor: execuções interrompidas não voltam sozinhas. */
export async function recoverDelegations(): Promise<void> {
  for (const d of await getDelegations(null)) {
    if (d.status === 'rodando') await updateDelegation(d.id, { status: 'erro', error: 'O servidor reiniciou durante a execução.', finishedAt: new Date().toISOString() })
  }
}

export async function delegateNextAction(projectId: number, action: string | null, instructions: string | null): Promise<DbProjectDelegation> {
  const p = await getProject(projectId)
  if (!p) throw new Error('Projeto não encontrado')
  const task = (action ?? p.nextAction ?? '').trim()
  if (!task) throw new Error('Defina a próxima ação antes de delegar.')
  if (!p.localPath) throw new Error('Defina o caminho local do projeto (repositório git).')
  const repo = path.resolve(expandHome(p.localPath))
  const top = (await gitQuiet(repo, ['rev-parse', '--show-toplevel']))?.trim()
  if (!top) throw new Error('O caminho local não é um repositório git.')

  const base = (await gitQuiet(top, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() || 'HEAD'
  const name = `rickos-${slugify(task)}-${stamp()}`
  const branch = `claude/${name}`
  const wtDir = path.join(path.dirname(top), '.worktrees', `${path.basename(top)}-${name}`)
  fs.mkdirSync(path.dirname(wtDir), { recursive: true })
  const added = await gitQuiet(top, ['worktree', 'add', '-b', branch, wtDir, 'HEAD'])
  if (added == null || !fs.existsSync(wtDir)) throw new Error('Não consegui criar o worktree (git worktree add falhou).')

  const d = await createDelegation({ projectId, action: task, instructions: instructions?.trim() || null, repoPath: top, branch, worktreePath: wtDir, baseRef: base })
  await addProjectEvent(projectId, 'delegacao', `🤖 Delegada ao Claude: ${task} (${branch})`)
  changed(projectId)

  const prompt = `[rickos:delegacao] Você é um engenheiro trabalhando sozinho no projeto "${p.name}".
Você está num git worktree ISOLADO, na branch "${branch}" (criada a partir de "${base}"). Pode editar à vontade aqui.

TAREFA (a próxima ação do projeto):
${task}
${instructions?.trim() ? `\nInstruções adicionais:\n${instructions.trim()}\n` : ''}
Contexto do projeto:
${p.description ? `- Descrição: ${p.description}\n` : ''}${p.finishLine ? `- Linha de chegada: ${p.finishLine}\n` : ''}${p.scope ? `- Escopo atual: ${p.scope}\n` : ''}${p.whereLeftOff ? `- Onde parei: ${p.whereLeftOff}\n` : ''}
Regras:
- Leia o CLAUDE.md / README do repositório antes de mudar algo e siga as convenções.
- Faça a menor mudança que conclua a tarefa. Rode o typecheck/testes se existirem.
- Faça commits pequenos com mensagens claras NESTA branch. NÃO faça push, NÃO abra PR, NÃO mexa fora deste diretório.
- Se a tarefa for ambígua ou grande demais, faça a parte segura e explique o resto.

No final, escreva um resumo em Markdown com: **O que fiz**, **Como testar**, **O que falta / dúvidas**.`

  const command = p.claudeCommand?.trim() || (await getSetting('claude_command')) || 'claude'
  const model = ((await getSetting('claude_model')) || '').trim()
  const allowed = ['Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(npm run:*)', 'Bash(npx tsc:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(find:*)']

  runClaude(prompt, command, {
    model,
    cwd: wtDir,
    agentic: true,
    permissionMode: 'acceptEdits',
    extraArgs: ['--allowedTools', allowed.join(',')],
    timeoutMs: 0,
    usage: { source: 'delegacao', projectId },
    registerChild: (kill) => kills.set(d.id, kill)
  })
    .then(async (out) => {
      kills.delete(d.id)
      const cur = await getDelegation(d.id)
      if (cur?.status === 'cancelada') return
      await updateDelegation(d.id, { status: 'pronta', output: out, finishedAt: new Date().toISOString() })
      await addProjectEvent(projectId, 'delegacao', `🤖 Delegação pronta para revisão: ${task}`)
      void notify({ title: `🤖 ${p.name}: delegação pronta`, body: task, source: 'ia', page: 'projects' })
      changed(projectId)
    })
    .catch(async (e) => {
      kills.delete(d.id)
      const cur = await getDelegation(d.id)
      if (cur?.status === 'cancelada') return
      await updateDelegation(d.id, { status: 'erro', error: e instanceof Error ? e.message : String(e), finishedAt: new Date().toISOString() })
      void notify({ title: `⚠️ ${p.name}: delegação falhou`, body: task, source: 'ia', page: 'projects' })
      changed(projectId)
    })

  return d
}

export async function cancelDelegation(id: number): Promise<void> {
  const d = await getDelegation(id)
  if (!d) return
  await updateDelegation(id, { status: 'cancelada', finishedAt: new Date().toISOString() })
  kills.get(id)?.()
  kills.delete(id)
  changed(d.projectId)
}

export interface DelegationReview {
  commits: { hash: string; subject: string }[]
  diffStat: string
  uncommitted: string[]
  worktreeExists: boolean
}

export async function reviewDelegation(id: number): Promise<DelegationReview> {
  const d = await getDelegation(id)
  if (!d) throw new Error('Delegação não encontrada')
  const exists = fs.existsSync(d.worktreePath)
  const base = d.baseRef && d.baseRef !== 'HEAD' ? d.baseRef : null
  const range = base ? `${base}..${d.branch}` : `${d.branch}~20..${d.branch}`
  const log = (await gitQuiet(d.repoPath, ['log', '--format=%h%x1f%s', range])) ?? ''
  const stat = base ? (await gitQuiet(d.repoPath, ['diff', '--stat', `${base}...${d.branch}`])) ?? '' : ''
  const st = exists ? ((await gitQuiet(d.worktreePath, ['status', '--short'])) ?? '') : ''
  return {
    commits: log.split('\n').filter(Boolean).map((l) => {
      const [hash, subject] = l.split('\x1f')
      return { hash, subject }
    }),
    diffStat: stat.trim(),
    uncommitted: st.split('\n').filter(Boolean),
    worktreeExists: exists
  }
}

/** Remove o worktree e apaga a branch (só delegações que não estão rodando). */
export async function discardDelegation(id: number): Promise<void> {
  const d = await getDelegation(id)
  if (!d) return
  if (d.status === 'rodando') throw new Error('Cancele a execução antes de descartar.')
  if (fs.existsSync(d.worktreePath)) await gitQuiet(d.repoPath, ['worktree', 'remove', '--force', d.worktreePath])
  await gitQuiet(d.repoPath, ['worktree', 'prune'])
  await gitQuiet(d.repoPath, ['branch', '-D', d.branch])
  await updateDelegation(id, { status: 'descartada' })
  await addProjectEvent(d.projectId, 'delegacao', `🗑 Delegação descartada: ${d.action}`)
  changed(d.projectId)
}

export async function acceptDelegation(id: number): Promise<void> {
  const d = await getDelegation(id)
  if (!d) return
  await updateDelegation(id, { status: 'aceita' })
  await addProjectEvent(d.projectId, 'delegacao', `✅ Delegação aceita: ${d.action}`)
  changed(d.projectId)
}

/** Push da branch + PR via gh (reaproveita o fluxo da tela de Worktrees). */
export async function prDelegation(id: number): Promise<{ url: string }> {
  const d = await getDelegation(id)
  if (!d) throw new Error('Delegação não encontrada')
  await scanGit({}) // o PR exige que a branch esteja no último scan
  const r = await createPullRequest(d.repoPath, d.branch)
  await updateDelegation(id, { prUrl: r.url })
  await addProjectEvent(d.projectId, 'delegacao', `🔀 PR aberto: ${r.url}`)
  changed(d.projectId)
  return r
}
