import { bodyLimit } from 'hono/body-limit'
import type { MiddlewareHandler } from 'hono'

const DEFAULT_JSON_BYTES = 4 * 1024 * 1024
const AUTH_BYTES = 16 * 1024
const CHAT_IMPORT_BYTES = 25 * 1024 * 1024
const CHARACTER_IMPORT_BYTES = 25 * 1024 * 1024
const FILE_UPLOAD_BYTES = 36 * 1024 * 1024

function maxBodyBytes(path: string): number {
  if (path === '/api/auth/session') return AUTH_BYTES
  if (path === '/api/chats/import') return CHAT_IMPORT_BYTES
  if (path === '/api/characters/import') return CHARACTER_IMPORT_BYTES
  if (path === '/api/files/upload') return FILE_UPLOAD_BYTES
  return DEFAULT_JSON_BYTES
}

export const requestBodyLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const limit = bodyLimit({
    maxSize: maxBodyBytes(c.req.path),
    onError: (context) => context.json({
      error: 'Request body is too large',
      maxBytes: maxBodyBytes(context.req.path),
    }, 413),
  })
  return limit(c, next)
}
