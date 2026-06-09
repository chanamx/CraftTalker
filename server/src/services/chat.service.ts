import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readChatFile,
  writeChatFile,
  appendMessage,
  getChatInfo,
  listChatFiles,
  createChatMetadata,
  createMessage,
  createStTimestamp,
  deleteLineAt,
  updateLineAt,
  updateChatMetadataLine,
  deleteLastAssistantLine,
  type ChatLine,
  type ChatMessage,
} from '../lib/jsonl.js'
import { createError, ErrorCode } from '../lib/errors.js'
import { safePath } from '../lib/path-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')

function getDataDir() { return process.env.LUKER_DATA_DIR ?? DEFAULT_DATA_DIR }
function getChatsDir() { return path.join(getDataDir(), 'chats') }

function getChatPath(characterName: string, chatId: string): string {
  return safePath(getChatsDir(), characterName, `${chatId}.jsonl`)
}

export interface ChatInfo {
  file_id: string
  file_name: string
  chat_items: number
  mes: string
  last_mes: number
}

export interface ChatDetail {
  chatId: string
  characterName: string
  lines: ChatLine[]
}

export async function listChats(characterName: string): Promise<ChatInfo[]> {
  const charChatDir = safePath(getChatsDir(), characterName)
  const files = await listChatFiles(charChatDir)

  const results = await Promise.all(
    files.map(fileId => {
      const filePath = getChatPath(characterName, fileId)
      return getChatInfo(filePath)
    })
  )

  return results
    .filter((r): r is ChatInfo => r !== null)
    .sort((a, b) => b.last_mes - a.last_mes)
}

export async function getChat(characterName: string, chatId: string): Promise<ChatDetail> {
  const filePath = getChatPath(characterName, chatId)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.CHAT_NOT_FOUND, `聊天 "${characterName}/${chatId}" 不存在`, { characterName, chatId })
  }

  const lines = await readChatFile(filePath)
  if (lines.length === 0) {
    throw createError(ErrorCode.CHAT_NOT_FOUND, `聊天 "${characterName}/${chatId}" 为空`, { characterName, chatId })
  }

  return { chatId, characterName, lines }
}

export async function createChat(characterName: string, userName?: string): Promise<ChatDetail> {
  const chatId = crypto.randomUUID()
  const metadata = createChatMetadata(characterName, userName)
  const filePath = getChatPath(characterName, chatId)
  await writeChatFile(filePath, [metadata])

  return { chatId, characterName, lines: [metadata] }
}

export async function addMessage(
  characterName: string,
  chatId: string,
  isUser: boolean,
  content: string,
  name?: string,
  isSystem?: boolean,
  extra?: Record<string, unknown>,
): Promise<ChatMessage> {
  const filePath = getChatPath(characterName, chatId)
  const senderName = name ?? (isUser ? '用户' : characterName)
  const message = createMessage(senderName, isUser, content, isSystem, extra)
  await appendMessage(filePath, message)
  return message
}

export async function deleteChat(characterName: string, chatId: string): Promise<boolean> {
  const filePath = getChatPath(characterName, chatId)
  if (!existsSync(filePath)) {
    throw createError(ErrorCode.CHAT_NOT_FOUND, `聊天 "${characterName}/${chatId}" 不存在`, { characterName, chatId })
  }
  await fs.unlink(filePath)
  return true
}

export async function renameChat(characterName: string, chatId: string, newChatId: string): Promise<boolean> {
  const oldPath = getChatPath(characterName, chatId)
  if (!existsSync(oldPath)) {
    throw createError(ErrorCode.CHAT_NOT_FOUND, `聊天 "${characterName}/${chatId}" 不存在`, { characterName, chatId })
  }
  const newPath = getChatPath(characterName, newChatId)
  await fs.rename(oldPath, newPath)
  return true
}

export async function deleteMessage(characterName: string, chatId: string, lineIndex: number): Promise<boolean> {
  const filePath = getChatPath(characterName, chatId)
  return deleteLineAt(filePath, lineIndex)
}

export async function editMessage(characterName: string, chatId: string, lineIndex: number, content: string): Promise<ChatLine | null> {
  const filePath = getChatPath(characterName, chatId)
  return updateLineAt(filePath, lineIndex, { mes: content, send_date: createStTimestamp() })
}

export async function regenerateLast(characterName: string, chatId: string): Promise<boolean> {
  const filePath = getChatPath(characterName, chatId)
  return (await deleteLastAssistantLine(filePath)) !== null
}

export async function renameChatFile(characterName: string, chatId: string, newName: string): Promise<boolean> {
  const filePath = getChatPath(characterName, chatId)
  const lines = await readChatFile(filePath)
  if (lines.length === 0 || !('chat_metadata' in lines[0])) return false
  const meta = lines[0] as unknown as Record<string, unknown>
  const chatMeta = (meta.chat_metadata ?? {}) as Record<string, unknown>
  chatMeta.chat_name = newName
  chatMeta.modified = new Date().toISOString()
  meta.chat_metadata = chatMeta
  lines[0] = meta as unknown as ChatLine
  await writeChatFile(filePath, lines)
  return true
}

export async function updateChatMetadata(
  characterName: string,
  chatId: string,
  chatMetadata: Record<string, unknown>,
): Promise<boolean> {
  const filePath = getChatPath(characterName, chatId)
  return updateChatMetadataLine(filePath, { chat_metadata: chatMetadata })
}

export async function addSwipe(characterName: string, chatId: string, lineIndex: number, content: string): Promise<ChatLine | null> {
  const filePath = getChatPath(characterName, chatId)
  const lines = await readChatFile(filePath)
  if (lineIndex <= 0 || lineIndex >= lines.length) return null
  const line = lines[lineIndex] as ChatMessage
  if (!('mes' in line) || line.is_user) return null

  if (!line.swipes) {
    line.swipes = [line.mes]
    line.swipe_info = [{ send_date: line.send_date }]
    line.swipe_id = 0
  }

  const sendDate = createStTimestamp()
  const swipeInfo = line.swipe_info ?? []
  line.swipe_info = swipeInfo
  line.swipes.push(content)
  swipeInfo.push({ send_date: sendDate })
  line.swipe_id = line.swipes.length - 1
  line.mes = content
  line.send_date = sendDate

  await writeChatFile(filePath, lines)
  return line
}

export async function switchSwipe(characterName: string, chatId: string, lineIndex: number, swipeId: number): Promise<ChatLine | null> {
  const filePath = getChatPath(characterName, chatId)
  const lines = await readChatFile(filePath)
  if (lineIndex <= 0 || lineIndex >= lines.length) return null
  const line = lines[lineIndex] as ChatMessage
  if (!('mes' in line) || !line.swipes || swipeId < 0 || swipeId >= line.swipes.length) return null

  line.swipe_id = swipeId
  line.mes = line.swipes[swipeId]
  line.send_date = line.swipe_info?.[swipeId]?.send_date ?? createStTimestamp()

  await writeChatFile(filePath, lines)
  return line
}
