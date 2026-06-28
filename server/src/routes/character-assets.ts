import { Hono, type Context } from 'hono'
import fs from 'node:fs/promises'
import * as characterService from '../services/character.service.js'
import { createError, ErrorCode } from '../lib/errors.js'

const characterAssetsRoute = new Hono()

characterAssetsRoute.get('/characters/:filename{[^/]+}', async (c) => {
  return serveLegacyCharacterAvatar(c, c.req.param('filename'))
})

characterAssetsRoute.get('/thumbnail', async (c) => {
  const type = c.req.query('type')
  const file = c.req.query('file')
  if (type !== 'avatar' || !file) {
    throw createError(ErrorCode.NOT_FOUND, 'Thumbnail asset was not found')
  }

  return serveLegacyCharacterAvatar(c, file)
})

async function serveLegacyCharacterAvatar(c: Context, rawFileName: string) {
  const fileName = decodePathValue(rawFileName)
  const avatarPath = characterService.getLegacyCharacterAvatarPath(fileName)
  if (!avatarPath) {
    throw createError(ErrorCode.NOT_FOUND, 'Character avatar was not found')
  }

  const body = await fs.readFile(avatarPath)
  return c.body(body, 200, {
    'Content-Type': characterService.getCharacterAvatarContentType(body),
    'Cache-Control': 'public, max-age=3600',
  })
}

function decodePathValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export { characterAssetsRoute }
