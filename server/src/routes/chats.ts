import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as chatService from '../services/chat.service.js'
import * as characterService from '../services/character.service.js'
import * as presetService from '../services/preset.service.js'
import * as worldService from '../services/world.service.js'
import { getEngine } from '../engine/index.js'
import { checkWorldInfo, WORLD_INFO_INSERTION_STRATEGY, type WorldInfoChatMessage, type WorldInfoForceActivation, type WorldInfoScanSettings, type WorldInfoSource, type WorldInfoTimedEffectsMetadata } from '../lib/world-info-compat.js'
import { AppError, ErrorCode } from '../lib/errors.js'
import {
  getGenerationLockInfo,
  tryAcquireGenerationLock,
  type GenerationOperation,
} from '../lib/generation-locks.js'
import * as runService from '../services/run.service.js'
import { llmConfigSchema, resolveLlmConfigApiKey } from '../lib/llm-config.js'
import { createTokenCounter } from '../lib/tokenizer.js'
import { resolveMacros } from '../lib/macros.js'

const chatsRoute = new Hono()

chatsRoute.get('/:characterName', async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chats = await chatService.listChats(characterName)
  return c.json(chats)
})

chatsRoute.get('/:characterName/:chatId', async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const chat = await chatService.getChat(characterName, chatId)
  return c.json(chat)
})

const createSchema = z.object({
  userName: z.string().optional(),
})

chatsRoute.post('/:characterName', zValidator('json', createSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const { userName } = c.req.valid('json')
  const chat = await chatService.createChat(characterName, userName)
  return c.json(chat, 201)
})

const messageSchema = z.object({
  content: z.string().min(1),
  name: z.string().optional(),
  is_system: z.boolean().optional(),
  extra: z.record(z.unknown()).optional(),
})

chatsRoute.post('/:characterName/:chatId/messages', zValidator('json', messageSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { content, name, is_system, extra } = c.req.valid('json')
  // is_system 为 true 时是系统消息，否则默认为用户消息
  const isUser = !is_system
  const message = await chatService.addMessage(characterName, chatId, isUser, content, name, is_system ?? false, extra)
  return c.json(message, 201)
})

const generateSchema = z.object({
  config: llmConfigSchema,
  presetType: z.enum(presetService.GENERATION_PRESET_TYPES).optional(),
  presetName: z.string().optional(),
  genOverrides: z.object({
    temperature: z.number().min(0).max(5).optional(),
    topP: z.number().min(0).max(1).optional(),
    contextLength: z.number().int().min(1).max(2000000).optional(),
    maxReplyLength: z.number().int().min(1).max(2000000).optional(),
  }).optional(),
})

chatsRoute.post('/:characterName/:chatId/generate', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides } = c.req.valid('json')
  return handleGenerate(c, characterName, chatId, config, presetType, presetName, false, genOverrides, false, 'generate')
})

chatsRoute.post('/:characterName/:chatId/stream', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides } = c.req.valid('json')
  return handleGenerate(c, characterName, chatId, config, presetType, presetName, true, genOverrides, false, 'generate')
})

async function handleGenerate(
  c: Context,
  characterName: string,
  chatId: string,
  config: z.infer<typeof generateSchema>['config'],
  presetType?: z.infer<typeof generateSchema>['presetType'],
  presetName?: string,
  stream: boolean = true,
  genOverrides?: z.infer<typeof generateSchema>['genOverrides'],
  isContinue: boolean = false,
  operation: GenerationOperation = 'generate',
  beforeGenerate?: () => Promise<void>,
) {
  const lock = tryAcquireGenerationLock(characterName, chatId, operation)
  if (!lock) {
    const active = getGenerationLockInfo(characterName, chatId)
    return c.json({
      error: '当前聊天正在生成，请稍后再试',
      code: ErrorCode.GENERATION_IN_PROGRESS,
      details: active ? {
        characterName: active.characterName,
        chatId: active.chatId,
        operation: active.operation,
        startedAt: active.startedAt,
      } : { characterName, chatId },
    }, 409)
  }

  let releaseInFinally = true

  try {
    await runService.interruptActiveRunsForChat(characterName, chatId)
    const run = await runService.createGenerationRun({ characterName, chatId, operation })
    const resolvedConfig = resolveLlmConfigApiKey(config)

    await beforeGenerate?.()
    const character = await characterService.getCharacter(characterName)
    const chat = await chatService.getChat(characterName, chatId)

    const basePreset = await presetService.getGenerationPreset(presetType, presetName)

    const preset = genOverrides ? {
      ...basePreset,
      ...(genOverrides.temperature !== undefined && { temperature: genOverrides.temperature }),
      ...(genOverrides.topP !== undefined && { top_p: genOverrides.topP }),
      ...(genOverrides.maxReplyLength !== undefined && { max_tokens: genOverrides.maxReplyLength }),
      ...(genOverrides.contextLength !== undefined && { max_context: genOverrides.contextLength }),
    } : basePreset

    const metadata = chat.lines[0] as { user_name?: string }
    const userName = metadata?.user_name

    const chatMessages = chat.lines
      .filter(l => 'mes' in l)
      .map(l => {
        const msg = l as { name?: string; is_user: boolean; is_system?: boolean; mes: string }
        return {
          name: msg.name,
          role: msg.is_system ? 'system' as const : msg.is_user ? 'user' as const : 'assistant' as const,
          content: msg.mes,
        }
      })
    const messages = chatMessages.map(({ role, content }) => ({ role, content }))

  // 世界书匹配：扫描最近对话内容，匹配关键词条目
    const worldEntries = await loadWorldEntries(character, chat, chatMessages, getContextLength(preset, genOverrides), resolvedConfig.model, userName)

    if (stream) {
      const engine = getEngine()
      const abortSignal = c.req.raw.signal
      const streamGenerator = engine.generateStream({ messages, character, preset, config: resolvedConfig, userName, signal: abortSignal, worldEntries })

      const chunks: string[] = []
      let saved = false
      let lastPartialFlushAt = 0
      let committedLineIndex: number | undefined

      const saveGeneratedContent = async () => {
        if (saved || chunks.length === 0) return
        const fullContent = chunks.join('')
        if (!fullContent) return

        if (isContinue) {
          const chatData = await chatService.getChat(characterName, chatId)
          const lastIdx = chatData.lines.length - 1
          const lastLine = chatData.lines[lastIdx] as { mes?: string; is_user?: boolean }
          if (lastIdx > 0 && lastLine.mes !== undefined && !lastLine.is_user) {
            await chatService.editMessage(characterName, chatId, lastIdx, lastLine.mes + fullContent)
            committedLineIndex = lastIdx
          }
        } else {
          await chatService.addMessage(characterName, chatId, false, fullContent)
          const chatData = await chatService.getChat(characterName, chatId)
          committedLineIndex = chatData.lines.length - 1
        }

        saved = true
      }

      const flushPartial = async (force = false) => {
        const now = Date.now()
        if (!force && now - lastPartialFlushAt < 500) return
        lastPartialFlushAt = now
        await runService.updateRunPartial(run.runId, chunks.join('')).catch(() => {})
      }

      const readable = new ReadableStream({
        async start(controller) {
        try {
            for await (const chunk of streamGenerator) {
              chunks.push(chunk)
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
              await flushPartial()
            }
            await flushPartial(true)
            await saveGeneratedContent()
            await runService.completeRun(run.runId, {
              partialContent: chunks.join(''),
              committedLineIndex,
            }).catch(() => {})
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`))
            controller.close()
          } catch (err) {
            if (!(err instanceof AppError)) {
              await saveGeneratedContent().catch(() => {})
            }
            await runService.failRun(run.runId, {
              error: err instanceof Error ? err.message : String(err),
              partialContent: chunks.join(''),
              committedLineIndex,
            }).catch(() => {})
            try {
            const errorResponse = err instanceof AppError
              ? { error: err.message, code: err.code, details: err.details }
              : { error: '生成过程中发生错误', code: ErrorCode.UNKNOWN_ERROR }
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorResponse)}\n\n`))
            controller.close()
          } catch {
            // client already disconnected
          }
        } finally {
          lock.release()
        }
        },
        cancel() {
          runService.cancelRun(run.runId, { partialContent: chunks.join(''), error: 'Client disconnected' }).catch(() => {})
          lock.release()
        },
      })

      releaseInFinally = false
      return c.body(readable, 200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    } else {
      const engine = getEngine()
      const response = await engine.generate({ messages, character, preset, config: resolvedConfig, userName, worldEntries })

      await chatService.addMessage(characterName, chatId, false, response.content)
      const chatData = await chatService.getChat(characterName, chatId)
      await runService.completeRun(run.runId, {
        partialContent: response.content,
        committedLineIndex: chatData.lines.length - 1,
      })

      return c.json({
      content: response.content,
      finishReason: response.finishReason,
      usage: response.usage,
    })
    }
  } finally {
    if (releaseInFinally) lock.release()
  }
}

chatsRoute.delete('/:characterName/:chatId', async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  await chatService.deleteChat(characterName, chatId)
  return c.json({ success: true })
})

chatsRoute.delete('/:characterName/:chatId/messages/:lineIndex', async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const lineIndex = Number(c.req.param('lineIndex'))
  const deleted = await chatService.deleteMessage(characterName, chatId, lineIndex)
  if (!deleted) return c.json({ error: 'Message not found' }, 404)
  return c.json({ success: true })
})

const editMsgSchema = z.object({
  content: z.string().min(1),
})

chatsRoute.patch('/:characterName/:chatId/messages/:lineIndex', zValidator('json', editMsgSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const lineIndex = Number(c.req.param('lineIndex'))
  const { content } = c.req.valid('json')
  const updated = await chatService.editMessage(characterName, chatId, lineIndex, content)
  if (!updated) return c.json({ error: 'Message not found' }, 404)
  return c.json(updated)
})

chatsRoute.post('/:characterName/:chatId/regenerate', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides } = c.req.valid('json')
  return handleGenerate(
    c,
    characterName,
    chatId,
    config,
    presetType,
    presetName,
    true,
    genOverrides,
    false,
    'regenerate',
    () => chatService.regenerateLast(characterName, chatId).then(() => undefined),
  )
})

chatsRoute.post('/:characterName/:chatId/continue', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides } = c.req.valid('json')
  return handleGenerate(c, characterName, chatId, config, presetType, presetName, true, genOverrides, true, 'continue')
})

const swipeSchema = z.object({
  swipeId: z.number().int().min(0),
})

chatsRoute.post('/:characterName/:chatId/messages/:lineIndex/swipe', zValidator('json', swipeSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const lineIndex = Number(c.req.param('lineIndex'))
  const { swipeId } = c.req.valid('json')
  const updated = await chatService.switchSwipe(characterName, chatId, lineIndex, swipeId)
  if (!updated) return c.json({ error: 'Swipe not found' }, 404)
  return c.json(updated)
})

const renameSchema = z.object({
  chatName: z.string().min(1),
})

chatsRoute.patch('/:characterName/:chatId', zValidator('json', renameSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { chatName } = c.req.valid('json')
  await chatService.renameChatFile(characterName, chatId, chatName)
  return c.json({ success: true })
})

async function loadWorldEntries(
  character: Awaited<ReturnType<typeof characterService.getCharacter>>,
  chat: Awaited<ReturnType<typeof chatService.getChat>>,
  messages: Array<WorldInfoChatMessage>,
  maxContext: number,
  model?: string,
  userName?: string,
) {
  const sources: WorldInfoSource[] = []
  const addedWorldNames = new Set<string>()

  // 角色绑定的世界书
  for (const worldName of worldService.getWorldNamesFromExtensions(character.extensions as Record<string, unknown> | undefined)) {
    const source = await loadWorldSource(worldName, 'character')
    if (source) {
      sources.push(source)
      addedWorldNames.add(worldName)
    }
  }

  // 加载启用的全局世界书。global_enabled 缺失时兼容旧数据：未绑定任何角色的世界书视为全局。
  try {
    const allWorlds = await worldService.listWorlds()
    for (const w of allWorlds) {
      if (w.enabled && w.global_enabled && !addedWorldNames.has(w.name)) {
        const source = await loadWorldSource(w.name, 'global')
        if (source) {
          sources.push(source)
          addedWorldNames.add(w.name)
        }
      }
    }
  } catch { /* 列表失败不阻塞生成 */ }

  const chatWorldName = getChatWorldName(chat)
  if (chatWorldName && !addedWorldNames.has(chatWorldName)) {
    const source = await loadWorldSource(chatWorldName, 'chat')
    if (source) {
      sources.unshift(source)
      addedWorldNames.add(chatWorldName)
    }
  }

  const personaWorldName = getPersonaWorldName(chat)
  if (personaWorldName && !addedWorldNames.has(personaWorldName)) {
    const source = await loadWorldSource(personaWorldName, 'persona')
    if (source) {
      sources.push(source)
      addedWorldNames.add(personaWorldName)
    }
  }

  if (sources.length === 0) return undefined

  const settings = buildWorldInfoSettings(sources, character, chat)
  settings.timedEffects = getTimedWorldInfo(chat)
  settings.tokenCounter = createTokenCounter(model)
  settings.scanInjects = getWorldInfoScanInjects(chat)
  settings.forceActivations = getWorldInfoForceActivations(chat)
  settings.macroResolver = text => resolveMacros(text, { user: userName || '用户', char: character.name })
  const scanChatMessages = messages.map(({ name, content }) => ({ name, content })).reverse()
  const result = await checkWorldInfo({
    sources,
    chat: scanChatMessages.map(message => message.content),
    chatMessages: scanChatMessages,
    maxContext,
    settings,
  })
  if (result.timedEffectsChanged) {
    await saveTimedWorldInfo(chat.characterName, chat.chatId, chat, result.timedEffects)
  }
  return result.matchedEntries.length > 0 ? result.matchedEntries : undefined
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
  character: Awaited<ReturnType<typeof characterService.getCharacter>>,
  chat: Awaited<ReturnType<typeof chatService.getChat>>,
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
    for (const entry of Object.values(source.entries)) {
      if (typeof entry.scan_depth === 'number' && entry.scan_depth > depth) {
        depth = entry.scan_depth
      }
    }
  }

  const metadataSettings = getWorldInfoSettingsMetadata(chat)
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
    trigger: 'normal',
    includeNames,
    characterName: character.name,
    characterTags: Array.isArray(character.tags) ? character.tags : [],
    globalScanData: {
      personaDescription: getPersonaDescription(chat),
      characterDescription: character.description,
      characterPersonality: character.personality,
      scenario: character.scenario,
      creatorNotes: character.creator_notes,
      characterDepthPrompt: character.system_prompt ?? '',
    },
  }
}

function getChatWorldName(chat: Awaited<ReturnType<typeof chatService.getChat>>): string | undefined {
  return stringValue(getChatMetadata(chat)?.world_info)
}

function getPersonaWorldName(chat: Awaited<ReturnType<typeof chatService.getChat>>): string | undefined {
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

function getPersonaDescription(chat: Awaited<ReturnType<typeof chatService.getChat>>): string | undefined {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return undefined

  return firstStringValue([
    chatMetadata.persona_description,
    chatMetadata.personaDescription,
    recordValue(chatMetadata.persona)?.description,
  ])
}

function getTimedWorldInfo(chat: Awaited<ReturnType<typeof chatService.getChat>>): WorldInfoTimedEffectsMetadata | undefined {
  const timedWorldInfo = getChatMetadata(chat)?.timedWorldInfo
  if (!timedWorldInfo || typeof timedWorldInfo !== 'object' || Array.isArray(timedWorldInfo)) return undefined
  return timedWorldInfo as WorldInfoTimedEffectsMetadata
}

function getWorldInfoScanInjects(chat: Awaited<ReturnType<typeof chatService.getChat>>): string[] {
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

function getWorldInfoForceActivations(chat: Awaited<ReturnType<typeof chatService.getChat>>): WorldInfoForceActivation[] {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return []

  return [
    ...forceActivationValues(chatMetadata.worldinfo_force_activate),
    ...forceActivationValues(chatMetadata.worldInfoForceActivate),
    ...forceActivationValues(chatMetadata.world_info_force_activations),
    ...forceActivationValues(chatMetadata.worldInfoForceActivations),
  ]
}

function getWorldInfoSettingsMetadata(chat: Awaited<ReturnType<typeof chatService.getChat>>): Record<string, unknown> | undefined {
  const chatMetadata = getChatMetadata(chat)
  if (!chatMetadata) return undefined
  const nestedSettings = recordValue(chatMetadata.world_info_settings)
  return nestedSettings ? { ...nestedSettings, ...chatMetadata } : chatMetadata
}

async function saveTimedWorldInfo(
  characterName: string,
  chatId: string,
  chat: Awaited<ReturnType<typeof chatService.getChat>>,
  timedWorldInfo: WorldInfoTimedEffectsMetadata,
): Promise<void> {
  const chatMetadata = {
    ...(getChatMetadata(chat) ?? {}),
    timedWorldInfo,
  }
  await chatService.updateChatMetadata(characterName, chatId, chatMetadata).catch((error) => {
    console.warn('[WI] Failed to persist timed world info metadata:', error)
  })
}

function getChatMetadata(chat: Awaited<ReturnType<typeof chatService.getChat>>): Record<string, unknown> | undefined {
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
  if (!Array.isArray(value)) return []

  const activations: WorldInfoForceActivation[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const world = stringValue(item.world)
    const uid = numberValue(item.uid)
    if (!world || uid === undefined || uid < 0) continue

    const activation: WorldInfoForceActivation = { world, uid: Math.floor(uid) }
    if (typeof item.content === 'string') activation.content = item.content
    assignOptionalNumber(activation, 'position', item.position)
    assignOptionalNumber(activation, 'depth', item.depth)
    assignOptionalNumber(activation, 'insertion_order', item.insertion_order ?? item.insertionOrder)
    assignOptionalNumber(activation, 'role', item.role)
    activations.push(activation)
  }

  return activations
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

function getContextLength(
  preset: presetService.GenerationPreset,
  genOverrides?: z.infer<typeof generateSchema>['genOverrides'],
): number {
  const override = genOverrides?.contextLength
  if (typeof override === 'number' && Number.isFinite(override)) return override
  const presetContext = preset.max_context
  if (typeof presetContext === 'number' && Number.isFinite(presetContext)) return presetContext
  return 4096
}

export { chatsRoute }
