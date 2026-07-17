import fs from 'node:fs/promises'
import { existsSync, createReadStream } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { once } from 'node:events'

export interface ChatMessage {
  name: string
  is_user: boolean
  is_system: boolean
  send_date: string | number
  mes: string
  extra: Record<string, unknown>
  swipe_id?: number
  swipes?: string[]
  swipe_info?: Array<{ send_date: string | number; gen_started?: number; gen_finished?: number; [key: string]: unknown }>
  [key: string]: unknown
}

export interface ChatMetadata {
  chat_metadata: Record<string, unknown>
  user_name: string
  character_name: string
  [key: string]: unknown
}

export type ChatLine = ChatMetadata | ChatMessage

function isChatMessage(line: ChatLine): line is ChatMessage {
  return 'mes' in line
}

export async function readChatFile(filePath: string): Promise<ChatLine[]> {
  if (!existsSync(filePath)) return []

  const content = await fs.readFile(filePath, 'utf8')
  if (!content.trim()) return []

  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try { return JSON.parse(line) }
      catch (err) { console.error('Failed to parse chat line:', err); return null }
    })
    .filter(Boolean) as ChatLine[]
}

export interface ChatWindowOptions {
  offset?: number
  limit?: number
  tail?: number
}

export interface ChatWindowResult {
  lines: ChatLine[]
  offset: number
  totalLines: number
}

export async function readChatFileWindow(filePath: string, options: ChatWindowOptions = {}): Promise<ChatWindowResult> {
  if (!existsSync(filePath)) return { lines: [], offset: 0, totalLines: 0 }
  const offset = Math.max(0, Math.floor(options.offset ?? 0))
  const limit = Math.max(1, Math.min(10_000, Math.floor(options.limit ?? 200)))
  const tail = options.tail === undefined ? undefined : Math.max(1, Math.min(10_000, Math.floor(options.tail)))
  const selected: ChatLine[] = []
  let totalLines = 0
  const fileStream = createReadStream(filePath)
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })
  try {
    for await (const rawLine of rl) {
      if (!rawLine.trim()) continue
      let parsed: unknown
      try { parsed = JSON.parse(rawLine) } catch { continue }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const line = parsed as ChatLine
      totalLines += 1
      if (tail !== undefined) {
        selected.push(line)
        if (selected.length > tail) selected.shift()
      } else if (totalLines > offset && selected.length < limit) {
        selected.push(line)
      }
    }
  } finally {
    rl.close()
    if (!fileStream.closed) {
      const closed = once(fileStream, 'close')
      fileStream.destroy()
      await closed
    }
  }
  return { lines: selected, offset: tail === undefined ? Math.min(offset, Math.max(0, totalLines - selected.length)) : Math.max(0, totalLines - selected.length), totalLines }
}

async function replaceTempFile(tempPath: string, filePath: string): Promise<void> {
  try {
    await fs.rename(tempPath, filePath)
  } catch (error) {
    if (process.platform !== 'win32' || !existsSync(filePath)) throw error
    const backupPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.bak`
    await fs.rename(filePath, backupPath)
    try {
      await fs.rename(tempPath, filePath)
      await fs.rm(backupPath, { force: true })
    } catch (replaceError) {
      try { await fs.rename(backupPath, filePath) } catch { /* preserve original error */ }
      throw replaceError
    }
  }
}

async function createUniqueTempPath(filePath: string, suffix: string): Promise<string> {
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.${suffix}.tmp`)
  const handle = await fs.open(tempPath, 'wx')
  await handle.close()
  return tempPath
}

export async function writeChatFile(filePath: string, lines: ChatLine[]): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const content = lines.map(l => JSON.stringify(l)).join('\n') + '\n'
  const tempPath = await createUniqueTempPath(filePath, 'write')
  try {
    const handle = await fs.open(tempPath, 'r+')
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await replaceTempFile(tempPath, filePath)
  } finally {
    await fs.rm(tempPath, { force: true })
  }
}

export async function appendMessage(filePath: string, message: ChatMessage): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = await createUniqueTempPath(filePath, 'append')
  try {
    if (existsSync(filePath)) await fs.copyFile(filePath, tempPath)
    const handle = await fs.open(tempPath, 'a')
    try {
      await handle.writeFile(JSON.stringify(message) + '\n', 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await replaceTempFile(tempPath, filePath)
  } finally {
    await fs.rm(tempPath, { force: true })
  }
}
export async function getChatInfo(filePath: string): Promise<{
  file_id: string
  file_name: string
  chat_items: number
  mes: string
  last_mes: number
} | null> {
  if (!existsSync(filePath)) return null

  const stats = await fs.stat(filePath)
  const parsed = path.parse(filePath)

  if (stats.size === 0) {
    return {
      file_id: parsed.name,
      file_name: parsed.base,
      chat_items: 0,
      mes: '[空对话]',
      last_mes: stats.mtimeMs,
    }
  }

  return new Promise((resolve) => {
    const fileStream = createReadStream(filePath)
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    let firstLine = ''
    let lastLine = ''
    let itemCounter = 0

    rl.on('line', (line) => {
      if (itemCounter === 0) firstLine = line
      itemCounter++
      lastLine = line
    })

    rl.on('close', () => {
      try {
        const jsonData = JSON.parse(lastLine)
        let displayName = parsed.base
        try {
          const meta = JSON.parse(firstLine)
          if (meta.chat_metadata?.chat_name) {
            displayName = meta.chat_metadata.chat_name
          }
        } catch { /* use default */ }
        resolve({
          file_id: parsed.name,
          file_name: displayName,
          chat_items: itemCounter - 1,
          mes: jsonData.mes || '[空消息]',
          last_mes: parseChatTimestamp(jsonData.send_date, stats.mtimeMs),
        })
      } catch (err) {
        console.error('Failed to parse last chat line:', err)
        resolve(null)
      }
    })
  })
}

export async function listChatFiles(chatsDir: string): Promise<string[]> {
  if (!existsSync(chatsDir)) return []
  const entries = await fs.readdir(chatsDir)
  return entries
    .filter(f => f.endsWith('.jsonl'))
    .map(f => f.replace('.jsonl', ''))
}

export function createChatMetadata(characterName: string, userName: string = '用户'): ChatMetadata {
  const now = new Date().toISOString()
  return {
    chat_metadata: {
      integrity: crypto.randomUUID(),
      created_at: now,
      created: now,
      modified: now,
    },
    user_name: userName,
    character_name: characterName,
  }
}

export function createStTimestamp(): string {
  return new Date().toISOString()
}

export function parseChatTimestamp(value: unknown, fallback: number = Date.now()): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export async function updateChatMetadataLine(filePath: string, updates: Partial<ChatMetadata>): Promise<boolean> {
  if (!existsSync(filePath)) return false
  const lines = await readChatFile(filePath)
  if (lines.length === 0 || !('chat_metadata' in lines[0])) return false
  const meta = lines[0]
  Object.assign(meta, updates)
  if (meta.chat_metadata && typeof meta.chat_metadata === 'object') {
    (meta.chat_metadata as Record<string, unknown>).modified = new Date().toISOString()
  }
  lines[0] = meta
  await writeChatFile(filePath, lines)
  return true
}

export async function deleteLineAt(filePath: string, lineIndex: number): Promise<boolean> {
  if (!existsSync(filePath)) return false
  const lines = await readChatFile(filePath)
  if (lineIndex <= 0 || lineIndex >= lines.length) return false
  lines.splice(lineIndex, 1)
  await writeChatFile(filePath, lines)
  return true
}

export async function updateLineAt(filePath: string, lineIndex: number, updates: Record<string, unknown>): Promise<ChatLine | null> {
  if (!existsSync(filePath)) return null
  const lines = await readChatFile(filePath)
  if (lineIndex <= 0 || lineIndex >= lines.length) return null
  const line = lines[lineIndex]
  if (!('mes' in line)) return null
  Object.assign(line, updates)
  await writeChatFile(filePath, lines)
  return line
}

export async function deleteLastAssistantLine(filePath: string): Promise<ChatMessage | null> {
  if (!existsSync(filePath)) return null
  const lines = await readChatFile(filePath)
  for (let i = lines.length - 1; i > 0; i--) {
    const line = lines[i]
    if (isChatMessage(line) && !line.is_user && !line.is_system) {
      lines.splice(i, 1)
      await writeChatFile(filePath, lines)
      return line
    }
  }
  return null
}

export function createMessage(
  name: string,
  isUser: boolean,
  content: string,
  isSystem: boolean = false,
  extra: Record<string, unknown> = {},
): ChatMessage {
  return {
    name,
    is_user: isUser,
    is_system: isSystem,
    send_date: createStTimestamp(),
    mes: content,
    extra,
  }
}
