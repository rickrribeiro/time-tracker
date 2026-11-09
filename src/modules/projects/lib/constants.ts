import type { NextActionSize, Project, ProjectArea, ProjectOverview, ProjectStatus } from '../../../types'

/** Situação = onde o projeto está na minha atenção. Independe do estágio (maturidade). */
export const STATUSES: { key: ProjectStatus; label: string; icon: string; hint: string }[] = [
  { key: 'foco', label: 'Em foco', icon: '🎯', hint: 'Poucos, com próxima ação definida. É aqui que o tempo vai.' },
  { key: 'fila', label: 'Fila', icon: '⏭', hint: 'Decidido: entra em foco quando abrir vaga.' },
  { key: 'incubadora', label: 'Incubadora', icon: '🥚', hint: 'Ideias e projetos ainda não decididos. Todo projeto novo começa aqui.' },
  { key: 'pausado', label: 'Pausado', icon: '⏸', hint: 'Parado de propósito, com motivo e data/condição de retomada.' },
  { key: 'concluido', label: 'Concluído', icon: '🏁', hint: 'Cruzou a linha de chegada.' },
  { key: 'encerrado', label: 'Encerrado', icon: '🪦', hint: 'Abandonado conscientemente, com motivo registrado.' }
]
export const statusDef = (k: string): (typeof STATUSES)[number] => STATUSES.find((s) => s.key === k) ?? STATUSES[2]
export const statusLabel = (k: string): string => {
  const s = statusDef(k)
  return `${s.icon} ${s.label}`
}
export const isClosed = (p: Pick<Project, 'status'>): boolean => p.status === 'concluido' || p.status === 'encerrado'

/** Estágio = maturidade do produto. */
export const STAGES: { key: string; label: string }[] = [
  { key: '', label: '— sem estágio' },
  { key: 'ideia', label: '💡 Ideia' },
  { key: 'validacao', label: '🔎 Validação' },
  { key: 'mvp', label: '🛠 MVP' },
  { key: 'lancado', label: '🚀 Lançado' },
  { key: 'monetizando', label: '💰 Monetizando' },
  { key: 'manutencao', label: '🔧 Manutenção' }
]
export const stageLabel = (k: string | null | undefined): string => STAGES.find((s) => s.key === (k ?? ''))?.label ?? k ?? ''

export const AREAS: { key: ProjectArea; label: string }[] = [
  { key: 'pessoal', label: '🏠 Pessoal' },
  { key: 'profissional', label: '💼 Profissional' }
]
export const areaLabel = (k: string): string => AREAS.find((a) => a.key === k)?.label ?? k

export const PULSE: Record<ProjectOverview['pulse'], { label: string; color: string }> = {
  vivo: { label: 'vivo', color: 'var(--success, #22c55e)' },
  morno: { label: 'morno', color: 'var(--warning, #f59e0b)' },
  frio: { label: 'frio', color: '#60a5fa' },
  parado: { label: 'parado', color: 'var(--text-muted)' }
}

export const PRESET_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4']

export const EVENT_LABEL: Record<string, string> = {
  status: '🔀 Situação',
  decisao: '⚖️ Decisão',
  proxima_acao: '👉 Próxima ação',
  acao_concluida: '✅ Ação concluída',
  onde_parei: '📍 Onde parei',
  bloqueio: '🧱 Bloqueio',
  ciclo: '🔁 Ciclo',
  marco: '🎯 Marco',
  revisao: '🗓️ Revisão',
  nota: '📝 Nota',
  sessao_claude: '🤖 Sessão Claude',
  delegacao: '🤖 Delegação'
}

export function fmtMinutes(min: number): string {
  if (!min) return '0h'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m}min`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86400000)
}

export const FOCUS_LIMIT_KEY = 'projects_focus_limit'
export const TODAY_FOCUS_KEY = 'projects_today_focus'
export const LAST_REVIEW_KEY = 'projects_last_review'

/** Tamanho da próxima ação: cabe numa brecha de 15 min ou pede um bloco de foco. */
export const SIZES: { key: NextActionSize; icon: string; label: string }[] = [
  { key: 'rapida', icon: '⚡', label: '15 min' },
  { key: 'longa', icon: '🧠', label: '2 h' }
]
export const sizeDef = (k: string | null | undefined): (typeof SIZES)[number] | null => SIZES.find((s) => s.key === k) ?? null

export const WEEKDAYS = [
  { short: 'D', label: 'dom', long: 'domingo' },
  { short: 'S', label: 'seg', long: 'segunda' },
  { short: 'T', label: 'ter', long: 'terça' },
  { short: 'Q', label: 'qua', long: 'quarta' },
  { short: 'Q', label: 'qui', long: 'quinta' },
  { short: 'S', label: 'sex', long: 'sexta' },
  { short: 'S', label: 'sáb', long: 'sábado' }
]

export function parseWorkDays(raw: string | null | undefined): number[] {
  try {
    const v = JSON.parse(raw || '[]')
    return Array.isArray(v) ? v.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : []
  } catch {
    return []
  }
}
export const workDaysLabel = (raw: string | null | undefined): string => parseWorkDays(raw).map((d) => WEEKDAYS[d].label).join(', ')
export const isProjectDay = (p: Pick<Project, 'workDays'>, date: Date = new Date()): boolean => parseWorkDays(p.workDays).includes(date.getDay())
