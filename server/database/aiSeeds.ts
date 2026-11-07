import { Database } from 'sql.js'

interface SeedSkill {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  content: string
}

interface SeedAgent {
  id: string
  name: string
  description: string
  role: string
  systemPrompt: string
  defaultSkillIds: string[]
  tags: string[]
}

const SKILLS: SeedSkill[] = [
  {
    id: 'seed-skill-code-review',
    name: 'Code Review',
    description: 'Revisão de código focada em bugs e clareza.',
    category: 'Engenharia',
    tags: ['código', 'qualidade'],
    content:
      'Revise o código a seguir. Aponte bugs, riscos e melhorias de legibilidade, em ordem de severidade. Seja específico e sugira o diff quando fizer sentido.'
  },
  {
    id: 'seed-skill-refactor-ts',
    name: 'Refatoração TypeScript',
    description: 'Refatorar TS mantendo comportamento.',
    category: 'Engenharia',
    tags: ['typescript', 'refactor'],
    content:
      'Refatore o TypeScript a seguir para reduzir complexidade e melhorar tipos, sem mudar o comportamento. Explique cada mudança brevemente.'
  },
  {
    id: 'seed-skill-project-plan',
    name: 'Planejamento de Projeto',
    description: 'Quebrar um objetivo em plano acionável.',
    category: 'Produto',
    tags: ['planejamento'],
    content:
      'Transforme o objetivo a seguir em um plano com marcos, tarefas priorizadas e riscos. Formate como checklist.'
  },
  {
    id: 'seed-skill-prompt-eng',
    name: 'Prompt Engineering',
    description: 'Melhorar um prompt de IA.',
    category: 'IA',
    tags: ['prompt'],
    content:
      'Melhore o prompt a seguir: deixe objetivo, contexto e formato de saída explícitos. Retorne o prompt reescrito.'
  },
  {
    id: 'seed-skill-log-analysis',
    name: 'Análise de Logs',
    description: 'Encontrar a causa raiz em logs.',
    category: 'DevOps',
    tags: ['logs', 'debug'],
    content:
      'Analise os logs a seguir, identifique a causa raiz provável e proponha os próximos passos de diagnóstico.'
  },
  {
    id: 'seed-skill-k8s-diag',
    name: 'Diagnóstico Kubernetes',
    description: 'Diagnosticar problemas em clusters k8s.',
    category: 'DevOps',
    tags: ['kubernetes'],
    content:
      'Dado o sintoma a seguir num cluster Kubernetes, liste hipóteses ordenadas por probabilidade e os comandos kubectl para verificar cada uma.'
  }
]

const AGENTS: SeedAgent[] = [
  {
    id: 'seed-agent-backend',
    name: 'Backend Engineer',
    description: 'Engenheiro backend pragmático.',
    role: 'Engenharia',
    systemPrompt: 'Você é um engenheiro backend sênior. Priorize correção, simplicidade e testes.',
    defaultSkillIds: ['seed-skill-code-review', 'seed-skill-refactor-ts'],
    tags: ['backend']
  },
  {
    id: 'seed-agent-devops',
    name: 'DevOps Engineer',
    description: 'Especialista em infraestrutura e observabilidade.',
    role: 'DevOps',
    systemPrompt: 'Você é um engenheiro DevOps. Pense em confiabilidade, logs e diagnóstico rápido.',
    defaultSkillIds: ['seed-skill-log-analysis', 'seed-skill-k8s-diag'],
    tags: ['devops']
  },
  {
    id: 'seed-agent-product',
    name: 'Product Strategist',
    description: 'Estrategista de produto orientado a impacto.',
    role: 'Produto',
    systemPrompt: 'Você é um estrategista de produto. Foque em impacto, escopo e clareza.',
    defaultSkillIds: ['seed-skill-project-plan'],
    tags: ['produto']
  },
  {
    id: 'seed-agent-prompt',
    name: 'Prompt Engineer',
    description: 'Especialista em prompts de IA.',
    role: 'IA',
    systemPrompt: 'Você é um especialista em prompt engineering. Torne instruções claras e testáveis.',
    defaultSkillIds: ['seed-skill-prompt-eng'],
    tags: ['ia', 'prompt']
  }
]

function count(db: Database, table: string): number {
  const res = db.exec(`SELECT COUNT(*) FROM ${table}`)
  const v = res[0]?.values?.[0]?.[0]
  return typeof v === 'number' ? v : 0
}

/** Populate example skills/agents only when the library is empty. */
export function seedAiLibrary(db: Database): void {
  const now = new Date().toISOString()

  if (count(db, 'skills') === 0) {
    for (const s of SKILLS) {
      db.run(
        `INSERT OR IGNORE INTO skills (id, name, description, category, tags, content, isFavorite, usageCount, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
        [s.id, s.name, s.description, s.category, JSON.stringify(s.tags), s.content, now, now]
      )
    }
  }

  if (count(db, 'agents') === 0) {
    for (const a of AGENTS) {
      db.run(
        `INSERT OR IGNORE INTO agents (id, name, description, role, systemPrompt, defaultSkillIds, tags, isFavorite, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [a.id, a.name, a.description, a.role, a.systemPrompt, JSON.stringify(a.defaultSkillIds), JSON.stringify(a.tags), now, now]
      )
    }
  }
}
