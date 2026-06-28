import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as chatService from '../services/chat.service.js'
import * as presetService from '../services/preset.service.js'
import { llmConfigSchema } from '../lib/llm-config.js'
import { handleGenerate } from './chat-generation.js'
import type { GenerationOperation } from '../lib/generation-locks.js'
import { loadWorldEntriesForGeneration } from '../services/world-info-runtime.service.js'
import { createError, ErrorCode } from '../lib/errors.js'

const chatsRoute = new Hono()
const MAX_IMPORTED_CHAT_BYTES = 20 * 1024 * 1024

type UploadedFormFile = {
  name?: string
  size?: number
  type?: string
  arrayBuffer: () => Promise<ArrayBuffer>
}

function firstFormValue(body: Record<string, unknown>, key: string): unknown {
  const value = body[key]
  return Array.isArray(value) ? value[0] : value
}

function stringFormValue(body: Record<string, unknown>, key: string): string | undefined {
  const value = firstFormValue(body, key)
  return typeof value === 'string' ? value : undefined
}

function uploadedFileField(body: Record<string, unknown>, key: string): UploadedFormFile | undefined {
  const value = firstFormValue(body, key)
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as UploadedFormFile).arrayBuffer === 'function'
    ? value as UploadedFormFile
    : undefined
}

chatsRoute.post('/import', async (c) => {
  const body = await c.req.parseBody({ all: true })
  const file = uploadedFileField(body, 'avatar') ?? uploadedFileField(body, 'file')
  if (!file) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Chat import file is required')
  }

  const characterName = stringFormValue(body, 'character_name') ?? stringFormValue(body, 'ch_name')
  if (!characterName) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'character_name is required')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length > MAX_IMPORTED_CHAT_BYTES) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Imported chat file is too large', {
      maxBytes: MAX_IMPORTED_CHAT_BYTES,
      size: buffer.length,
    })
  }

  const chat = await chatService.importChatJsonl(characterName, buffer.toString('utf8'), {
    fileName: file.name,
    userName: stringFormValue(body, 'user_name'),
  })
  return c.json({ ...chat, file_name: `${chat.chatId}.jsonl`, success: true }, 201)
})

const stChatGetSchema = z.object({
  ch_name: z.string().min(1),
  file_name: z.string().min(1),
})

chatsRoute.post('/group/get', (c) => c.json({
  success: false,
  blocked: true,
  error: 'SillyTavern group chat reads are blocked in the CraftTalker compatibility runtime until group data is imported and modeled explicitly.',
}, 501))

chatsRoute.post('/get', zValidator('json', stChatGetSchema), async (c) => {
  const { ch_name, file_name } = c.req.valid('json')
  const chatId = file_name.replace(/\.jsonl$/i, '')
  const chat = await chatService.getChat(ch_name, chatId)
  return c.json(chat.lines)
})

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

const metadataSchema = z.object({
  chat_metadata: z.record(z.unknown()),
})

const messageVariablesSchema = z.object({
  updates: z.array(z.object({
    lineIndex: z.number().int().min(0),
    variables: z.unknown().optional(),
    variables_initialized: z.unknown().optional(),
  })).max(1000),
})

chatsRoute.patch('/:characterName/:chatId/metadata', zValidator('json', metadataSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { chat_metadata } = c.req.valid('json')
  const updated = await chatService.updateChatMetadata(characterName, chatId, chat_metadata)
  if (!updated) return c.json({ error: 'Chat metadata not found' }, 404)
  const chat = await chatService.getChat(characterName, chatId)
  const metadata = (chat.lines[0] as { chat_metadata?: unknown } | undefined)?.chat_metadata
  return c.json({ chat_metadata: metadata && typeof metadata === 'object' ? metadata : chat_metadata })
})

chatsRoute.patch('/:characterName/:chatId/message-variables', zValidator('json', messageVariablesSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { updates } = c.req.valid('json')
  const updated = await chatService.updateMessageVariables(characterName, chatId, updates)
  return c.json({ updated })
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
  return generateChatResponse(c, characterName, chatId, config, presetType, presetName, false, genOverrides, false, 'generate')
})

chatsRoute.post('/:characterName/:chatId/stream', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides } = c.req.valid('json')
  return generateChatResponse(c, characterName, chatId, config, presetType, presetName, true, genOverrides, false, 'generate')
})

function generateChatResponse(
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
  return handleGenerate({
    c,
    characterName,
    chatId,
    config,
    presetType,
    presetName,
    stream,
    genOverrides,
    isContinue,
    operation,
    beforeGenerate,
    loadWorldEntries: loadWorldEntriesForGeneration,
  })
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
  return generateChatResponse(
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
  return generateChatResponse(c, characterName, chatId, config, presetType, presetName, true, genOverrides, true, 'continue')
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

export { chatsRoute }
