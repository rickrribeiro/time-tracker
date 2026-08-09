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
import { decodeSecret } from './secrets'
import { runClaude } from './claude'

const GITHUB_API = 'https://api.github.com'

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
export async function syncGithubIssues(): Promise<number> {
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

  const lastSync = await getSetting('github_last_sync')
  const full = !lastSync
  let url: string | null = `${GITHUB_API}/issues?filter=assigned&state=all&per_page=100&sort=updated`
  if (!full) url += `&since=${encodeURIComponent(lastSync as string)}`

  // Follow the Link: rel="next" header to paginate past 100 issues.
  const data: GithubApiIssue[] = []
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
