import {
  getSetting,
  setSetting,
  replaceGithubIssues,
  upsertGithubIssues,
  getGithubIssues,
  getProjects,
  markIssueOnGithub,
  DbGithubIssue
} from '../database/queries'
import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import { decodeSecret } from './secrets'
import { runClaude } from './claude'

const GITHUB_API = 'https://api.github.com'

/** Augmented PATH so the packaged app can find `gh` (like the claude service does). */
function ghPath(): string {
  const home = os.homedir()
  const extra = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', path.join(home, '.local', 'bin')]
  return [process.env.PATH || '', ...extra].join(path.delimiter)
}

/** Run `gh <args>` using the machine's authenticated GitHub CLI; returns stdout. */
function runGh(args: string[]): Promise<string> {
  const attempt = (viaShell: boolean): Promise<string> =>
    new Promise((resolve, reject) => {
      const env = { ...process.env, PATH: ghPath() }
      const child = viaShell
        ? spawn(process.env.SHELL || '/bin/zsh', ['-ilc', `gh ${args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')}`], { env })
        : spawn('gh', args, { env })
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => (out += d.toString()))
      child.stderr.on('data', (d) => (err += d.toString()))
      child.on('error', (e: NodeJS.ErrnoException) => reject(e))
      child.on('close', (code) =>
        code === 0 ? resolve(out) : reject(new Error(err.trim() || `gh saiu com código ${code}.`))
      )
    })
  return attempt(false).catch((e: NodeJS.ErrnoException) => {
    if (e?.code === 'ENOENT') return attempt(true)
    throw e
  })
}

interface GithubApiIssue {
  id: number
  number: number
  title: string
  state: string
  html_url: string
  labels: Array<{ name: string } | string>
  milestone: { title: string } | null
  updated_at: string
  repository?: { full_name?: string }
  repository_url?: string
}

/** Derive "owner/name" from the issue payload (repository object or repository_url). */
function repoFromIssue(issue: GithubApiIssue): string {
  if (issue.repository?.full_name) return issue.repository.full_name
  if (issue.repository_url) {
    // https://api.github.com/repos/owner/name
    const m = issue.repository_url.match(/repos\/(.+)$/)
    if (m) return m[1]
  }
  return '?'
}

function labelNames(labels: GithubApiIssue['labels']): string[] {
  return labels.map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean)
}

/** Extract the rel="next" URL from a GitHub `Link` response header. */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

const MAX_PAGES = 10 // safety cap: up to ~1000 issues per sync

function mapIssue(i: GithubApiIssue): DbGithubIssue {
  return {
    id: i.id,
    number: i.number,
    title: i.title,
    state: i.state,
    repo: repoFromIssue(i),
    url: i.html_url ?? null,
    labels: JSON.stringify(labelNames(i.labels ?? [])),
    milestone: i.milestone?.title ?? null,
    updatedAt: i.updated_at ?? null,
    local: 0,
    body: null
  }
}

/**
 * Sync issues assigned to the authenticated user.
 * Incremental: the first sync fetches everything (full replace); later syncs pass
 * `since=<last sync>` and merge only the issues changed since then (upsert), keeping
 * history. `github_last_sync` is stored in settings.
 * Reads the token from settings. Throws a clear error if unconfigured or on API failure.
 * Returns the number of issues fetched this run.
 */
/** Fetch assigned issues via the REST API using the in-app PAT (Link-header pagination). */
async function fetchIssuesViaToken(query: string): Promise<GithubApiIssue[]> {
  const token = decodeSecret(await getSetting('github_token'))
  if (!token) {
    throw new Error('GitHub token não configurado. Vá em Configurações e adicione um token.')
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RickOS'
  }
  const data: GithubApiIssue[] = []
  let url: string | null = `${GITHUB_API}/${query}`
  let pages = 0
  while (url && pages < MAX_PAGES) {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 401) throw new Error('Token inválido ou expirado (401).')
      throw new Error(`GitHub API falhou (${res.status}). ${body.slice(0, 140)}`)
    }
    data.push(...((await res.json()) as GithubApiIssue[]))
    url = parseNextLink(res.headers.get('link'))
    pages++
  }
  return data
}

/** Fetch assigned issues via the machine's authenticated `gh` CLI (no PAT needed). */
async function fetchIssuesViaGh(query: string): Promise<GithubApiIssue[]> {
  let out: string
  try {
    out = await runGh(['api', query, '--paginate'])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error('`gh` (GitHub CLI) não encontrado. Instale e rode `gh auth login`, ou use o modo Token.')
    }
    throw new Error(`Falha no gh: ${msg}`)
  }
  // `gh api --paginate` on an array endpoint may concatenate multiple JSON arrays.
  try {
    return JSON.parse(out) as GithubApiIssue[]
  } catch {
    const merged = out.replace(/\]\s*\[/g, ',')
    return JSON.parse(merged) as GithubApiIssue[]
  }
}

export async function syncGithubIssues(forceFull = false): Promise<number> {
  const mode = (await getSetting('github_auth_mode')) || 'token'
  const lastSync = await getSetting('github_last_sync')
  // Manual sync = always full (re-pull everything). Incremental (`since`) só quando
  // não forçado E já houve um sync — evita o botão "não fazer nada" por causa do cursor.
  const full = forceFull || !lastSync
  const query =
    `issues?filter=assigned&state=all&per_page=100&sort=updated` +
    (full ? '' : `&since=${encodeURIComponent(lastSync as string)}`)

  const data = mode === 'ssh' ? await fetchIssuesViaGh(query) : await fetchIssuesViaToken(query)

  const issues = data
    // the /issues endpoint can include PRs; the search fields differ — keep true issues only
    .filter((i) => typeof i.number === 'number' && typeof i.id === 'number')
    .map(mapIssue)

  if (full) await replaceGithubIssues(issues)
  else await upsertGithubIssues(issues)

  await setSetting('github_last_sync', new Date().toISOString())
  return issues.length
}

/** Extract "owner/name" from a GitHub repo URL. */
function repoFromUrl(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/github\.com[/:]([^/]+\/[^/#?]+?)(?:\.git)?\/?$/i)
  return m ? m[1] : null
}

/** Claude command for a repo: the matching project's override → global → 'claude'. */
async function claudeCommandForRepo(repo: string): Promise<string> {
  const projects = await getProjects()
  const match = projects.find((p) => repoFromUrl(p.githubRepoUrl)?.toLowerCase() === repo.toLowerCase())
  if (match?.claudeCommand && match.claudeCommand.trim()) return match.claudeCommand.trim()
  return (await getSetting('claude_command')) || 'claude'
}

/**
 * Create a local issue on GitHub using the local Claude Code CLI (which runs `gh`
 * with the account configured for that project's command). Parses the issue URL from
 * Claude's output and marks the issue as synced.
 */
export async function createIssueViaClaude(id: number): Promise<DbGithubIssue> {
  const issue = (await getGithubIssues()).find((i) => i.id === id)
  if (!issue) throw new Error('Issue não encontrada.')
  if (issue.url) throw new Error('Essa issue já está no GitHub.')

  const command = await claudeCommandForRepo(issue.repo)
  const body = (issue.body ?? '').replace(/`/g, "'")
  const prompt =
    `Crie uma issue no GitHub no repositório ${issue.repo} usando o gh CLI ` +
    `(gh issue create --repo ${issue.repo} --title <título> --body <corpo>). ` +
    `Título: "${issue.title}". Corpo: "${body || issue.title}". ` +
    `Ao final, imprima APENAS a URL da issue criada (ex.: https://github.com/${issue.repo}/issues/N).`

  const out = await runClaude(prompt, command, { extraArgs: ['--allowedTools', 'Bash(gh:*)'] })
  const m = out.match(/https?:\/\/github\.com\/[^\s"')]+\/issues\/(\d+)/)
  if (!m) {
    throw new Error(`Não consegui confirmar a criação (sem URL na resposta). Saída: ${out.slice(0, 200)}`)
  }
  await markIssueOnGithub(id, m[0], Number(m[1]))
  return (await getGithubIssues()).find((i) => i.id === id)!
}
