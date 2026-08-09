/** Seed content for the knowledge base (migrated from the old user-profile.md). */
export const DEFAULT_KNOWLEDGE = `# Base de conhecimento

Anote aqui o que a IA e as recomendações devem saber sobre você.

## Perfil de viagem
- gosta de café
- gosta de anime
- gosta de vida noturna
- trabalha remotamente
- prefere bairros caminháveis
- gosta de ramen e izakaya
`

/** Extract "- " bullet lines from the knowledge base text. */
export function knowledgeBullets(md: string): string[] {
  return md
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('-'))
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean)
}
