export interface ComposeAgent {
  systemPrompt: string
}
export interface ComposeSkill {
  name: string
  content: string
}

/**
 * Build the final prompt: agent system prompt → each skill → user prompt.
 * Empty sections are omitted; blocks are separated by a blank line.
 */
export function composePrompt(
  agent: ComposeAgent | null,
  skills: ComposeSkill[],
  userPrompt: string
): string {
  const blocks: string[] = []
  if (agent && agent.systemPrompt.trim()) {
    blocks.push(`### AGENTE\n${agent.systemPrompt.trim()}`)
  }
  for (const s of skills) {
    if (s.content.trim()) blocks.push(`### SKILL: ${s.name}\n${s.content.trim()}`)
  }
  if (userPrompt.trim()) {
    blocks.push(`### PROMPT DO USUÁRIO\n${userPrompt.trim()}`)
  }
  return blocks.join('\n\n')
}
