import fs from 'fs'
import os from 'os'
import path from 'path'
import { getProjects, getSetting, setSetting } from '../database/queries'

/**
 * Sugestões de projetos: lê a pasta de projetos do computador (padrão ~/Projects)
 * e lista as pastas que parecem projetos e ainda não estão cadastradas.
 *
 * - Pasta com marcador (.git, package.json, README, pyproject…) → candidata.
 * - Pasta sem marcador (ex.: ~/Projects/WAVE) → agrupadora: olha um nível dentro.
 * - Worktrees (.git é arquivo), pastas ocultas e de build/temporárias são ignoradas.
 */

export const PROJECTS_ROOT_KEY = 'projects_root'
const IGNORED_KEY = 'projects_suggestions_ignored'
const DEFAULT_ROOT = '~/Projects'

export interface ProjectSuggestion {
  name: string
  /** Caminho absoluto da pasta. */
  path: string
  /** Caminho para exibição (com ~). */
  displayPath: string
  description: string | null
  githubRepoUrl: string | null
  /** Stack detectada: Node, React, Python, Git… */
  tags: string[]
  /** ISO da última atividade percebida (commit/arquivo). */
  lastActivity: string | null
  /** Pasta agrupadora de onde veio (ex.: "WAVE"), ou null se está direto na raiz. */
  group: string | null
}

export interface ProjectSuggestionsResult {
  root: string
  rootExists: boolean
  items: ProjectSuggestion[]
  ignoredCount: number
}

const SKIP_DIRS = new Set(['node_modules', 'wt', 'worktrees', 'tmp', 'temp', 'dump', 'dist', 'build', 'out', 'vendor', '__pycache__'])

const MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  'composer.json',
  'pubspec.yaml',
  'project.godot',
  'CMakeLists.txt',
  'Makefile',
  'docker-compose.yml',
  'Dockerfile',
  'index.html',
  'CLAUDE.md'
]

function expandHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p
}

function tildify(p: string): string {
  const home = os.homedir()
  return p === home || p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p
}

function realpath(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

function safeList(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function readText(file: string, max = 64 * 1024): string | null {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(max)
      const n = fs.readSync(fd, buf, 0, max, 0)
      return buf.subarray(0, n).toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

function isWorktree(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, '.git')).isFile()
  } catch {
    return false
  }
}

function hasReadme(entries: fs.Dirent[]): string | null {
  const f = entries.find((e) => e.isFile() && /^readme(\.(md|markdown|txt|rst))?$/i.test(e.name))
  return f ? f.name : null
}

function isGitRepo(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, '.git')).isDirectory()
  } catch {
    return false
  }
}

/** Sem .git próprio, mas com repos dentro (ex.: ~/Projects/WAVE) → é uma pasta agrupadora. */
function isContainer(dir: string, entries: fs.Dirent[]): boolean {
  if (entries.some((e) => e.name === '.git')) return false
  return entries.some((e) => e.isDirectory() && !skipName(e.name) && isGitRepo(path.join(dir, e.name)))
}

function looksLikeProject(entries: fs.Dirent[]): boolean {
  const names = new Set(entries.map((e) => e.name))
  return MARKERS.some((m) => names.has(m)) || !!hasReadme(entries)
}

/** URL https do remote origin, lida direto do .git/config (sem spawn). */
function originUrl(dir: string): string | null {
  const cfg = readText(path.join(dir, '.git', 'config'))
  if (!cfg) return null
  const m = cfg.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/)
  return m ? normalizeRepoUrl(m[1]) : null
}

export function normalizeRepoUrl(url: string): string {
  let u = url.trim()
  const ssh = u.match(/^[\w.-]+@([^:/]+):(?!\/)(.+)$/) // git@host:org/repo, org-123@github.com:org/repo
  if (ssh) u = `https://${ssh[1]}/${ssh[2]}`
  u = u.replace(/^ssh:\/\/git@/, 'https://').replace(/^git:\/\//, 'https://')
  u = u.replace(/\/\/[^/@]+@/, '//') // remove credenciais embutidas
  return u.replace(/\.git$/, '').replace(/\/+$/, '')
}

function repoKey(url: string | null): string | null {
  return url ? normalizeRepoUrl(url).toLowerCase().replace(/^https?:\/\/(www\.)?/, '') : null
}

/** Primeiro parágrafo de texto do README (sem títulos, badges, imagens, código). */
function readmeSummary(file: string): string | null {
  const txt = readText(file, 16 * 1024)
  if (!txt) return null
  let inCode = false
  const para: string[] = []
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    if (!line) {
      if (para.length) break
      continue
    }
    if (/^(#|>|!\[|\[!\[|<|---|===|\|)/.test(line)) {
      if (para.length) break
      continue
    }
    para.push(line)
  }
  const s = para
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()
  return s ? (s.length > 220 ? s.slice(0, 217) + '…' : s) : null
}

function detect(dir: string, entries: fs.Dirent[]): { tags: string[]; description: string | null } {
  const names = new Set(entries.map((e) => e.name))
  const tags: string[] = []
  let description: string | null = null

  if (names.has('package.json')) {
    try {
      const pkg = JSON.parse(readText(path.join(dir, 'package.json')) || '{}') as {
        description?: string
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      if (pkg.description?.trim()) description = pkg.description.trim()
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      if (deps.next) tags.push('Next.js')
      else if (deps.react) tags.push('React')
      if (deps.vue) tags.push('Vue')
      if (deps.svelte) tags.push('Svelte')
      if (deps.electron) tags.push('Electron')
      if (deps['react-native'] || deps.expo) tags.push('React Native')
      if (deps.typescript) tags.push('TypeScript')
      if (deps.three) tags.push('Three.js')
      if (!tags.length) tags.push('Node')
    } catch {
      tags.push('Node')
    }
  }
  if (names.has('pyproject.toml') || names.has('requirements.txt') || names.has('setup.py')) tags.push('Python')
  if (names.has('Cargo.toml')) tags.push('Rust')
  if (names.has('go.mod')) tags.push('Go')
  if (names.has('pom.xml') || names.has('build.gradle') || names.has('build.gradle.kts')) tags.push('JVM')
  if (names.has('Gemfile')) tags.push('Ruby')
  if (names.has('composer.json')) tags.push('PHP')
  if (names.has('pubspec.yaml')) tags.push('Flutter')
  if (names.has('project.godot')) tags.push('Godot')
  if (names.has('Assets') && names.has('ProjectSettings')) tags.push('Unity')
  if (names.has('Dockerfile') || names.has('docker-compose.yml')) tags.push('Docker')
  if (!tags.length && names.has('index.html')) tags.push('HTML')
  if (names.has('.git')) tags.push('Git')

  if (!description) {
    const readme = hasReadme(entries)
    if (readme) description = readmeSummary(path.join(dir, readme))
  }
  return { tags, description }
}

function mtimeMs(p: string): number {
  try {
    return fs.statSync(p).mtimeMs
  } catch {
    return 0
  }
}

/** Última atividade: reflog do git (commits/checkouts) ou o arquivo mais recente do topo. */
function lastActivity(dir: string, entries: fs.Dirent[]): string | null {
  let t = Math.max(mtimeMs(path.join(dir, '.git', 'logs', 'HEAD')), mtimeMs(path.join(dir, '.git', 'index')))
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
    t = Math.max(t, mtimeMs(path.join(dir, e.name)))
  }
  return t ? new Date(t).toISOString() : null
}

function skipName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_') || SKIP_DIRS.has(name.toLowerCase())
}

async function getIgnored(): Promise<string[]> {
  try {
    const v = JSON.parse((await getSetting(IGNORED_KEY)) || '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export async function getProjectsRoot(): Promise<string> {
  return ((await getSetting(PROJECTS_ROOT_KEY)) || '').trim() || DEFAULT_ROOT
}

export async function ignoreProjectSuggestion(dir: string): Promise<void> {
  const list = await getIgnored()
  if (!list.includes(dir)) list.push(dir)
  await setSetting(IGNORED_KEY, JSON.stringify(list))
}

export async function restoreProjectSuggestions(): Promise<void> {
  await setSetting(IGNORED_KEY, '[]')
}

export async function suggestProjects(): Promise<ProjectSuggestionsResult> {
  const rootSetting = await getProjectsRoot()
  const root = expandHome(rootSetting)
  const rootExists = fs.existsSync(root)
  if (!rootExists) return { root: rootSetting, rootExists, items: [], ignoredCount: 0 }

  // O que já está cadastrado: caminhos (e seus pais/filhos) e repos do GitHub.
  const projects = await getProjects()
  const registeredPaths = projects
    .map((p) => p.localPath?.trim())
    .filter((p): p is string => !!p)
    .map((p) => realpath(expandHome(p)))
  const registeredRepos = new Set(projects.map((p) => repoKey(p.githubRepoUrl)).filter((k): k is string => !!k))
  const isRegistered = (dir: string, repo: string | null): boolean => {
    const real = realpath(dir)
    if (registeredPaths.some((r) => r === real || real.startsWith(r + path.sep))) return true
    const k = repoKey(repo)
    return !!k && registeredRepos.has(k)
  }

  const ignored = new Set(await getIgnored())
  let ignoredCount = 0
  const items: ProjectSuggestion[] = []

  const consider = (dir: string, entries: fs.Dirent[], group: string | null): void => {
    const repo = originUrl(dir)
    if (isRegistered(dir, repo)) return
    if (ignored.has(dir)) {
      ignoredCount++
      return
    }
    const { tags, description } = detect(dir, entries)
    items.push({
      name: path.basename(dir),
      path: dir,
      displayPath: tildify(dir),
      description,
      githubRepoUrl: repo,
      tags,
      lastActivity: lastActivity(dir, entries),
      group
    })
  }

  for (const e of safeList(root)) {
    if (!e.isDirectory() || skipName(e.name)) continue
    const dir = path.join(root, e.name)
    if (isWorktree(dir)) continue
    const entries = safeList(dir)
    if (!isContainer(dir, entries) && looksLikeProject(entries)) {
      consider(dir, entries, null)
      continue
    }
    // Pasta agrupadora: um nível abaixo.
    for (const c of entries) {
      if (!c.isDirectory() || skipName(c.name)) continue
      const sub = path.join(dir, c.name)
      if (isWorktree(sub)) continue
      const subEntries = safeList(sub)
      if (looksLikeProject(subEntries)) consider(sub, subEntries, e.name)
    }
  }

  items.sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
  return { root: rootSetting, rootExists, items, ignoredCount }
}
