import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getProjects, getSetting } from '../database/queries'

/**
 * Worktrees & branches of every local repo (projects' localPath + scan roots).
 * Scanning is read-only: git runs with GIT_OPTIONAL_LOCKS=0 so `git status` never
 * takes the index lock while agents are working in the same repo. Mutations
 * (prune, delete, push/PR, fetch) are separate, explicit functions below.
 */

export type BranchStatus = 'orphan' | 'risk' | 'forgotten' | 'active' | 'merged' | 'base'

export interface PullRequestInfo {
  number: number
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  url: string
  title: string
}

export interface BranchInfo {
  id: string // repoPath::branch (or ::wt:<path> for detached/orphan worktrees)
  repoPath: string
  repoName: string
  projectId: number | null
  projectName: string | null
  branch: string | null // null = detached HEAD worktree
  isBase: boolean // the repo's default branch (main/master)
  worktreePath: string | null
  worktreeMissing: boolean
  lastCommitAt: string | null
  lastCommitSubject: string | null
  lastCommitAuthor: string | null
  ahead: number // commits not in the base branch
  behind: number
  upstream: string | null
  upstreamGone: boolean
  localOnly: number | null // commits that exist on no remote (repo without remotes: commits ahead of base)
  dirty: number | null // changed tracked files in the worktree (null = no worktree)
  untracked: number | null
  merged: boolean
  agent: boolean
  pr: PullRequestInfo | null
  idleDays: number | null
  status: BranchStatus
}

export interface RepoInfo {
  path: string
  name: string
  projectId: number | null
  projectName: string | null
  base: string // e.g. origin/main or main
  remoteUrl: string | null
  hasRemote: boolean
  ghAvailable: boolean
  error: string | null
}

export interface GitScan {
  scannedAt: string
  staleDays: number
  repos: RepoInfo[]
  branches: BranchInfo[]
}

export interface BranchDetails {
  commits: { hash: string; subject: string; author: string; date: string }[]
  files: { status: string; path: string }[] // uncommitted changes in the worktree
  diffStat: string // base...branch
}

// ── process helpers ───────────────────────────────────────────────────────────
function toolPath(): string {
  const home = os.homedir()
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', path.join(home, '.local', 'bin')]
  return [process.env.PATH || '', ...extra].join(path.delimiter)
}

function run(cmd: string, args: string[], cwd: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PATH: toolPath(), GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', NO_COLOR: '1' }
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} ${args[0]} demorou demais`))
    }, timeoutMs)
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `${cmd} saiu com código ${code}`))
    })
  })
}

const git = (cwd: string, args: string[], timeoutMs?: number): Promise<string> => run('git', args, cwd, timeoutMs)
const gitOk = (cwd: string, args: string[]): Promise<string | null> => git(cwd, args).catch(() => null)

/** Small concurrency limiter so a repo with 200 branches doesn't spawn 600 processes at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

// ── settings ──────────────────────────────────────────────────────────────────
export async function getScanRoots(): Promise<string[]> {
  const raw = (await getSetting('git_scan_roots')) || ''
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function getStaleDays(): Promise<number> {
  const n = Number(await getSetting('git_stale_days'))
  return Number.isFinite(n) && n > 0 ? n : 3
}

// ── repo discovery ────────────────────────────────────────────────────────────
interface RepoCandidate {
  path: string
  projectId: number | null
  projectName: string | null
}

/** Main working tree of the repo containing `dir` (worktree dirs resolve to their main repo). */
async function mainRepoOf(dir: string): Promise<string | null> {
  const common = await gitOk(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!common) return null
  const c = common.trim()
  // non-bare repo: <repo>/.git → <repo>
  return path.basename(c) === '.git' ? path.dirname(c) : c
}

/** Repos directly in a root or one level below it (folders with a .git directory). */
function findReposUnder(root: string): string[] {
  const out: string[] = []
  const isRepo = (d: string): boolean => {
    try {
      return fs.statSync(path.join(d, '.git')).isDirectory()
    } catch {
      return false
    }
  }
  const dir = expandHome(root)
  if (!fs.existsSync(dir)) return out
  if (isRepo(dir)) out.push(dir)
  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue
    const sub = path.join(dir, e.name)
    if (isRepo(sub)) {
      out.push(sub)
      continue
    }
    // one more level (e.g. ~/Projects/<org>/<repo>)
    try {
      for (const e2 of fs.readdirSync(sub, { withFileTypes: true })) {
        if (e2.isDirectory() && !e2.name.startsWith('.') && e2.name !== 'node_modules' && isRepo(path.join(sub, e2.name))) {
          out.push(path.join(sub, e2.name))
        }
      }
    } catch {
      // unreadable folder
    }
  }
  return out
}

async function discoverRepos(): Promise<RepoCandidate[]> {
  const byPath = new Map<string, RepoCandidate>()
  const projects = await getProjects()
  for (const p of projects) {
    const lp = p.localPath?.trim()
    if (!lp || !fs.existsSync(expandHome(lp))) continue
    const main = await mainRepoOf(expandHome(lp))
    if (main && !byPath.has(main)) byPath.set(main, { path: main, projectId: p.id, projectName: p.name })
  }
  for (const root of await getScanRoots()) {
    for (const dir of findReposUnder(root)) {
      const main = await mainRepoOf(dir)
      if (main && !byPath.has(main)) byPath.set(main, { path: main, projectId: null, projectName: null })
    }
  }
  // match scanned repos to projects by GitHub URL when localPath isn't set
  for (const c of byPath.values()) {
    if (c.projectId != null) continue
    const url = (await gitOk(c.path, ['remote', 'get-url', 'origin']))?.trim()
    const slug = repoSlug(url ?? null)
    const p = slug ? projects.find((x) => repoSlug(x.githubRepoUrl) === slug) : undefined
    if (p) {
      c.projectId = p.id
      c.projectName = p.name
    }
  }
  return [...byPath.values()]
}

function repoSlug(url: string | null): string | null {
  if (!url) return null
  const m = url.trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i)
  return m ? m[1].toLowerCase() : null
}

// ── per-repo scan ─────────────────────────────────────────────────────────────
interface Worktree {
  path: string
  branch: string | null
  head: string
  prunable: boolean
  isMain: boolean
}

function parseWorktrees(porcelain: string): Worktree[] {
  const list: Worktree[] = []
  let cur: Partial<Worktree> | null = null
  const push = (): void => {
    if (cur?.path) list.push({ path: cur.path, branch: cur.branch ?? null, head: cur.head ?? '', prunable: !!cur.prunable, isMain: list.length === 0 })
  }
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      push()
      cur = { path: line.slice(9) }
    } else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5)
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
    else if (cur && line.startsWith('prunable')) cur.prunable = true
  }
  push()
  return list.map((w) => ({ ...w, prunable: w.prunable || (!w.isMain && !fs.existsSync(w.path)) }))
}

async function resolveBase(repo: string): Promise<{ base: string; baseBranch: string }> {
  const sym = await gitOk(repo, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  if (sym?.trim()) return { base: sym.trim(), baseBranch: sym.trim().replace(/^origin\//, '') }
  for (const b of ['main', 'master', 'develop']) {
    if (await gitOk(repo, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`])) return { base: `origin/${b}`, baseBranch: b }
    if (await gitOk(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])) return { base: b, baseBranch: b }
  }
  const head = (await gitOk(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']))?.trim() || 'HEAD'
  return { base: head, baseBranch: head }
}

async function countStatus(dir: string): Promise<{ dirty: number; untracked: number } | null> {
  const out = await gitOk(dir, ['status', '--porcelain=v1', '--untracked-files=normal'])
  if (out == null) return null
  let dirty = 0
  let untracked = 0
  for (const l of out.split('\n')) {
    if (!l.trim()) continue
    if (l.startsWith('??')) untracked++
    else dirty++
  }
  return { dirty, untracked }
}

// gh availability + PR cache (per repo, 5 min)
let ghChecked: boolean | null = null
async function ghAvailable(): Promise<boolean> {
  if (ghChecked != null) return ghChecked
  ghChecked = await run('gh', ['--version'], os.homedir(), 5000).then(() => true, () => false)
  return ghChecked
}
const prCache = new Map<string, { at: number; prs: Map<string, PullRequestInfo> }>()

async function pullRequestsFor(repo: string, force: boolean): Promise<Map<string, PullRequestInfo>> {
  const hit = prCache.get(repo)
  if (!force && hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.prs
  const prs = new Map<string, PullRequestInfo>()
  try {
    const out = await run('gh', ['pr', 'list', '--state', 'all', '--limit', '200', '--json', 'number,state,headRefName,url,title,updatedAt'], repo, 20000)
    const rows = JSON.parse(out) as { number: number; state: PullRequestInfo['state']; headRefName: string; url: string; title: string; updatedAt: string }[]
    // newest first: keep the most relevant PR per branch (open beats merged beats closed)
    const rank = { OPEN: 3, MERGED: 2, CLOSED: 1 }
    for (const r of rows) {
      const cur = prs.get(r.headRefName)
      if (!cur || rank[r.state] > rank[cur.state]) prs.set(r.headRefName, { number: r.number, state: r.state, url: r.url, title: r.title })
    }
  } catch {
    // not a GitHub repo / not authenticated — no PR info
  }
  prCache.set(repo, { at: Date.now(), prs })
  return prs
}

const AGENT_PATH = /\/\.claude\/worktrees\/|\/\.worktrees\/|\/worktrees\//
const AGENT_BRANCH = /^(claude|agent|ai|codex|cursor|worktree)[-/]/i

function classify(b: Omit<BranchInfo, 'status'>, staleDays: number): BranchStatus {
  if (b.worktreeMissing) return 'orphan'
  if ((b.dirty ?? 0) > 0 || (b.untracked ?? 0) > 0) return 'risk'
  if ((b.localOnly ?? 0) > 0) return 'risk'
  if (b.isBase) return 'base'
  if (b.pr?.state === 'MERGED' || b.merged || b.ahead === 0) return 'merged'
  if (b.pr?.state === 'OPEN') return 'active'
  if ((b.idleDays ?? 0) >= staleDays) return 'forgotten'
  return 'active'
}

async function scanRepo(c: RepoCandidate, staleDays: number, withPrs: boolean, forcePrs: boolean): Promise<{ repo: RepoInfo; branches: BranchInfo[] }> {
  const name = path.basename(c.path)
  const remoteUrl = (await gitOk(c.path, ['remote', 'get-url', 'origin']))?.trim() || null
  const remotes = (await gitOk(c.path, ['remote']))?.trim() || ''
  const gh = withPrs && !!repoSlug(remoteUrl) && (await ghAvailable())
  const repo: RepoInfo = {
    path: c.path,
    name,
    projectId: c.projectId,
    projectName: c.projectName,
    base: 'HEAD',
    remoteUrl,
    hasRemote: !!remotes,
    ghAvailable: gh,
    error: null
  }
  try {
    const { base, baseBranch } = await resolveBase(c.path)
    repo.base = base
    const [wtOut, refsOut, mergedOut, prs] = await Promise.all([
      git(c.path, ['worktree', 'list', '--porcelain']),
      git(c.path, [
        'for-each-ref',
        'refs/heads',
        '--format=%(refname:short)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:iso-strict)%09%(authorname)%09%(subject)'
      ]),
      gitOk(c.path, ['branch', '--merged', base, '--format=%(refname:short)']),
      gh ? pullRequestsFor(c.path, forcePrs) : Promise.resolve(new Map<string, PullRequestInfo>())
    ])
    const worktrees = parseWorktrees(wtOut)
    const merged = new Set((mergedOut || '').split('\n').map((s) => s.trim()).filter(Boolean))
    const wtByBranch = new Map(worktrees.filter((w) => w.branch).map((w) => [w.branch as string, w]))
    const now = Date.now()

    const refs = refsOut
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [branch, upstream, track, date, author, ...subject] = l.split('\t')
        return { branch, upstream, track, date, author, subject: subject.join('\t') }
      })

    const branches = await mapLimit(refs, 6, async (r): Promise<BranchInfo> => {
      const wt = wtByBranch.get(r.branch) ?? null
      const isBase = r.branch === baseBranch
      const [lr, localOnlyOut, st] = await Promise.all([
        gitOk(c.path, ['rev-list', '--left-right', '--count', `${base}...${r.branch}`]),
        remotes ? gitOk(c.path, ['rev-list', '--count', r.branch, '--not', '--remotes']) : Promise.resolve(null),
        wt && !wt.prunable ? countStatus(wt.path) : Promise.resolve(null)
      ])
      const [behind, ahead] = (lr || '0\t0').trim().split(/\s+/).map((n) => Number(n) || 0)
      const lastMs = r.date ? new Date(r.date).getTime() : NaN
      const info: Omit<BranchInfo, 'status'> = {
        id: `${c.path}::${r.branch}`,
        repoPath: c.path,
        repoName: name,
        projectId: c.projectId,
        projectName: c.projectName,
        branch: r.branch,
        isBase,
        worktreePath: wt?.path ?? null,
        worktreeMissing: !!wt?.prunable,
        lastCommitAt: r.date || null,
        lastCommitSubject: r.subject || null,
        lastCommitAuthor: r.author || null,
        ahead: isBase ? 0 : ahead,
        behind,
        upstream: r.upstream || null,
        upstreamGone: r.track === '[gone]',
        // no remote at all → everything ahead of the base exists only on this machine
        localOnly: !remotes ? (isBase ? 0 : ahead) : localOnlyOut == null ? null : Number(localOnlyOut.trim()) || 0,
        dirty: st?.dirty ?? null,
        untracked: st?.untracked ?? null,
        merged: !isBase && merged.has(r.branch),
        agent: AGENT_BRANCH.test(r.branch) || (!!wt && AGENT_PATH.test(wt.path)),
        pr: prs.get(r.branch) ?? null,
        idleDays: Number.isFinite(lastMs) ? Math.floor((now - lastMs) / 86400000) : null
      }
      return { ...info, status: classify(info, staleDays) }
    })

    // worktrees without a branch: detached HEAD or orphaned entries
    for (const w of worktrees) {
      if (w.branch && refs.some((r) => r.branch === w.branch)) continue
      if (w.isMain && !w.branch) continue
      const st = w.prunable ? null : await countStatus(w.path)
      const info: Omit<BranchInfo, 'status'> = {
        id: `${c.path}::wt:${w.path}`,
        repoPath: c.path,
        repoName: name,
        projectId: c.projectId,
        projectName: c.projectName,
        branch: w.branch,
        isBase: false,
        worktreePath: w.path,
        worktreeMissing: w.prunable,
        lastCommitAt: null,
        lastCommitSubject: w.head ? `HEAD destacado em ${w.head.slice(0, 8)}` : null,
        lastCommitAuthor: null,
        ahead: 0,
        behind: 0,
        upstream: null,
        upstreamGone: false,
        localOnly: null,
        dirty: st?.dirty ?? null,
        untracked: st?.untracked ?? null,
        merged: false,
        agent: AGENT_PATH.test(w.path),
        pr: null,
        idleDays: null
      }
      branches.push({ ...info, status: classify(info, staleDays) })
    }
    return { repo, branches }
  } catch (e) {
    repo.error = e instanceof Error ? e.message : String(e)
    return { repo, branches: [] }
  }
}

// ── public API ────────────────────────────────────────────────────────────────
let lastScan: GitScan | null = null
let scanning: Promise<GitScan> | null = null

export async function scanGit(opts: { prs?: boolean; refreshPrs?: boolean } = {}): Promise<GitScan> {
  if (scanning) return scanning
  scanning = (async () => {
    const staleDays = await getStaleDays()
    const repos = await discoverRepos()
    const results = await mapLimit(repos, 3, (c) => scanRepo(c, staleDays, opts.prs !== false, !!opts.refreshPrs))
    const scan: GitScan = {
      scannedAt: new Date().toISOString(),
      staleDays,
      repos: results.map((r) => r.repo).sort((a, b) => a.name.localeCompare(b.name)),
      branches: results.flatMap((r) => r.branches)
    }
    lastScan = scan
    return scan
  })().finally(() => {
    scanning = null
  })
  return scanning
}

/** Last scan if recent enough (Home card, automation rule), otherwise a fresh one. */
export async function cachedScan(maxAgeMs: number): Promise<GitScan> {
  if (lastScan && Date.now() - new Date(lastScan.scannedAt).getTime() < maxAgeMs) return lastScan
  return scanGit()
}

/** Only paths that came out of a scan can be acted on. */
async function assertKnownRepo(repoPath: string): Promise<void> {
  const scan = lastScan ?? (await scanGit({ prs: false }))
  if (!scan.repos.some((r) => r.path === repoPath)) throw new Error('Repositório desconhecido — atualize a lista.')
}
function knownBranch(repoPath: string, branch: string): BranchInfo | undefined {
  return lastScan?.branches.find((b) => b.repoPath === repoPath && b.branch === branch)
}

export async function branchDetails(repoPath: string, branch: string | null, worktreePath: string | null): Promise<BranchDetails> {
  await assertKnownRepo(repoPath)
  const { base } = await resolveBase(repoPath)
  const details: BranchDetails = { commits: [], files: [], diffStat: '' }
  if (branch) {
    const log = await gitOk(repoPath, ['log', `${base}..${branch}`, '--max-count=50', '--format=%h%x09%an%x09%cI%x09%s'])
    details.commits = (log || '')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [hash, author, date, ...s] = l.split('\t')
        return { hash, author, date, subject: s.join('\t') }
      })
    details.diffStat = ((await gitOk(repoPath, ['diff', '--stat=100', `${base}...${branch}`])) || '').trim()
  }
  if (worktreePath && fs.existsSync(worktreePath)) {
    const st = await gitOk(worktreePath, ['status', '--porcelain=v1'])
    details.files = (st || '')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => ({ status: l.slice(0, 2).trim() || '?', path: l.slice(3) }))
  }
  return details
}

/** `git worktree prune` — removes only entries whose folder no longer exists. */
export async function pruneWorktrees(repoPath: string): Promise<string> {
  await assertKnownRepo(repoPath)
  await git(repoPath, ['worktree', 'prune', '--verbose'])
  return 'Worktrees órfãs removidas.'
}

/** `git fetch --prune` so ahead/behind and "merged" use fresh remote refs. */
export async function fetchRepo(repoPath: string): Promise<string> {
  await assertKnownRepo(repoPath)
  await git(repoPath, ['fetch', '--all', '--prune'], 120000)
  return 'Remotos atualizados.'
}

/**
 * Delete a branch that is already merged (and its clean worktree). Refuses when the
 * worktree has changes or the branch has work that isn't in the base / a merged PR.
 */
export async function deleteMergedBranch(repoPath: string, branch: string): Promise<string> {
  await assertKnownRepo(repoPath)
  const b = knownBranch(repoPath, branch)
  if (!b) throw new Error('Branch não encontrada — atualize a lista.')
  if (b.isBase) throw new Error('Não dá para apagar a branch principal.')
  if (b.status !== 'merged') throw new Error('Só branches já mergeadas podem ser apagadas por aqui.')
  if (b.worktreePath) {
    // no --force: git refuses if the worktree has changes
    await git(repoPath, ['worktree', 'remove', b.worktreePath])
  }
  const squashMerged = b.pr?.state === 'MERGED' && !b.merged && b.ahead > 0
  await git(repoPath, ['branch', squashMerged ? '-D' : '-d', branch])
  return `Branch ${branch} apagada${b.worktreePath ? ' (e a worktree)' : ''}.`
}

/** Push the branch (if needed) and open a PR against the base with gh. */
export async function createPullRequest(repoPath: string, branch: string): Promise<{ url: string }> {
  await assertKnownRepo(repoPath)
  const b = knownBranch(repoPath, branch)
  if (!b || b.isBase) throw new Error('Branch inválida para PR.')
  if (b.pr?.state === 'OPEN') return { url: b.pr.url }
  const { baseBranch } = await resolveBase(repoPath)
  if (!b.upstream || b.upstreamGone || (b.localOnly ?? 0) > 0) {
    await git(repoPath, ['push', '-u', 'origin', branch], 120000)
  }
  const out = await run('gh', ['pr', 'create', '--fill', '--base', baseBranch, '--head', branch], repoPath, 60000)
  prCache.delete(repoPath)
  const url = out.trim().split('\n').pop() || ''
  return { url }
}

/** Open a folder on the server machine (desktop only makes sense when the server is local). */
export async function openPath(target: string, app: 'vscode' | 'finder' | 'terminal'): Promise<void> {
  const scan = lastScan ?? (await scanGit({ prs: false }))
  const allowed = scan.repos.some((r) => r.path === target) || scan.branches.some((b) => b.worktreePath === target)
  if (!allowed || !fs.existsSync(target)) throw new Error('Pasta desconhecida ou inexistente.')
  if (process.platform !== 'darwin') throw new Error('Abrir pastas só é suportado no macOS.')
  const args =
    app === 'vscode' ? ['-a', 'Visual Studio Code', target] : app === 'terminal' ? ['-a', 'Terminal', target] : [target]
  await run('open', args, os.homedir(), 10000)
}
