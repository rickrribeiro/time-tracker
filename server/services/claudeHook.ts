import fs from 'fs'
import os from 'os'
import path from 'path'
import { getConfig, dataDir } from '../config'
import { getProjects, getProject, getSetting, setSetting, patchProject, addProjectEvent, DbProject } from '../database/queries'
import { runClaude } from './claude'
import { gitQuiet } from './gitscan'
import { broadcast } from '../events'

/**
 * "Onde parei" automático: um hook SessionEnd do Claude Code (global, em
 * ~/.claude/settings.json) avisa o servidor quando uma sessão termina. O servidor
 * descobre o projeto pelo cwd (inclusive worktrees), lê o transcript e pede a um
 * modelo barato um resumo de 2-4 frases → vira o "onde parei" do projeto.
 *
 * Sessões do próprio rickOS (runClaude define RICKOS_CLAUDE_RUN=1) são ignoradas.
 */

const HOOK_FILE = 'rickos-claude-hook.mjs'
const MARK = 'rickos-claude-hook'
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json')

export const AUTO_WHERE_KEY = 'projects_auto_where' // '0' desliga
export const HOOK_MODEL_KEY = 'projects_hook_model' // padrão: haiku
const HOOK_LAST_KEY = 'projects_hook_last' // JSON { at, project, status }

function hookScriptPath(): string {
  return path.join(dataDir(), 'hooks', HOOK_FILE)
}

function serverUrl(): string {
  const cfg = getConfig()
  const host = cfg.host === '0.0.0.0' || cfg.host === '::' ? '127.0.0.1' : cfg.host
  return `http://${host}:${cfg.port}`
}

function hookScript(): string {
  const cfg = getConfig()
  return `#!/usr/bin/env node
// Gerado pelo rickOS — hook SessionEnd do Claude Code: avisa o rickOS que a sessão terminou
// para ele preencher o "onde parei" do projeto. Nunca bloqueia o Claude (sai sempre com 0).
if (process.env.RICKOS_CLAUDE_RUN) process.exit(0)
const URL = ${JSON.stringify(serverUrl())}
const TOKEN = ${JSON.stringify(cfg.token || '')}
let raw = ''
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', async () => {
  try {
    const input = JSON.parse(raw || '{}')
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 4000)
    await fetch(URL + '/api/rpc/projects:claudeSession', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: 'Bearer ' + TOKEN } : {}) },
      body: JSON.stringify({ args: [{ cwd: input.cwd, transcriptPath: input.transcript_path, sessionId: input.session_id, reason: input.reason || input.hook_event_name || null }] }),
      signal: ctrl.signal
    })
  } catch {}
  process.exit(0)
})
`
}

interface HookEntry {
  matcher?: string
  hooks?: { type: string; command: string; timeout?: number }[]
}
type ClaudeSettings = { hooks?: Record<string, HookEntry[]> } & Record<string, unknown>

function readSettings(): ClaudeSettings {
  if (!fs.existsSync(SETTINGS_FILE)) return {}
  const raw = fs.readFileSync(SETTINGS_FILE, 'utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as ClaudeSettings // JSON inválido → erro (não sobrescrevemos o arquivo do usuário)
}

const isOurs = (e: HookEntry): boolean => !!e.hooks?.some((h) => h.command.includes(MARK))

export interface ClaudeHookStatus {
  installed: boolean
  enabled: boolean
  settingsPath: string
  scriptPath: string
  model: string
  last: { at: string; project: string | null; status: string } | null
}

export async function claudeHookStatus(): Promise<ClaudeHookStatus> {
  let installed = false
  try {
    installed = !!readSettings().hooks?.SessionEnd?.some(isOurs) && fs.existsSync(hookScriptPath())
  } catch {
    installed = false
  }
  let last: ClaudeHookStatus['last'] = null
  try {
    last = JSON.parse((await getSetting(HOOK_LAST_KEY)) || 'null')
  } catch {
    last = null
  }
  return {
    installed,
    enabled: (await getSetting(AUTO_WHERE_KEY)) !== '0',
    settingsPath: SETTINGS_FILE,
    scriptPath: hookScriptPath(),
    model: (await getSetting(HOOK_MODEL_KEY)) || 'haiku',
    last
  }
}

/** Escreve o script e registra o hook SessionEnd no ~/.claude/settings.json (preservando o resto). */
export async function installClaudeHook(): Promise<ClaudeHookStatus> {
  const script = hookScriptPath()
  fs.mkdirSync(path.dirname(script), { recursive: true })
  fs.writeFileSync(script, hookScript(), { mode: 0o755 })
  const settings = readSettings()
  const hooks = settings.hooks ?? {}
  const list = (hooks.SessionEnd ?? []).filter((e) => !isOurs(e))
  list.push({ hooks: [{ type: 'command', command: `node ${JSON.stringify(script)}`, timeout: 10 }] })
  settings.hooks = { ...hooks, SessionEnd: list }
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.rickos-backup`)
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n')
  await setSetting(AUTO_WHERE_KEY, '1')
  return claudeHookStatus()
}

export async function uninstallClaudeHook(): Promise<ClaudeHookStatus> {
  const settings = readSettings()
  if (settings.hooks?.SessionEnd) {
    const list = settings.hooks.SessionEnd.filter((e) => !isOurs(e))
    if (list.length) settings.hooks.SessionEnd = list
    else delete settings.hooks.SessionEnd
    if (!Object.keys(settings.hooks).length) delete settings.hooks
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n')
  }
  try {
    fs.unlinkSync(hookScriptPath())
  } catch {
    // já removido
  }
  return claudeHookStatus()
}

// ── Sessão terminou ──────────────────────────────────────────────────────────
function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}
const norm = (p: string): string => path.resolve(expandHome(p)).replace(/\/+$/, '')

/** Projeto dono do diretório: localPath igual/ancestral, ou o repo principal de um worktree. */
export async function projectForDir(cwd: string): Promise<DbProject | null> {
  const projects = (await getProjects()).filter((p) => p.localPath)
  const dir = norm(cwd)
  const byPath = (d: string): DbProject | null =>
    projects
      .filter((p) => d === norm(p.localPath!) || d.startsWith(norm(p.localPath!) + '/'))
      .sort((a, b) => norm(b.localPath!).length - norm(a.localPath!).length)[0] ?? null
  const direct = byPath(dir)
  if (direct) return direct
  // worktree fora do repo: --git-common-dir aponta para o .git do repositório principal
  const common = await gitQuiet(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (common?.trim()) return byPath(norm(path.dirname(common.trim())))
  return null
}

interface Transcript {
  prompts: string[]
  replies: string[]
  startedAt: string | null
  branch: string | null
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && typeof b === 'object' && (b as { type?: string }).type === 'text')
      .map((b) => (b as { text?: string }).text ?? '')
      .join('\n')
  }
  return ''
}

function readTranscript(file: string): Transcript {
  const t: Transcript = { prompts: [], replies: [], startedAt: null, branch: null }
  if (!file || !fs.existsSync(file)) return t
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let row: { type?: string; isMeta?: boolean; timestamp?: string; gitBranch?: string; message?: { role?: string; content?: unknown } }
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row.timestamp && !t.startedAt) t.startedAt = row.timestamp
    if (row.gitBranch) t.branch = row.gitBranch
    if (row.isMeta) continue
    if (row.type === 'user') {
      const txt = textOf(row.message?.content).trim()
      // ignora resultados de ferramentas, saídas de comandos locais e avisos do sistema
      if (!txt || /^<(command-|local-command|system-reminder)|^Caveat:/.test(txt)) continue
      t.prompts.push(txt)
    } else if (row.type === 'assistant') {
      const txt = textOf(row.message?.content).trim()
      if (txt) t.replies.push(txt)
    }
  }
  return t
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + '…' : s)
const seen = new Map<string, number>()

export interface SessionPayload {
  cwd?: string
  transcriptPath?: string
  sessionId?: string
  reason?: string | null
}

/** Chamado pelo hook. Responde na hora; o resumo roda em segundo plano. */
export async function handleClaudeSession(payload: SessionPayload): Promise<{ accepted: boolean; project: string | null; reason?: string }> {
  if (!payload?.cwd) return { accepted: false, project: null, reason: 'sem cwd' }
  if ((await getSetting(AUTO_WHERE_KEY)) === '0') return { accepted: false, project: null, reason: 'desligado' }
  const project = await projectForDir(payload.cwd)
  if (!project) return { accepted: false, project: null, reason: 'pasta não pertence a nenhum projeto' }
  const key = payload.sessionId || payload.transcriptPath || ''
  if (key && seen.has(key) && Date.now() - seen.get(key)! < 10 * 60 * 1000) return { accepted: false, project: project.name, reason: 'repetido' }
  if (key) seen.set(key, Date.now())
  void summarize(project.id, payload).catch(async (e) => {
    await setSetting(HOOK_LAST_KEY, JSON.stringify({ at: new Date().toISOString(), project: project.name, status: `erro: ${e instanceof Error ? e.message : String(e)}` }))
  })
  return { accepted: true, project: project.name }
}

async function summarize(projectId: number, payload: SessionPayload): Promise<void> {
  const project = await getProject(projectId)
  if (!project) return
  const tr = readTranscript(payload.transcriptPath ?? '')
  const markLast = (status: string): Promise<void> =>
    setSetting(HOOK_LAST_KEY, JSON.stringify({ at: new Date().toISOString(), project: project.name, status }))
  if (!tr.prompts.length || tr.prompts[0].includes('[rickos:')) return void (await markLast('ignorada (sessão vazia ou interna)'))

  const since = tr.startedAt ?? new Date(Date.now() - 3 * 3600 * 1000).toISOString()
  const commits = ((await gitQuiet(payload.cwd!, ['log', `--since=${since}`, '--format=%h %s', '-20'])) ?? '').trim()
  const status = ((await gitQuiet(payload.cwd!, ['status', '--short'])) ?? '').trim().split('\n').filter(Boolean)

  const prompt = `[rickos:onde-parei] Resuma esta sessão de programação com o Claude Code no projeto "${project.name}" para eu retomar depois.
Responda APENAS com JSON: {"whereLeftOff": "2-4 frases em primeira pessoa: o que foi feito, o estado atual, o detalhe que eu esqueceria", "nextStep": "a próxima ação concreta, curta (ou null)"}

Branch: ${tr.branch ?? '?'}
Pedidos que fiz (em ordem):
${tr.prompts.slice(-10).map((p, i) => `${i + 1}. ${clip(p.replace(/\s+/g, ' '), 400)}`).join('\n')}

Últimas respostas do Claude:
${tr.replies.slice(-4).map((r) => `- ${clip(r.replace(/\s+/g, ' '), 600)}`).join('\n')}

Commits durante a sessão:
${commits || '(nenhum)'}
Arquivos não commitados: ${status.length ? status.slice(0, 15).join(', ') : '(nenhum)'}`

  const command = project.claudeCommand?.trim() || (await getSetting('claude_command')) || 'claude'
  const model = (await getSetting(HOOK_MODEL_KEY)) || 'haiku'
  let where = ''
  let next: string | null = null
  try {
    const out = await runClaude(prompt, command, { model, timeoutMs: 120000, usage: { source: 'onde-parei', projectId } })
    const m = out.match(/\{[\s\S]*\}/)
    const j = m ? (JSON.parse(m[0]) as { whereLeftOff?: string; nextStep?: string | null }) : null
    where = (j?.whereLeftOff ?? '').trim()
    next = j?.nextStep?.trim() || null
  } catch {
    // sem IA: resumo mecânico com o último pedido e os commits
    where = `Última sessão (${tr.branch ?? 'branch ?'}): ${clip(tr.prompts[tr.prompts.length - 1].replace(/\s+/g, ' '), 220)}${commits ? ` · commits: ${commits.split('\n').slice(0, 3).join('; ')}` : ''}${status.length ? ` · ${status.length} arquivo(s) sem commit` : ''}`
  }
  if (!where) return void (await markLast('resumo vazio'))

  const fields: Record<string, string | null> = { whereLeftOff: where }
  if (!project.nextAction && next) fields.nextAction = next
  await patchProject(projectId, fields)
  await addProjectEvent(projectId, 'sessao_claude', `Sessão do Claude Code (${tr.prompts.length} pedido(s)${tr.branch ? `, ${tr.branch}` : ''})${next && project.nextAction ? ` · sugestão de próximo passo: ${next}` : ''}`)
  await markLast('ok')
  broadcast('projects:updated', { id: projectId })
}
