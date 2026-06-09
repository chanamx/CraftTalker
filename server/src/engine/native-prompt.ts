import type { CharacterCard } from '../lib/png-parser.js'
import type { MatchedEntry } from '../lib/world-match.js'
import { resolveMacros, type MacroEnv } from '../lib/macros.js'

export type ChatMessage = Array<{ role: string; content: string }>

// Position constants matching ST's world_info_position enum.
const WI_POSITION = {
  BEFORE_CHAR: 0,
  AFTER_CHAR: 1,
  AN_TOP: 2,
  AN_BOTTOM: 3,
  AT_DEPTH: 4,
  EM_TOP: 5,
  EM_BOTTOM: 6,
} as const

function buildWorldContent(entries: MatchedEntry[], positions: number[], macroEnv: MacroEnv): string {
  const filtered = entries.filter(e => positions.includes(e.position))
  if (filtered.length === 0) return ''
  return filtered.map(e => resolveMacros(e.content, macroEnv)).join('\n')
}

export function buildOpenAIMessages(
  messages: Array<{ role: string; content: string }>,
  character: CharacterCard,
  macroEnv: MacroEnv,
  worldEntries?: MatchedEntry[],
): ChatMessage {
  const result: ChatMessage = []
  const r = (text: string) => resolveMacros(text, macroEnv)

  let systemPrompt = ''
  if (character.system_prompt) {
    systemPrompt += r(character.system_prompt) + '\n\n'
  }

  if (worldEntries?.length) {
    const before = buildWorldContent(worldEntries, [WI_POSITION.BEFORE_CHAR, WI_POSITION.AN_TOP], macroEnv)
    if (before) systemPrompt += before + '\n\n'
  }

  systemPrompt += `你是${character.name}。${r(character.description)}\n`
  if (character.personality) {
    systemPrompt += `\n性格: ${r(character.personality)}`
  }
  if (character.scenario) {
    systemPrompt += `\n场景: ${r(character.scenario)}`
  }

  if (worldEntries?.length) {
    const after = buildWorldContent(worldEntries, [WI_POSITION.AFTER_CHAR, WI_POSITION.AN_BOTTOM], macroEnv)
    if (after) systemPrompt += `\n\n${after}`
  }

  if (character.mes_example) {
    let exampleBlock = ''
    const emTop = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_TOP], macroEnv) : ''
    if (emTop) exampleBlock += emTop + '\n'
    exampleBlock += r(character.mes_example)
    const emBottom = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_BOTTOM], macroEnv) : ''
    if (emBottom) exampleBlock += '\n' + emBottom
    systemPrompt += `\n\n对话风格参考:\n${exampleBlock}`
  }

  result.push({ role: 'system', content: systemPrompt })

  const atDepthEntries = worldEntries?.filter(e => e.position === WI_POSITION.AT_DEPTH) ?? []

  for (const msg of messages) {
    result.push(msg)
  }

  for (const entry of atDepthEntries) {
    const content = resolveMacros(entry.content, macroEnv)
    const insertIdx = Math.max(1, result.length - entry.depth)
    result.splice(insertIdx, 0, { role: 'system', content })
  }
  return result
}

export function buildCompletionPrompt(
  messages: Array<{ role: string; content: string }>,
  character: CharacterCard,
  macroEnv: MacroEnv,
  worldEntries?: MatchedEntry[],
): string {
  const parts: string[] = []
  const r = (text: string) => resolveMacros(text, macroEnv)
  const mutableMessages = [...messages]

  if (character.system_prompt) parts.push(r(character.system_prompt))

  if (worldEntries?.length) {
    const before = buildWorldContent(worldEntries, [WI_POSITION.BEFORE_CHAR, WI_POSITION.AN_TOP], macroEnv)
    if (before) parts.push(before)
  }

  if (character.description) parts.push(`[角色描述]\n${r(character.description)}`)
  if (character.personality) parts.push(`[性格]\n${r(character.personality)}`)
  if (character.scenario) parts.push(`[场景]\n${r(character.scenario)}`)

  if (worldEntries?.length) {
    const after = buildWorldContent(worldEntries, [WI_POSITION.AFTER_CHAR, WI_POSITION.AN_BOTTOM], macroEnv)
    if (after) parts.push(after)
  }

  if (character.mes_example) {
    let exampleBlock = ''
    const emTop = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_TOP], macroEnv) : ''
    if (emTop) exampleBlock += emTop + '\n'
    exampleBlock += r(character.mes_example)
    const emBottom = worldEntries?.length ? buildWorldContent(worldEntries, [WI_POSITION.EM_BOTTOM], macroEnv) : ''
    if (emBottom) exampleBlock += '\n' + emBottom
    parts.push(`[对话示例]\n${exampleBlock}`)
  }

  if (worldEntries?.length) {
    const atDepthEntries = worldEntries.filter(e => e.position === WI_POSITION.AT_DEPTH)
    for (const entry of atDepthEntries) {
      const insertIdx = Math.max(0, mutableMessages.length - entry.depth)
      const content = resolveMacros(entry.content, macroEnv)
      mutableMessages.splice(insertIdx, 0, { role: 'system', content })
    }
  }

  for (const msg of mutableMessages) {
    if (msg.role === 'user') parts.push(`用户: ${msg.content}`)
    else if (msg.role === 'assistant') parts.push(`${character.name}: ${msg.content}`)
    else if (msg.role === 'system') parts.push(msg.content)
  }

  parts.push(`${character.name}:`)
  return parts.join('\n\n')
}
