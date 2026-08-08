import { getSetting, replaceGithubIssues, DbGithubIssue } from '../database/queries'
import { decodeSecret } from './secrets'

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

/**
 * Sync issues assigned to the authenticated user (open + closed, recent).
 * Reads the token from settings. Throws a clear error if unconfigured or on API failure.
 * Returns the number of issues synced.
 */
export async function syncGithubIssues(): Promise<number> {
  const token = decodeSecret(await getSetting('github_token'))
  if (!token) {
    throw new Error('GitHub token não configurado. Vá em Configurações e adicione um token.')
  }

  const res = await fetch(`${GITHUB_API}/issues?filter=assigned&state=all&per_page=100&sort=updated`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'RickOS'
    }
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('Token inválido ou expirado (401).')
    throw new Error(`GitHub API falhou (${res.status}). ${body.slice(0, 140)}`)
  }

  const data = (await res.json()) as GithubApiIssue[]
  const issues: DbGithubIssue[] = data
    // the /issues endpoint can include PRs; the search fields differ — keep true issues only
    .filter((i) => typeof i.number === 'number' && typeof i.id === 'number')
    .map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      state: i.state,
      repo: repoFromIssue(i),
      url: i.html_url ?? null,
      labels: JSON.stringify(labelNames(i.labels ?? [])),
      milestone: i.milestone?.title ?? null,
      updatedAt: i.updated_at ?? null
    }))

  await replaceGithubIssues(issues)
  return issues.length
}
