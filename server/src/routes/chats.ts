import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as chatService from '../services/chat.service.js'
import * as characterService from '../services/character.service.js'
import * as presetService from '../services/preset.service.js'
import * as worldService from '../services/world.service.js'
import { getEngine } from '../engine/index.js'
import { checkWorldInfo, WORLD_INFO_INSERTION_STRATEGY, type WorldInfoScanSettings, type WorldInfoSource } from '../lib/world-info-compat.js'
import { AppError, ErrorCode } from '../lib/errors.js'
import {
  getGenerationLockInfo,
  tryAcquireGenerationLock,
  type GenerationOperation,
} from '../lib/generation-locks.js'
import * as runService from '../services/run.service.js'
import { llmConfigSchema, resolveLlmConfigApiKey } from '../lib/llm-config.js'

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
  presetType: z.enum(['kobold', 'openai', 'textgen', 'novel']).optional(),
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

    const basePreset = {
      ...presetService.getDefaultPreset(),
      ...(presetName && presetType ? await presetService.getPreset(presetType, presetName) : {}),
    }

    const preset = genOverrides ? {
      ...basePreset,
      ...(genOverrides.temperature !== undefined && { temperature: genOverrides.temperature }),
      ...(genOverrides.topP !== undefined && { top_p: genOverrides.topP }),
      ...(genOverrides.maxReplyLength !== undefined && { max_tokens: genOverrides.maxReplyLength }),
      ...(genOverrides.contextLength !== undefined && { max_context: genOverrides.contextLength }),
    } : basePreset

    const metadata = chat.lines[0] as { user_name?: string }
    const userName = metadata?.user_name

    const messages = chat.lines
      .filter(l => 'mes' in l)
      .map(l => {
        const msg = l as { name: string; is_user: boolean; is_system?: boolean; mes: string }
        return {
          role: msg.is_system ? 'system' as const : msg.is_user ? 'user' as const : 'assistant' as const,
          content: msg.mes,
        }
      })

  // 世界书匹配：扫描最近对话内容，匹配关键词条目
    const worldEntries = await loadWorldEntries(character, chat, messages, getContextLength(preset, genOverrides))

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
  messages: Array<{ role: string; content: string }>,
  maxContext: number,
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
    if (source) sources.unshift(source)
  }

  if (sources.length === 0) return undefined

  const settings = buildWorldInfoSettings(sources, maxContext, character)
  const scanChat = messages.map(m => m.content).reverse()
  const result = checkWorldInfo({ sources, chat: scanChat, maxContext, settings })
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
  maxContext: number,
  character: Awaited<ReturnType<typeof characterService.getCharacter>>,
): WorldInfoScanSettings {
  let depth = 4
  let recursive = false
  let maxRecursionSteps = 0
  let budgetTokens = Number.isFinite(maxContext) && maxContext > 0 ? maxContext : Number.MAX_SAFE_INTEGER

  for (const source of sources) {
    if (typeof source.scanDepth === 'number' && source.scanDepth > depth) {
      depth = source.scanDepth
    }
    recursive ||= source.recursive === true
    if (typeof source.recursiveDepth === 'number') {
      maxRecursionSteps = Math.max(maxRecursionSteps, source.recursiveDepth)
    }
    if (typeof source.tokenBudget === 'number' && source.tokenBudget > 0) {
      budgetTokens = Math.min(budgetTokens, source.tokenBudget)
    }
    for (const entry of Object.values(source.entries)) {
      if (typeof entry.scan_depth === 'number' && entry.scan_depth > depth) {
        depth = entry.scan_depth
      }
    }
  }

  return {
    depth,
    recursive,
    maxRecursionSteps,
    budgetTokens,
    characterStrategy: WORLD_INFO_INSERTION_STRATEGY.character_first,
    trigger: 'normal',
    characterName: character.name,
    characterTags: Array.isArray(character.tags) ? character.tags : [],
    globalScanData: {
      characterDescription: character.description,
      characterPersonality: character.personality,
      scenario: character.scenario,
      creatorNotes: character.creator_notes,
      characterDepthPrompt: character.system_prompt ?? '',
    },
  }
}

function getChatWorldName(chat: Awaited<ReturnType<typeof chatService.getChat>>): string | undefined {
  const metadata = chat.lines[0] as { chat_metadata?: Record<string, unknown> } | undefined
  const worldName = metadata?.chat_metadata?.world_info
  return typeof worldName === 'string' && worldName.trim() ? worldName : undefined
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
