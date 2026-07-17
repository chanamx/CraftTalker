import type { CharacterCard } from '../lib/png-parser.js'
import type { EngineMessage, EnginePromptAnchors } from '../engine/types.js'

export interface PromptBuildOptions {
  character: CharacterCard
  messages: EngineMessage[]
  userName?: string
  worldInfo?: string[]
  promptAnchors?: EnginePromptAnchors
}

export interface BuiltPrompt {
  messages: EngineMessage[]
}

export function buildSTPrompt(options: PromptBuildOptions): BuiltPrompt {
  const { character, messages, userName = 'User', worldInfo = [], promptAnchors } = options
  const result: EngineMessage[] = []

  const systemParts: string[] = []

  result.push(...(promptAnchors?.beforeMain ?? []))

  if (character.system_prompt) {
    systemParts.push(character.system_prompt)
  }

  const worldInfoBefore = worldInfo.filter((_, i) => i % 2 === 0)
  if (worldInfoBefore.length > 0) {
    systemParts.push('[World Info]\n' + worldInfoBefore.join('\n'))
  }

  const personaParts: string[] = []
  if (character.description) personaParts.push(character.description)
  if (character.personality) personaParts.push(`Personality: ${character.personality}`)
  if (personaParts.length > 0) {
    systemParts.push(`[Character: ${character.name}]\n${personaParts.join('\n')}`)
  }

  if (character.scenario) {
    systemParts.push(`[Scenario]\n${character.scenario}`)
  }

  const worldInfoAfter = worldInfo.filter((_, i) => i % 2 === 1)
  if (worldInfoAfter.length > 0) {
    systemParts.push(worldInfoAfter.join('\n'))
  }

  if (character.mes_example) {
    const formatted = formatExampleMessages(character.mes_example, character.name, userName)
    if (formatted) systemParts.push(`[Example Dialogue]\n${formatted}`)
  }

  if (systemParts.length > 0) {
    result.push({ role: 'system', content: systemParts.join('\n\n') })
  }

  result.push(...(promptAnchors?.afterMain ?? []))

  for (const msg of messages) {
    result.push(msg)
  }

  if (character.post_history_instructions) {
    const lastUserIdx = findLastIndex(result, m => m.role === 'user')
    const insertIdx = lastUserIdx >= 0 ? lastUserIdx : result.length
    result.splice(insertIdx, 0, {
      role: 'system',
      content: character.post_history_instructions
        .replace(/{{char}}/gi, character.name)
        .replace(/{{user}}/gi, userName),
    })
  }

  return { messages: applyMacros(result, character.name, userName) }
}

function formatExampleMessages(mesExample: string, charName: string, userName: string): string {
  return mesExample
    .replace(/<START>/gi, '---')
    .replace(/{{char}}/gi, charName)
    .replace(/{{user}}/gi, userName)
    .trim()
}

function applyMacros(messages: EngineMessage[], charName: string, userName: string): EngineMessage[] {
  return messages.map(m => ({
    ...m,
    content: m.content
      .replace(/{{char}}/gi, charName)
      .replace(/{{user}}/gi, userName),
  }))
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i
  }
  return -1
}
