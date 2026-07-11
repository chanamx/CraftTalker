import * as chatService from './chat.service.js'
import * as characterService from './character.service.js'
import * as worldService from './world.service.js'
import { resolveMacros } from '../lib/macros.js'
import { createTokenCounter } from '../lib/tokenizer.js'
import { createError, ErrorCode } from '../lib/errors.js'
import type { GenerationOperation } from '../lib/generation-locks.js'
import {
  checkWorldInfo,
  WORLD_INFO_INSERTION_STRATEGY,
  type MatchedEntry,
  type WorldInfoChatMessage,
  type WorldInfoForceActivation,
  type WorldInfoGlobalScanData,
  type WorldInfoPromptResult,
  type WorldInfoScanSettings,
  type WorldInfoSource,
  type WorldInfoTimedEffectsMetadata,
  type WorldInfoVectorActivation,
} from '../lib/world-info-compat.js'

type Character = Awaited<ReturnType<typeof characterService.getCharacter>>
type Chat = Awaited<ReturnType<typeof chatService.getChat>>

export interface CheckWorldInfoPromptInput {
  chat: Array<string | WorldInfoChatMessage>
  maxContext?: number
  dryRun?: boolean
  globalScanData?: WorldInfoGlobalScanData
  characterName?: string
  characterTags?: string[]
  characterTagNames?: string[]
  chatId?: string
  model?: string
  userName?: string
}

export async function loadWorldEntriesForGeneration(
  character: Character,
  chat: Chat,
  messages: Array<WorldInfoChatMessage>,
  maxContext: number,
  model?: string,
  userName?: string,
  operation: GenerationOperation = 'generate',
): Promise<MatchedEntry[] | undefined> {
  const scanChatMessages = messages.map(({ name, content }) => ({ name, content })).reverse()
  const result = await scanWorldInfoForContext({
    character,
    chatRecord: chat,
    chat: scanChatMessages,
    maxContext,
    model,
    userName,
    dryRun: false,
    globalScanData: { trigger: worldInfoTriggerForOperation(operation) },
    persistRuntimeMetadata: true,
  })
  return result.matchedEntries.length > 0 ? result.matchedEntries : undefined
}

export async function getWorldInfoPromptForContext(input: CheckWorldInfoPromptInput): Promise<WorldInfoPromptResult> {
  const character = input.characterName
    ? await characterService.getCharacter(input.characterName).catch(() => undefined)
    : undefined
  const chatRecord = input.characterName && input.chatId
    ? await chatService.getChat(input.characterName, input.chatId).catch(() => undefined)
    : undefined

  return scanWorldInfoForContext({
    character,
    chatRecord,
    chat: normalizePromptChat(input.chat),
    maxContext: input.maxContext,
    model: input.model,
    userName: input.userName,
    dryRun: input.dryRun ?? true,
    globalScanData: input.globalScanData,
    characterTags: input.characterTags,
    characterTagNames: input.characterTagNames,
    persistRuntimeMetadata: input.dryRun !== true,
  })
}

async function scanWorldInfoForContext(input: {
  character?: Character
  chatRecord?: Chat
  chat: WorldInfoChatMessage[]
  maxContext?: number
  model?: string
  userName?: string
  dryRun: boolean
  globalScanData?: WorldInfoGlobalScanData
  characterTags?: string[]
  characterTagNames?: string[]
  persistRuntimeMetadata: boolean
}): Promise<WorldInfoPromptResult> {
  const sources = await collectWorldInfoSources(input.character, input.chatRecord)
  const settings = buildWorldInfoSettings(
    sources,
    input.character,
    input.chatRecord,
    input.globalScanData,
    input.characterTags,
    input.characterTagNames,
  )
  settings.dryRun = input.dryRun
  settings.tokenCounter = createTokenCounter(input.model)
  settings.macroResolver = text => resolveMacros(text, {
    user: input.userName || 'User',
    char: input.character?.name ?? '',
  })

  if (input.chatRecord) {
    settings.timedEffects = getTimedWorldInfo(input.chatRecord)
    settings.scanInjects = getWorldInfoScanInjects(input.chatRecord)
    settings.forceActivations = getWorldInfoForceActivations(input.chatRecord)
    settings.vectorActivations = getWorldInfoVectorActivations(input.chatRecord)
  }

  const result = await checkWorldInfo({
    sources,
    chat: input.chat.map(message => message.content),
    chatMessages: input.chat,
    maxContext: input.maxContext,
    settings,
  })

  const shouldClearExternalActivations = input.chatRecord ? hasWorldInfoExternalActivations(input.chatRecord) : false
  if (input.persistRuntimeMetadata && input.chatRecord && (result.timedEffectsChanged || shouldClearExternalActivations)) {
    await saveWorldInfoRuntimeMetadata(
      input.chatRecord.characterName,
      input.chatRecord.chatId,
      input.chatRecord,
      result.timedEffectsChanged ? result.timedEffects : undefined,
      shouldClearExternalActivations,
    )
  }

  return result
}

async function collectWorldInfoSources(
  character: Character | undefined,
  chat: Chat | undefined,
): Promise<WorldInfoSource[]> {
  const sources: WorldInfoSource[] = []
  const addedWorldNames = new Set<string>()

  if (character) {
    for (const worldName of worldService.getWorldNamesFromExtensions(character.extensions as Record<string, unknown> | undefined)) {
      await addWorldSource(sources, addedWorldNames, worldName, 'character')
    }
  }

  try {
    const allWorlds = await worldService.listWorlds()
    for (const world of allWorlds) {
      if (world.enabled && world.global_enabled) {
        await addWorldSource(sources, addedWorldNames, world.name, 'global')
      }
    }
  } catch {
    // Listing failures should not break generation or compatibility dry-runs.
  }

  if (chat) {
    const chatWorldName = getChatWorldName(chat)
    if (chatWorldName && !addedWorldNames.has(chatWorldName)) {
      const source = await loadWorldSource(chatWorldName, 'chat')
      if (source) {
        sources.unshift(source)
        addedWorldNames.add(chatWorldName)
      }
    }

    const personaWorldName = getPersonaWorldName(chat)
    if (personaWorldName) {
      await addWorldSource(sources, addedWorldNames, personaWorldName, 'persona')
    }
  }

  return sources
}

async function addWorldSource(
  sources: WorldInfoSource[],
  addedWorldNames: Set<string>,
  worldName: string,
  type: WorldInfoSource['type'],
): Promise<void> {
  if (addedWorldNames.has(worldName)) return
  const source = await loadWorldSource(worldName, type)
  if (!source) return
  sources.push(source)
  addedWorldNames.add(worldName)
}

async function loadWorldSource(name: string, type: WorldInfoSource['type']): Promise<WorldInfoSource | null> {
  try {
    const world = await worldService.getWorld(name)
    if (!world.enabled) return null
    return {
      name,
      type,
      entries: world.entries,
      scanDepth: world.scan_depth,
      recursive: world.recursive_scanning,
      recursiveDepth: world.recursive_scanning_depth,
      tokenBudget: world.token_budget,
    }
  } catch {
    return null
  }
}

function buildWorldInfoSettings(
  sources: WorldInfoSource[],
  character: Character | undefined,
  chat: Chat | undefined,
  globalScanData: WorldInfoGlobalScanData | undefined,
  characterTags: string[] | undefined,
  characterTagNames: string[] | undefined,
): WorldInfoScanSettings {
  let depth = 4
  let recursive = false
  let maxRecursionSteps = 0
  let budgetPercent: number | undefined
  let budgetCap: number | undefined
  let budgetTokens: number | undefined
  let caseSensitive: boolean | undefined
  let matchWholeWords: boolean | undefined
  let useGroupScoring: boolean | undefined
  let characterStrategy: number = WORLD_INFO_INSERTION_STRATEGY.character_first
  let includeNames = true

  for (const source of sources) {
    if (typeof source.scanDepth === 'number' && source.scanDepth > depth) {
      depth = source.scanDepth
    }
    const sourceRecursive = source.recursive === true
    recursive ||= sourceRecursive
    if (sourceRecursive && typeof source.recursiveDepth === 'number') {
      maxRecursionSteps = Math.max(maxRecursionSteps, source.recursiveDepth)
    }
    if (typeof source.tokenBudget === 'number' && Number.isFinite(source.tokenBudget) && source.tokenBudget > 0) {
      if (source.tokenBudget <= 100) {
        budgetPercent = Math.min(budgetPercent ?? 100, source.tokenBudget)
      } else {
        budgetCap = Math.min(budgetCap ?? Number.MAX_SAFE_INTEGER, source.tokenBudget)
      }
    }
  }

  const metadataSettings = chat ? getWorldInfoSettingsMetadata(chat) : undefined
  const metadataDepth = numberValue(metadataSettings?.world_info_depth)
  if (metadataDepth !== undefined && metadataDepth >= 0) depth = metadataDepth

  const metadataMinActivations = numberValue(metadataSettings?.world_info_min_activations)
  const metadataMinActivationsDepthMax = numberValue(metadataSettings?.world_info_min_activations_depth_max)
  const metadataBudgetPercent = numberValue(metadataSettings?.world_info_budget)
  if (metadataBudgetPercent !== undefined && metadataBudgetPercent > 0) {
    budgetPercent = Math.min(metadataBudgetPercent, 100)
  }

  const metadataBudgetCap = numberValue(metadataSettings?.world_info_budget_cap)
  if (metadataBudgetCap !== undefined && metadataBudgetCap > 0) budgetCap = metadataBudgetCap

  const metadataRecursive = booleanValue(metadataSettings?.world_info_recursive)
  if (metadataRecursive !== undefined) recursive = metadataRecursive

  const metadataMaxRecursionSteps = numberValue(metadataSettings?.world_info_max_recursion_steps)
  if (metadataMaxRecursionSteps !== undefined && metadataMaxRecursionSteps >= 0) {
    maxRecursionSteps = metadataMaxRecursionSteps
  }

  caseSensitive = booleanValue(metadataSettings?.world_info_case_sensitive)
  matchWholeWords = booleanValue(metadataSettings?.world_info_match_whole_words)
  useGroupScoring = booleanValue(metadataSettings?.world_info_use_group_scoring)

  const metadataStrategy = numberValue(metadataSettings?.world_info_character_strategy)
  if (metadataStrategy === WORLD_INFO_INSERTION_STRATEGY.evenly
    || metadataStrategy === WORLD_INFO_INSERTION_STRATEGY.character_first
    || metadataStrategy === WORLD_INFO_INSERTION_STRATEGY.global_first) {
    characterStrategy = metadataStrategy
  }

  includeNames = booleanValue(metadataSettings?.world_info_include_names) ?? includeNames
  const cardTags = character && Array.isArray(character.tags) ? character.tags : undefined

  return {
    depth,
    minActivations: metadataMinActivations,
    minActivationsDepthMax: metadataMinActivationsDepthMax,
    recursive,
    maxRecursionSteps,
    budgetPercent,
    budgetCap,
    budgetTokens,
    caseSensitive,
    matchWholeWords,
    useGroupScoring,
    characterStrategy,
    trigger: stringValue(globalScanData?.trigger) ?? 'normal',
    includeNames,
    characterName: character?.name,
    characterTags: mergeStringArrays(characterTags, cardTags),
    characterTagNames: mergeStringArrays(characterTagNames, cardTags),
    globalScanData: {
      personaDescription: chat ? getPersonaDescription(chat) : undefined,
      characterDescription: character?.description,
      characterPersonality: character?.personality,
      scenario: character?.scenario,
      creatorNotes: character?.creator_notes,
      characterDepthPrompt: character?.system_prompt ?? '',
      ...globalScanData,
    },
  }
}

function worldInfoTriggerForOperation(operation: GenerationOperation): string {
  return operation === 'generate' ? 'normal' : operation
}

function mergeStringArrays(...values: Array<string[] | undefined>): string[] | undefined {
  if (!values.some(Array.isArray)) return undefined
  const merged = values
    .flatMap(value => value ?? [])
    .map(value => String(value).trim())
    .filter(Boolean)
  return [...new Set(merged)]
}

function normalizePromptChat(chat: Array<string | WorldInfoChatMessage>): WorldInfoChatMessage[] {
  return chat
    .map((message) => {
      if (typeof message === 'string') return { content: message }
      if (!message || typeof message !== 'object') return { content: '' }
      return {
        name: typeof message.name === 'string' ? message.name : undefined,
        content: typeof message.content === 'string' ? message.content : '',
      }
    })
    .filter(message => message.content.trim())
}

function getChatWorldName(chat: Chat): string | undefined {
  return stringValue(getChatMetadata(chat)?.world_info)
}

function getPersonaWorldName(chat: Chat): string | undefined {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return undefined

  return firstStringValue([
    chatMetadata.persona_description_lorebook,
    chatMetadata.persona_lorebook,
    chatMetadata.personaLorebook,
    chatMetadata.persona_world_info,
    chatMetadata.personaWorldInfo,
    recordValue(chatMetadata.persona)?.lorebook,
  ])
}

function getPersonaDescription(chat: Chat): string | undefined {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return undefined

  return firstStringValue([
    chatMetadata.persona_description,
    chatMetadata.personaDescription,
    recordValue(chatMetadata.persona)?.description,
  ])
}

function getTimedWorldInfo(chat: Chat): WorldInfoTimedEffectsMetadata | undefined {
  const timedWorldInfo = getChatMetadata(chat)?.timedWorldInfo
  if (!timedWorldInfo || typeof timedWorldInfo !== 'object' || Array.isArray(timedWorldInfo)) return undefined
  return timedWorldInfo as WorldInfoTimedEffectsMetadata
}

function getWorldInfoScanInjects(chat: Chat): string[] {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return []

  const scanInjects = [
    ...stringArrayValue(chatMetadata.world_info_scan_injects),
    ...stringArrayValue(chatMetadata.worldInfoScanInjects),
    ...extensionPromptScanValues(chatMetadata.extensionPrompts),
    ...extensionPromptScanValues(chatMetadata.extension_prompts),
  ]

  return [...new Set(scanInjects.map(item => item.trim()).filter(Boolean))]
}

function getWorldInfoForceActivations(chat: Chat): WorldInfoForceActivation[] {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return []

  return [
    ...forceActivationValues(chatMetadata.worldinfo_force_activate),
    ...forceActivationValues(chatMetadata.worldInfoForceActivate),
    ...forceActivationValues(chatMetadata.world_info_force_activations),
    ...forceActivationValues(chatMetadata.worldInfoForceActivations),
  ]
}

function getWorldInfoVectorActivations(chat: Chat): WorldInfoVectorActivation[] {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return []

  const worldInfoBuffer = recordValue(chatMetadata.worldInfoBuffer) ?? recordValue(chatMetadata.world_info_buffer)
  return [
    ...vectorActivationValues(chatMetadata.worldinfo_vector_activate),
    ...vectorActivationValues(chatMetadata.worldInfoVectorActivate),
    ...vectorActivationValues(chatMetadata.world_info_vector_activations),
    ...vectorActivationValues(chatMetadata.worldInfoVectorActivations),
    ...vectorActivationValues(chatMetadata.vectorActivations),
    ...vectorActivationValues(worldInfoBuffer?.externalActivations),
  ]
}

function hasWorldInfoExternalActivations(chat: Chat): boolean {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return false

  const worldInfoBuffer = recordValue(chatMetadata.worldInfoBuffer) ?? recordValue(chatMetadata.world_info_buffer)
  return activationRecordValues(worldInfoBuffer?.externalActivations).length > 0
}

function getWorldInfoSettingsMetadata(chat: Chat): Record<string, unknown> | undefined {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return undefined
  const nestedSettings = recordValue(chatMetadata.world_info_settings)
  return nestedSettings ? { ...nestedSettings, ...chatMetadata } : chatMetadata
}

async function saveWorldInfoRuntimeMetadata(
  characterName: string,
  chatId: string,
  chat: Chat,
  timedWorldInfo: WorldInfoTimedEffectsMetadata | undefined,
  clearExternalActivations: boolean,
): Promise<void> {
  const chatMetadata = {
    ...(getChatMetadata(chat) ?? {}),
    ...(timedWorldInfo ? { timedWorldInfo } : {}),
  }
  if (clearExternalActivations) {
    clearWorldInfoExternalActivations(chatMetadata, 'worldInfoBuffer')
    clearWorldInfoExternalActivations(chatMetadata, 'world_info_buffer')
  }
  try {
    const updated = await chatService.updateChatMetadata(characterName, chatId, chatMetadata)
    if (!updated) {
      throw new Error('Chat metadata is no longer available')
    }
  } catch (error) {
    console.warn('[WI] Failed to persist world info runtime metadata:', error)
    if (clearExternalActivations) {
      throw createError(
        ErrorCode.FILE_WRITE_ERROR,
        'Failed to consume external world info activations',
      )
    }
  }
}

function clearWorldInfoExternalActivations(chatMetadata: Record<string, unknown>, key: string): void {
  const worldInfoBuffer = recordValue(chatMetadata[key])
  if (!worldInfoBuffer) return

  const nextWorldInfoBuffer = { ...worldInfoBuffer }
  delete nextWorldInfoBuffer.externalActivations
  chatMetadata[key] = nextWorldInfoBuffer
}

function getChatMetadata(chat: Chat): Record<string, unknown> | undefined {
  const metadata = chat.lines[0] as { chat_metadata?: unknown } | undefined
  return isRecord(metadata?.chat_metadata) ? metadata.chat_metadata : undefined
}

function extensionPromptScanValues(value: unknown): string[] {
  if (!isRecord(value)) return []

  const prompts: string[] = []
  for (const prompt of Object.values(value)) {
    if (typeof prompt === 'string') continue
    if (!isRecord(prompt) || prompt.scan !== true) continue
    if (typeof prompt.value === 'string') prompts.push(prompt.value)
  }
  return prompts
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function forceActivationValues(value: unknown): WorldInfoForceActivation[] {
  const activations: WorldInfoForceActivation[] = []
  for (const item of activationRecordValues(value)) {
    const activation = forceActivationValue(item)
    if (activation) activations.push(activation)
  }

  return activations
}

function vectorActivationValues(value: unknown): WorldInfoVectorActivation[] {
  const activations: WorldInfoVectorActivation[] = []
  for (const item of activationRecordValues(value)) {
    const forceActivation = forceActivationValue(item)
    if (!forceActivation) continue

    const activation: WorldInfoVectorActivation = { ...forceActivation }
    const score = numberValue(item.score)
    if (score !== undefined) activation.score = score
    if (typeof item.source === 'string' && item.source.trim()) activation.source = item.source.trim()
    activations.push(activation)
  }

  return activations
}

function activationRecordValues(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return []
  if (stringValue(value.world) && numberValue(value.uid) !== undefined) return [value]

  const records: Array<Record<string, unknown>> = []
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) records.push(...item.filter(isRecord))
    else if (isRecord(item)) records.push(item)
  }
  return records
}

function forceActivationValue(item: Record<string, unknown>): WorldInfoForceActivation | null {
  const world = stringValue(item.world)
  const uid = numberValue(item.uid)
  if (!world || uid === undefined || uid < 0) return null

  const activation: WorldInfoForceActivation = { world, uid: Math.floor(uid) }
  if (typeof item.content === 'string') activation.content = item.content
  assignOptionalNumber(activation, 'position', item.position)
  assignOptionalNumber(activation, 'depth', item.depth)
  assignOptionalNumber(activation, 'insertion_order', item.insertion_order ?? item.insertionOrder)
  assignOptionalNumber(activation, 'role', item.role)
  return activation
}

function assignOptionalNumber<T extends 'position' | 'depth' | 'insertion_order' | 'role'>(
  target: WorldInfoForceActivation,
  key: T,
  value: unknown,
): void {
  const parsed = numberValue(value)
  if (parsed !== undefined) target[key] = Math.floor(parsed)
}

function firstStringValue(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = stringValue(value)
    if (text) return text
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
