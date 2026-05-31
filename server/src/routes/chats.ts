import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as chatService from '../services/chat.service.js'
import * as characterService from '../services/character.service.js'
import * as presetService from '../services/preset.service.js'
import * as worldService from '../services/world.service.js'
import { getEngine } from '../engine/index.js'
import { matchWorldEntries } from '../lib/world-match.js'
import { AppError, ErrorCode } from '../lib/errors.js'

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
  const message = await chatService.addMessage(characterName, chatId, !is_system, content, name, is_system, extra)
  return c.json(message, 201)
})

const generateSchema = z.object({
  config: z.object({
    apiUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    type: z.enum(['openai', 'kobold', 'textgen', 'novel', 'custom']),
  }),
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
  return handleGenerate(c, characterName, chatId, config, presetType, presetName, false, genOverrides)
})

chatsRoute.post('/:characterName/:chatId/stream', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides } = c.req.valid('json')
  return handleGenerate(c, characterName, chatId, config, presetType, presetName, true, genOverrides)
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
) {
  const character = await characterService.getCharacter(characterName)
  const chat = await chatService.getChat(characterName, chatId)

  const basePreset = presetName && presetType
    ? await presetService.getPreset(presetType, presetName) ?? presetService.getDefaultPreset()
    : presetService.getDefaultPreset()

  const preset = genOverrides ? {
    ...basePreset,
    ...(genOverrides.temperature !== undefined && { temperature: genOverrides.temperature }),
    ...(genOverrides.topP !== undefined && { top_p: genOverrides.topP }),
    ...(genOverrides.maxReplyLength !== undefined && { max_tokens: genOverrides.maxReplyLength }),
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
  const worldEntries = await loadWorldEntries(character, messages)

  if (stream) {
    const engine = getEngine()
    const abortSignal = c.req.raw.signal
    const streamGenerator = engine.generateStream({ messages, character, preset, config, userName, signal: abortSignal, worldEntries })

    let fullContent = ''

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamGenerator) {
            fullContent += chunk
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content: chunk })}\n\n`))
          }
          controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`))
          controller.close()

          if (isContinue) {
            const chatData = await chatService.getChat(characterName, chatId)
            const lastIdx = chatData.lines.length - 1
            const lastLine = chatData.lines[lastIdx] as { mes?: string; is_user?: boolean }
            if (lastIdx > 0 && lastLine.mes !== undefined && !lastLine.is_user) {
              await chatService.editMessage(characterName, chatId, lastIdx, lastLine.mes + fullContent)
            }
          } else {
            await chatService.addMessage(characterName, chatId, false, fullContent)
          }
        } catch (err) {
          if (fullContent && !(err instanceof AppError)) {
            await chatService.addMessage(characterName, chatId, false, fullContent).catch(() => {})
          }
          try {
            const errorResponse = err instanceof AppError
              ? { error: err.message, code: err.code, details: err.details }
              : { error: '生成过程中发生错误', code: ErrorCode.UNKNOWN_ERROR }
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorResponse)}\n\n`))
            controller.close()
          } catch {
            // client already disconnected
          }
        }
      },
    })

    return c.body(readable, 200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
  } else {
    const engine = getEngine()
    const response = await engine.generate({ messages, character, preset, config, userName, worldEntries })

    await chatService.addMessage(characterName, chatId, false, response.content)

    return c.json({
      content: response.content,
      finishReason: response.finishReason,
      usage: response.usage,
    })
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
  await chatService.regenerateLast(characterName, chatId)
  return handleGenerate(c, characterName, chatId, config, presetType, presetName, true, genOverrides)
})

chatsRoute.post('/:characterName/:chatId/continue', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides } = c.req.valid('json')
  return handleGenerate(c, characterName, chatId, config, presetType, presetName, true, genOverrides, true)
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
  messages: Array<{ role: string; content: string }>,
) {
  const worldNames: string[] = []

  // ST 角色卡在 extensions.world 中指定关联世界书
  const charWorld = (character.extensions as any)?.world as string | undefined
  if (charWorld) worldNames.push(charWorld)

  if (worldNames.length === 0) return undefined

  const scanText = messages.map(m => m.content).join('\n')
  const allEntries: Record<string, import('../services/world.service.js').WorldBookEntry> = {}

  for (const name of worldNames) {
    try {
      const world = await worldService.getWorld(name)
      Object.assign(allEntries, world.entries)
    } catch {
      // 世界书不存在则跳过
    }
  }

  if (Object.keys(allEntries).length === 0) return undefined
  const matched = matchWorldEntries(allEntries, scanText)
  return matched.length > 0 ? matched : undefined
}

export { chatsRoute }
