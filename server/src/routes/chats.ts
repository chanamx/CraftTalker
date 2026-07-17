import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as chatService from '../services/chat.service.js'
import * as presetService from '../services/preset.service.js'
import { llmConfigSchema } from '../lib/llm-config.js'
import { handleGenerate, type StCompatChatOverrideLine, type StCompatExtensionPrompt, type StCompatPromptMessage } from './chat-generation.js'
import type { GenerationOperation } from '../lib/generation-locks.js'
import { loadWorldEntriesForGeneration } from '../services/world-info-runtime.service.js'
import { createError, ErrorCode } from '../lib/errors.js'
import { inspectJsonComplexity } from '../lib/bounded-json.js'

const chatsRoute = new Hono()
const MAX_IMPORTED_CHAT_BYTES = 20 * 1024 * 1024
const MAX_ST_COMPAT_CHAT_OVERRIDE_LINES = 5000
const MAX_ST_COMPAT_CHAT_OVERRIDE_MESSAGE_CHARS = 200000
const MAX_ST_COMPAT_CHAT_OVERRIDE_TOTAL_CHARS = 2000000
const MAX_ST_COMPAT_EXTENSION_PROMPTS = 200
const MAX_ST_COMPAT_EXTENSION_PROMPT_CHARS = 200000
const MAX_ST_COMPAT_EXTENSION_PROMPT_TOTAL_CHARS = 500000
const MAX_ST_COMPAT_PROMPT_MESSAGES = 5000
const MAX_ST_COMPAT_PROMPT_MESSAGE_CHARS = 200000
const MAX_ST_COMPAT_PROMPT_MESSAGE_TOTAL_CHARS = 2000000

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
  const query = c.req.query()
  const tail = query.tail === undefined ? undefined : Number(query.tail)
  const offset = query.offset === undefined ? undefined : Number(query.offset)
  const limit = query.limit === undefined ? undefined : Number(query.limit)
  const hasWindow = tail !== undefined || offset !== undefined || limit !== undefined
  if (hasWindow && [tail, offset, limit].some(value => value !== undefined && (!Number.isInteger(value) || value < 0))) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid chat window parameters')
  }
  const chat = hasWindow
    ? await chatService.getChatWindow(characterName, chatId, { tail, offset, limit })
    : await chatService.getChat(characterName, chatId)
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
  content: z.string().min(1).max(250_000),
  name: z.string().max(200).optional(),
  is_system: z.boolean().optional(),
  extra: z.record(z.unknown()).superRefine((value, ctx) => {
    if (Object.keys(value).length > 128 || JSON.stringify(value).length > 256 * 1024) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Message extra fields are too large' })
    }
    if (!inspectJsonComplexity(value, { maxDepth: 12, maxNodes: 5_000, maxArrayLength: 1_000 }).ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Message extra fields are too complex' })
    }
  }).optional(),
})

const metadataSchema = z.object({
  chat_metadata: z.record(z.unknown()).superRefine((value, ctx) => {
    if (Object.keys(value).length > 256 || JSON.stringify(value).length > 256 * 1024) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Chat metadata is too large' })
    }
    if (!inspectJsonComplexity(value, { maxDepth: 12, maxNodes: 10_000, maxArrayLength: 1_000 }).ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Chat metadata is too complex' })
    }
  }),
})

const messageVariablesSchema = z.object({
  updates: z.array(z.object({
    lineIndex: z.number().int().min(0),
    variables: z.unknown().optional(),
    variables_initialized: z.unknown().optional(),
  })).max(1000).superRefine((updates, ctx) => {
    if (JSON.stringify(updates).length > 512 * 1024) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Message variables are too large' })
    }
    if (!inspectJsonComplexity(updates, { maxDepth: 12, maxNodes: 20_000, maxArrayLength: 2_000 }).ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Message variables are too complex' })
    }
  }),
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
  stCompatChatOverride: z.array(z.object({
    name: z.string().max(200).optional(),
    is_user: z.boolean().optional(),
    is_system: z.boolean().optional(),
    mes: z.string().max(MAX_ST_COMPAT_CHAT_OVERRIDE_MESSAGE_CHARS),
  }).strict())
    .max(MAX_ST_COMPAT_CHAT_OVERRIDE_LINES)
    .superRefine((lines, ctx) => {
      const totalChars = lines.reduce((sum, line) => sum + line.mes.length, 0)
      if (totalChars > MAX_ST_COMPAT_CHAT_OVERRIDE_TOTAL_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ST-compatible chat override exceeds ${MAX_ST_COMPAT_CHAT_OVERRIDE_TOTAL_CHARS} characters`,
        })
      }
    })
    .optional(),
  stCompatExtensionPrompts: z.array(z.object({
    key: z.string().min(1).max(200),
    value: z.string().max(MAX_ST_COMPAT_EXTENSION_PROMPT_CHARS),
    position: z.number().int().min(-1).max(3).optional(),
    depth: z.number().int().min(0).max(1000).optional(),
    scan: z.boolean().optional(),
    role: z.number().int().min(0).max(2).optional(),
  }).strict())
    .max(MAX_ST_COMPAT_EXTENSION_PROMPTS)
    .superRefine((prompts, ctx) => {
      const totalChars = prompts.reduce((sum, prompt) => sum + prompt.value.length, 0)
      if (totalChars > MAX_ST_COMPAT_EXTENSION_PROMPT_TOTAL_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ST-compatible extension prompts exceed ${MAX_ST_COMPAT_EXTENSION_PROMPT_TOTAL_CHARS} characters`,
        })
      }
    })
    .optional(),
  stCompatPromptMessages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().max(MAX_ST_COMPAT_PROMPT_MESSAGE_CHARS),
  }).strict())
    .max(MAX_ST_COMPAT_PROMPT_MESSAGES)
    .superRefine((messages, ctx) => {
      const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0)
      if (totalChars > MAX_ST_COMPAT_PROMPT_MESSAGE_TOTAL_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `ST-compatible prompt messages exceed ${MAX_ST_COMPAT_PROMPT_MESSAGE_TOTAL_CHARS} characters`,
        })
      }
    })
    .optional(),
})

chatsRoute.post('/:characterName/:chatId/generate', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides, stCompatChatOverride, stCompatExtensionPrompts, stCompatPromptMessages } = c.req.valid('json')
  return generateChatResponse({
    c,
    characterName,
    chatId,
    config,
    presetType,
    presetName,
    stream: false,
    genOverrides,
    operation: 'generate',
    stCompatChatOverride,
    stCompatExtensionPrompts,
    stCompatPromptMessages,
  })
})

chatsRoute.post('/:characterName/:chatId/stream', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides, stCompatChatOverride, stCompatExtensionPrompts, stCompatPromptMessages } = c.req.valid('json')
  return generateChatResponse({
    c,
    characterName,
    chatId,
    config,
    presetType,
    presetName,
    genOverrides,
    operation: 'generate',
    stCompatChatOverride,
    stCompatExtensionPrompts,
    stCompatPromptMessages,
  })
})

type GenerateChatResponseInput = {
  c: Context,
  characterName: string
  chatId: string
  config: z.infer<typeof generateSchema>['config']
  presetType?: z.infer<typeof generateSchema>['presetType']
  presetName?: string
  stream?: boolean
  genOverrides?: z.infer<typeof generateSchema>['genOverrides']
  isContinue?: boolean
  operation?: GenerationOperation
  beforeGenerate?: () => Promise<void>
  stCompatChatOverride?: StCompatChatOverrideLine[]
  stCompatExtensionPrompts?: StCompatExtensionPrompt[]
  stCompatPromptMessages?: StCompatPromptMessage[]
}

function generateChatResponse(input: GenerateChatResponseInput) {
  return handleGenerate({
    c: input.c,
    characterName: input.characterName,
    chatId: input.chatId,
    config: input.config,
    presetType: input.presetType,
    presetName: input.presetName,
    stream: input.stream ?? true,
    genOverrides: input.genOverrides,
    isContinue: input.isContinue ?? false,
    operation: input.operation ?? 'generate',
    beforeGenerate: input.beforeGenerate,
    stCompatChatOverride: input.stCompatChatOverride,
    stCompatExtensionPrompts: input.stCompatExtensionPrompts,
    stCompatPromptMessages: input.stCompatPromptMessages,
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
  content: z.string(),
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
  const { config, presetType, presetName, genOverrides, stCompatChatOverride, stCompatExtensionPrompts, stCompatPromptMessages } = c.req.valid('json')
  return generateChatResponse({
    c,
    characterName,
    chatId,
    config,
    presetType,
    presetName,
    stream: true,
    genOverrides,
    isContinue: false,
    operation: 'regenerate',
    beforeGenerate: () => chatService.regenerateLast(characterName, chatId).then(() => undefined),
    stCompatChatOverride,
    stCompatExtensionPrompts,
    stCompatPromptMessages,
  })
})

chatsRoute.post('/:characterName/:chatId/continue', zValidator('json', generateSchema), async (c) => {
  const characterName = decodeURIComponent(c.req.param('characterName'))
  const chatId = c.req.param('chatId')
  const { config, presetType, presetName, genOverrides, stCompatChatOverride, stCompatExtensionPrompts, stCompatPromptMessages } = c.req.valid('json')
  return generateChatResponse({
    c,
    characterName,
    chatId,
    config,
    presetType,
    presetName,
    stream: true,
    genOverrides,
    isContinue: true,
    operation: 'continue',
    stCompatChatOverride,
    stCompatExtensionPrompts,
    stCompatPromptMessages,
  })
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
