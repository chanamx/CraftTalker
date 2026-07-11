import { Hono, type Context } from 'hono'
import { createError, ErrorCode } from '../lib/errors.js'
import { getWorld, getStWorldInfoSettings, replaceExistingWorldInfo } from '../services/world.service.js'
import { getWorldInfoPromptForContext } from '../services/world-info-runtime.service.js'

const stWorldInfoRoute = new Hono()
const stWorldInfoWriteRoute = new Hono()

stWorldInfoRoute.post('/settings/get', async (c) => {
  const settings = await getStWorldInfoSettings()
  return c.json(settings)
})

stWorldInfoRoute.post('/worldinfo/get', async (c) => {
  const payload = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const name = stringValue(payload.name)
  if (!name) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'World info name is required')
  }
  const world = await getWorld(name)
  return c.json(world)
})

stWorldInfoRoute.post('/worldinfo/check', async (c) => {
  const payload = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const result = await getWorldInfoPromptForContext({
    chat: normalizeWorldInfoPromptChat(payload.chat),
    maxContext: finiteNumber(payload.maxContext ?? payload.max_context),
    dryRun: payload.isDryRun === true || payload.dryRun === true,
    globalScanData: recordValue(payload.globalScanData ?? payload.global_scan_data),
    characterName: stringValue(payload.characterName ?? payload.character_name),
    characterTags: stringArrayValue(payload.characterTags ?? payload.character_tags ?? payload.characterTagIds ?? payload.character_tag_ids),
    characterTagNames: stringArrayValue(payload.characterTagNames ?? payload.character_tag_names),
    chatId: stringValue(payload.chatId ?? payload.chat_id),
    model: stringValue(payload.model),
    userName: stringValue(payload.userName ?? payload.user_name),
  })
  return c.json(result)
})

stWorldInfoWriteRoute.post('/worldinfo/edit', async (c) => saveWorldInfo(c))
stWorldInfoWriteRoute.post('/worldinfo/save', async (c) => saveWorldInfo(c))

async function saveWorldInfo(c: Context) {
  const payload = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const name = stringValue(payload.name)
  if (!name) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'World info name is required')
  }

  const data = worldInfoDataFromPayload(payload)
  if (!data || !isWorldInfoEntries(data.entries)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'World info data with entries is required')
  }

  const dataName = stringValue(data.name)
  if (dataName && dataName !== name) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'World info payload name must match the requested name', {
      name,
      dataName,
    })
  }

  const world = await replaceExistingWorldInfo(name, data)
  return c.json(world)
}

function normalizeWorldInfoPromptChat(value: unknown): Array<string | { name: string | undefined; content: string }> {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return values
    .map((item) => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
      const record = item as Record<string, unknown>
      return {
        name: stringValue(record.name),
        content: typeof record.content === 'string'
          ? record.content
          : typeof record.mes === 'string'
            ? record.mes
            : '',
      }
    })
    .filter((item) =>
      typeof item === 'string' ? item.trim().length > 0 : item.content.trim().length > 0,
    )
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map(item => String(item ?? '').trim()).filter(Boolean)
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function worldInfoDataFromPayload(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  return recordValue(payload.data)
    ?? recordValue(payload.world)
    ?? recordValue(payload.worldInfo)
    ?? recordValue(payload.world_info)
    ?? (Object.hasOwn(payload, 'entries') ? payload : undefined)
}

function isWorldInfoEntries(value: unknown): boolean {
  return Array.isArray(value) || recordValue(value) !== undefined
}

export { stWorldInfoRoute, stWorldInfoWriteRoute }
