import type { Project } from '../../../types'

export function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

/** Nome parecido (tag "Hkvision" ≈ projeto "Hakivision", "ErosAI" ≈ "erosdate"). */
export function similarName(a: string, b: string): boolean {
  const x = normName(a)
  const y = normName(b)
  if (!x || !y) return false
  if (x === y) return true
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true
  let p = 0
  while (p < x.length && p < y.length && x[p] === y[p]) p++
  if (p >= 4) return true
  return Math.max(x.length, y.length) <= 12 && lev(x, y) <= 2
}

export function suggestProjectByName(name: string, projects: Project[]): Project | null {
  return projects.find((p) => similarName(name, p.name)) ?? null
}

/** Projeto mencionado no texto de uma tarefa ("... no RickOS ..."). */
export function suggestProjectForText(text: string, projects: Project[]): Project | null {
  const words = text.split(/[\s,.;:!?()[\]#/]+/).filter((w) => w.length >= 4)
  const t = normName(text)
  for (const p of projects) {
    const n = normName(p.name)
    if (n.length >= 4 && t.includes(n)) return p
  }
  for (const w of words) {
    const hit = projects.find((p) => similarName(w, p.name))
    if (hit) return hit
  }
  return null
}
