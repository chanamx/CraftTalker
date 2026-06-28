import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { AppError, ErrorCode, getStatusCode } from '../lib/errors.js'

export function appErrorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    const statusCode = getStatusCode(err.code) as ContentfulStatusCode
    if (statusCode >= 500) {
      console.error('[Error]', err)
    }
    return c.json({
      error: err.message,
      code: err.code,
      details: err.details,
    }, statusCode)
  }

  console.error('[Error]', err)

  return c.json({
    error: '服务器内部错误',
    code: ErrorCode.UNKNOWN_ERROR,
    details: process.env.NODE_ENV === 'development' ? { message: String(err) } : undefined,
  }, 500 as ContentfulStatusCode)
}
