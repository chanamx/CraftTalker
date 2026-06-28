import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  deleteUserAvatar,
  listUserAvatars,
  readUserAvatar,
  saveUploadedUserAvatar,
  type UploadedAvatarFile,
} from '../services/user-avatar.service.js'
import { createError, ErrorCode } from '../lib/errors.js'

const avatarsRoute = new Hono()
const userAvatarsRoute = new Hono()

const deleteSchema = z.object({
  avatar: z.string().min(1).max(255),
})

type ParsedFormBody = Record<string, unknown>

function firstFormValue(body: ParsedFormBody, key: string): unknown {
  const value = body[key]
  return Array.isArray(value) ? value[0] : value
}

function stringFormValue(body: ParsedFormBody, key: string): string | undefined {
  const value = firstFormValue(body, key)
  return typeof value === 'string' ? value : undefined
}

function isUploadedAvatarFile(value: unknown): value is UploadedAvatarFile {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as UploadedAvatarFile).arrayBuffer === 'function'
}

async function handleAvatarList(c: Context) {
  return c.json(await listUserAvatars())
}

avatarsRoute.get('/get', handleAvatarList)
avatarsRoute.post('/get', handleAvatarList)

avatarsRoute.post('/upload', async (c) => {
  const body = await c.req.parseBody({ all: true })
  const avatar = firstFormValue(body, 'avatar')
  if (!isUploadedAvatarFile(avatar)) {
    throw createError(ErrorCode.VALIDATION_ERROR, 'Avatar file is required')
  }

  const overwriteName = stringFormValue(body, 'overwrite_name')
  return c.json(await saveUploadedUserAvatar(avatar, overwriteName))
})

avatarsRoute.post('/delete', zValidator('json', deleteSchema), async (c) => {
  const { avatar } = c.req.valid('json')
  return c.json(await deleteUserAvatar(avatar))
})

userAvatarsRoute.get('/:filename', async (c) => {
  const file = await readUserAvatar(c.req.param('filename'))
  c.header('Content-Type', file.contentType)
  c.header('Cache-Control', 'no-cache')
  return c.body(file.body)
})

export { avatarsRoute, userAvatarsRoute }
