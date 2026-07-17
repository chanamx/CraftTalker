import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  readChatFile,
  readChatFileWindow,
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
import {
  withChatMutationLock,
  withChatMutationLocks,
  type ChatMutationLockOptions,
} from '../lib/chat-mutation-locks.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data')
const MAX_IMPORTED_CHAT_LINES = 20000

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

export interface GeneratedMessageCommitResult {
  lineIndex?: number
  line?: ChatLine
  alreadyCommitted: boolean
}

export interface FinalizeGeneratedMessageInput {
  characterName: string
  chatId: string
  runId: string
  operation: 'generate' | 'regenerate' | 'continue'
  generatedContent: string
  finalizedContent: string
  committedLineIndex?: number
}

export interface FinalizedMessageCommitResult {
  lineIndex: number
  line: ChatMessage
  alreadyFinalized: boolean
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
  return withChatMutationLock(characterName, chatId, async () => {
    const metadata = createChatMetadata(characterName, userName)
    const filePath = getChatPath(characterName, chatId)
    await writeChatFile(filePath, [metadata])
    return { chatId, characterName, lines: [metadata] }
  })
}

export async function getChatWindow(characterName: string, chatId: string, options: { offset?: number; limit?: number; tail?: number } = {}): Promise<ChatDetail & { offset: number; totalLines: number }> {
  const filePath = getChatPath(characterName, chatId)
  if (!existsSync(filePath)) throw createError(ErrorCode.CHAT_NOT_FOUND, 'Chat not found', { characterName, chatId })
  const window = await readChatFileWindow(filePath, options)
  if (window.totalLines === 0) throw createError(ErrorCode.CHAT_NOT_FOUND, 'Chat is empty', { characterName, chatId })
  return { chatId, characterName, lines: window.lines, offset: window.offset, totalLines: window.totalLines }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseImportedChatJsonl(content: string): ChatLine[] {
  const rawLines = content.split(/\r?\n/).filter(line => line.trim())
  if (rawLines.length === 0) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Imported chat is empty')
  }
  if (rawLines.length > MAX_IMPORTED_CHAT_LINES) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Imported chat has too many lines', {
      maxLines: MAX_IMPORTED_CHAT_LINES,
      lines: rawLines.length,
    })
  }

  return rawLines.map((line, index) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw createError(ErrorCode.VALIDATION_ERROR, 'Imported chat contains invalid JSONL', { line: index + 1 })
    }
    if (!isObjectRecord(parsed)) {
      throw createError(ErrorCode.VALIDATION_ERROR, 'Imported chat line must be an object', { line: index + 1 })
    }
    return parsed as unknown as ChatLine
  })
}

function normalizeImportChatId(fileName: string | undefined): string {
  const rawName = String(fileName || `imported-${Date.now()}.jsonl`).trim()
  if (!rawName || rawName === '.' || rawName === '..' || rawName.includes('..') || rawName !== path.basename(rawName)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Invalid imported chat file name')
  }

  const ext = path.extname(rawName).toLowerCase()
  if (ext && ext !== '.jsonl') {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Imported chat must be a JSONL file')
  }
  return (ext ? rawName.slice(0, -ext.length) : rawName).trim() || `imported-${Date.now()}`
}

async function getAvailableChatId(characterName: string, preferredChatId: string): Promise<string> {
  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? preferredChatId : `${preferredChatId}-${index}`
    if (!existsSync(getChatPath(characterName, candidate))) {
      return candidate
    }
  }
  throw createError(ErrorCode.VALIDATION_ERROR, 'Could not allocate a chat import file name')
}

export async function importChatJsonl(characterName: string, content: string, options: { fileName?: string; userName?: string } = {}): Promise<ChatDetail> {
  const lines = parseImportedChatJsonl(content)
  const firstLine = lines[0]
  if (!('chat_metadata' in firstLine)) lines.unshift(createChatMetadata(characterName, options.userName))
  else {
    if (!firstLine.character_name) firstLine.character_name = characterName
    if (!firstLine.user_name && options.userName) firstLine.user_name = options.userName
  }
  const preferredChatId = normalizeImportChatId(options.fileName)
  return withChatMutationLock(characterName, preferredChatId, async () => {
    const chatId = await getAvailableChatId(characterName, preferredChatId)
    await writeChatFile(getChatPath(characterName, chatId), lines)
    return { chatId, characterName, lines }
  })
}

export async function addMessage(characterName: string, chatId: string, isUser: boolean, content: string, name?: string, isSystem?: boolean, extra?: Record<string, unknown>): Promise<ChatMessage> {
  return withChatMutationLock(characterName, chatId, async () => {
    const filePath = getChatPath(characterName, chatId)
    const existing = await readChatFile(filePath)
    if (existing.length === 0 || !('chat_metadata' in existing[0])) {
      throw createError(ErrorCode.CHAT_NOT_FOUND, 'Chat metadata is missing', { characterName, chatId })
    }
    const senderName = name ?? (isUser ? 'user' : characterName)
    const message = createMessage(senderName, isUser, content, isSystem, extra)
    await appendMessage(filePath, message)
    return message
  })
}

export async function commitGeneratedMessage(
  characterName: string,
  chatId: string,
  runId: string,
  content: string,
  isContinue: boolean,
): Promise<GeneratedMessageCommitResult> {
  if (!runId.trim()) throw createError(ErrorCode.VALIDATION_ERROR, 'Generation run id is required')
  if (!content) return { alreadyCommitted: false }

  return withChatMutationLock(characterName, chatId, async () => {
    const filePath = getChatPath(characterName, chatId)
    const lines = await readChatFile(filePath)
    if (lines.length === 0 || !('chat_metadata' in lines[0])) {
      throw createError(ErrorCode.CHAT_NOT_FOUND, 'Chat metadata is missing', { characterName, chatId })
    }

    const markedIndex = findGenerationRunMarker(lines, runId)

    if (markedIndex !== undefined) {
      return { lineIndex: markedIndex, line: lines[markedIndex], alreadyCommitted: true }
    }

    if (isContinue) {
      const lineIndex = lines.length - 1
      const line = lines[lineIndex]
      if (lineIndex <= 0 || !isAssistantLine(line)) return { alreadyCommitted: false }
      line.mes = `${line.mes}${content}`
      line.send_date = createStTimestamp()
      line.extra = withGenerationRunMarker(line.extra, runId)
      await writeChatFile(filePath, lines)
      return { lineIndex, line, alreadyCommitted: false }
    }

    const message = createMessage(
      characterName,
      false,
      content,
      false,
      withGenerationRunMarker({}, runId),
    )
    lines.push(message)
    await writeChatFile(filePath, lines)
    return { lineIndex: lines.length - 1, line: message, alreadyCommitted: false }
  })
}

export async function finalizeGeneratedMessage(input: FinalizeGeneratedMessageInput): Promise<FinalizedMessageCommitResult> {
  if (!input.runId.trim()) throw createError(ErrorCode.VALIDATION_ERROR, 'Generation run id is required')

  return withChatMutationLock(input.characterName, input.chatId, async () => {
    const filePath = getChatPath(input.characterName, input.chatId)
    const lines = await readChatFile(filePath)
    if (lines.length === 0 || !('chat_metadata' in lines[0])) {
      throw createError(ErrorCode.CHAT_NOT_FOUND, 'Chat metadata is missing', {
        characterName: input.characterName,
        chatId: input.chatId,
      })
    }

    const markedIndex = findGenerationRunMarker(lines, input.runId)
    if (markedIndex !== undefined) {
      const markedLine = lines[markedIndex]
      if (!isAssistantLine(markedLine)) throw new Error('Generation marker validation invariant failed')
      if (hasFinalizedGenerationRunMarker(markedLine, input.runId)) {
        assertFinalizedContent(markedLine.mes, input)
        return { lineIndex: markedIndex, line: markedLine, alreadyFinalized: true }
      }
      assertGeneratedContent(markedLine.mes, input)
      finalizeAssistantLine(markedLine, input)
      await writeChatFile(filePath, lines)
      return { lineIndex: markedIndex, line: markedLine, alreadyFinalized: false }
    }

    if (input.committedLineIndex !== undefined) {
      const line = lines[input.committedLineIndex]
      if (!isAssistantLine(line)) {
        throw createError(ErrorCode.CONFLICT, 'Run target is no longer an assistant message')
      }
      assertGeneratedContent(line.mes, input)
      finalizeAssistantLine(line, input)
      await writeChatFile(filePath, lines)
      return { lineIndex: input.committedLineIndex, line, alreadyFinalized: false }
    }

    if (input.operation === 'continue') {
      const lineIndex = lines.length - 1
      const line = lines[lineIndex]
      if (lineIndex <= 0 || !isAssistantLine(line)) {
        throw createError(ErrorCode.CONFLICT, 'Continue run has no assistant message to finalize')
      }
      line.mes = `${line.mes}${input.finalizedContent}`
      line.send_date = createStTimestamp()
      line.extra = withFinalizedGenerationRunMarker(line.extra, input.runId)
      await writeChatFile(filePath, lines)
      return { lineIndex, line, alreadyFinalized: false }
    }

    const message = createMessage(
      input.characterName,
      false,
      input.finalizedContent,
      false,
      withFinalizedGenerationRunMarker({}, input.runId),
    )
    lines.push(message)
    await writeChatFile(filePath, lines)
    return { lineIndex: lines.length - 1, line: message, alreadyFinalized: false }
  })
}

function isAssistantLine(line: ChatLine): line is ChatMessage {
  return 'mes' in line && line.is_user !== true && line.is_system !== true && typeof line.mes === 'string'
}

function hasGenerationRunMarker(line: ChatLine, runId: string): boolean {
  const extra = (line as { extra?: unknown }).extra
  if (!isObjectRecord(extra) || !isObjectRecord(extra.crafttalker)) return false
  return Array.isArray(extra.crafttalker.run_ids) && extra.crafttalker.run_ids.includes(runId)
}

function hasFinalizedGenerationRunMarker(line: ChatLine, runId: string): boolean {
  const extra = (line as { extra?: unknown }).extra
  if (!isObjectRecord(extra) || !isObjectRecord(extra.crafttalker)) return false
  return Array.isArray(extra.crafttalker.st_finalized_run_ids)
    && extra.crafttalker.st_finalized_run_ids.includes(runId)
}

function findGenerationRunMarker(lines: ChatLine[], runId: string): number | undefined {
  let markedIndex: number | undefined
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!hasGenerationRunMarker(line, runId) && !hasFinalizedGenerationRunMarker(line, runId)) continue
    if (!isAssistantLine(line)) {
      throw createError(ErrorCode.CONFLICT, 'Generation run marker is attached to a non-assistant line', { runId })
    }
    if (!hasGenerationRunMarker(line, runId)) {
      throw createError(ErrorCode.CONFLICT, 'ST finalization marker is missing its generation run marker', { runId })
    }
    if (markedIndex !== undefined) {
      throw createError(ErrorCode.CONFLICT, 'Generation run marker is duplicated in chat', { runId })
    }
    markedIndex = index
  }
  return markedIndex
}

function withGenerationRunMarker(value: unknown, runId: string): Record<string, unknown> {
  const extra = isObjectRecord(value) ? { ...value } : {}
  const crafttalker = isObjectRecord(extra.crafttalker) ? { ...extra.crafttalker } : {}
  const runIds = Array.isArray(crafttalker.run_ids)
    ? crafttalker.run_ids.filter((item): item is string => typeof item === 'string')
    : []
  if (!runIds.includes(runId)) runIds.push(runId)
  crafttalker.run_ids = runIds
  extra.crafttalker = crafttalker
  return extra
}

function withFinalizedGenerationRunMarker(value: unknown, runId: string): Record<string, unknown> {
  const extra = withGenerationRunMarker(value, runId)
  const crafttalker = extra.crafttalker as Record<string, unknown>
  const finalizedRunIds = Array.isArray(crafttalker.st_finalized_run_ids)
    ? crafttalker.st_finalized_run_ids.filter((item): item is string => typeof item === 'string')
    : []
  if (!finalizedRunIds.includes(runId)) finalizedRunIds.push(runId)
  crafttalker.st_finalized_run_ids = finalizedRunIds
  return extra
}

function assertGeneratedContent(content: string, input: FinalizeGeneratedMessageInput): void {
  if (input.operation === 'continue') {
    if (!content.endsWith(input.generatedContent)) {
      throw createError(ErrorCode.CONFLICT, 'Run target changed after generation completed')
    }
    return
  }
  if (content !== input.generatedContent) {
    throw createError(ErrorCode.CONFLICT, 'Run target changed after generation completed')
  }
}

function assertFinalizedContent(content: string, input: FinalizeGeneratedMessageInput): void {
  const matches = input.operation === 'continue'
    ? content.endsWith(input.finalizedContent)
    : content === input.finalizedContent
  if (!matches) throw createError(ErrorCode.CONFLICT, 'Run target changed after ST finalization')
}

function finalizeAssistantLine(line: ChatMessage, input: FinalizeGeneratedMessageInput): void {
  if (input.operation === 'continue') {
    line.mes = line.mes.slice(0, line.mes.length - input.generatedContent.length) + input.finalizedContent
  } else {
    line.mes = input.finalizedContent
  }
  line.send_date = createStTimestamp()
  line.extra = withFinalizedGenerationRunMarker(line.extra, input.runId)
}

export async function deleteChat(characterName: string, chatId: string): Promise<boolean> {
  return withChatMutationLock(characterName, chatId, async () => {
    const filePath = getChatPath(characterName, chatId)
    if (!existsSync(filePath)) throw createError(ErrorCode.CHAT_NOT_FOUND, 'Chat not found', { characterName, chatId })
    await fs.unlink(filePath)
    return true
  })
}

export async function renameChat(characterName: string, chatId: string, newChatId: string): Promise<boolean> {
  if (chatId === newChatId) return true
  return withChatMutationLocks([
    { characterName, chatId },
    { characterName, chatId: newChatId },
  ], async () => {
    const oldPath = getChatPath(characterName, chatId)
    const newPath = getChatPath(characterName, newChatId)
    if (!existsSync(oldPath)) throw createError(ErrorCode.CHAT_NOT_FOUND, 'Chat not found', { characterName, chatId })
    if (existsSync(newPath)) throw createError(ErrorCode.CONFLICT, 'Chat target already exists', { characterName, chatId, newChatId })
    await fs.rename(oldPath, newPath)
    return true
  })
}

export async function deleteMessage(characterName: string, chatId: string, lineIndex: number): Promise<boolean> {
  return withChatMutationLock(characterName, chatId, () => deleteLineAt(getChatPath(characterName, chatId), lineIndex))
}

export async function editMessage(characterName: string, chatId: string, lineIndex: number, content: string): Promise<ChatLine | null> {
  return withChatMutationLock(characterName, chatId, () => updateLineAt(getChatPath(characterName, chatId), lineIndex, { mes: content, send_date: createStTimestamp() }))
}

export async function regenerateLast(characterName: string, chatId: string): Promise<boolean> {
  return withChatMutationLock(characterName, chatId, async () => (await deleteLastAssistantLine(getChatPath(characterName, chatId))) !== null)
}

export async function renameChatFile(characterName: string, chatId: string, newName: string): Promise<boolean> {
  return withChatMutationLock(characterName, chatId, async () => {
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
  })
}

export async function withChatTransaction<T>(
  characterName: string,
  chatId: string,
  operation: (chat: ChatDetail) => Promise<T>,
  options: ChatMutationLockOptions = {},
): Promise<T> {
  return withChatMutationLock(
    characterName,
    chatId,
    async () => operation(await getChat(characterName, chatId)),
    options,
  )
}

export async function updateChatMetadata(characterName: string, chatId: string, chatMetadata: Record<string, unknown>): Promise<boolean> {
  return withChatMutationLock(characterName, chatId, () => updateChatMetadataLine(getChatPath(characterName, chatId), { chat_metadata: chatMetadata }))
}

export interface MessageVariableUpdate {
  lineIndex: number
  variables?: unknown
  variables_initialized?: unknown
}

export async function updateMessageVariables(characterName: string, chatId: string, updates: MessageVariableUpdate[]): Promise<number> {
  return withChatMutationLock(characterName, chatId, async () => {
    const filePath = getChatPath(characterName, chatId)
    const lines = await readChatFile(filePath)
    if (lines.length === 0) return 0
    let updated = 0
    for (const update of updates) {
      const hasVariables = Object.hasOwn(update, 'variables')
      const hasInitialized = Object.hasOwn(update, 'variables_initialized')
      if (!hasVariables && !hasInitialized) continue
      const line = lines[update.lineIndex]
      if (!line || !('mes' in line)) continue
      if (hasVariables) line.variables = update.variables
      if (hasInitialized) line.variables_initialized = update.variables_initialized
      updated += 1
    }
    if (updated > 0) await writeChatFile(filePath, lines)
    return updated
  })
}

export async function addSwipe(characterName: string, chatId: string, lineIndex: number, content: string): Promise<ChatLine | null> {
  return withChatMutationLock(characterName, chatId, async () => {
    const filePath = getChatPath(characterName, chatId)
    const lines = await readChatFile(filePath)
    if (lineIndex <= 0 || lineIndex >= lines.length) return null
    const line = lines[lineIndex] as ChatMessage
    if (!('mes' in line) || line.is_user) return null
    if (!line.swipes) { line.swipes = [line.mes]; line.swipe_info = [{ send_date: line.send_date }]; line.swipe_id = 0 }
    const sendDate = createStTimestamp()
    const swipeInfo = line.swipe_info ?? []
    line.swipe_info = swipeInfo
    line.swipes.push(content); swipeInfo.push({ send_date: sendDate }); line.swipe_id = line.swipes.length - 1
    line.mes = content; line.send_date = sendDate
    await writeChatFile(filePath, lines)
    return line
  })
}

export async function switchSwipe(characterName: string, chatId: string, lineIndex: number, swipeId: number): Promise<ChatLine | null> {
  return withChatMutationLock(characterName, chatId, async () => {
    const filePath = getChatPath(characterName, chatId)
    const lines = await readChatFile(filePath)
    if (lineIndex <= 0 || lineIndex >= lines.length) return null
    const line = lines[lineIndex] as ChatMessage
    if (!('mes' in line) || !line.swipes || swipeId < 0 || swipeId >= line.swipes.length) return null
    line.swipe_id = swipeId; line.mes = line.swipes[swipeId]
    line.send_date = line.swipe_info?.[swipeId]?.send_date ?? createStTimestamp()
    await writeChatFile(filePath, lines)
    return line
  })
}
