import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppError, ErrorCode, getStatusCode } from '../lib/errors.js'

export function appErrorHandler(err: Error, c: Context) {
  console.error('[Error]', err)

  if (err instanceof AppError) {
    const statusCode = getStatusCode(err.code) as ContentfulStatusCode
    return c.json({
      error: err.message,
      code: err.code,
      details: err.details,
    }, statusCode)
  }

  return c.json({
    error: '服务器内部错误',
    code: ErrorCode.UNKNOWN_ERROR,
    details: process.env.NODE_ENV === 'development' ? { message: String(err) } : undefined,
  }, 500 as ContentfulStatusCode)
}
