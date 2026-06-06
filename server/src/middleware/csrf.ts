import { Hono } from 'hono'
import { csrf } from 'hono/csrf'

export const csrfMiddleware = csrf({
  origin: (origin) => {
    // 生产环境白名单
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
    ]

    // 支持环境变量配置额外域名
    const additionalOrigins = process.env.ALLOWED_ORIGINS?.split(',') || []
    return [...allowedOrigins, ...additionalOrigins].includes(origin)
  },
})

/**
 * 为需要 CSRF 保护的路由组应用中间件
 * 测试环境和开发环境自动跳过
 *
 * 使用示例:
 * ```ts
 * import { applyCsrf } from './middleware/csrf'
 *
 * const protectedRoute = new Hono()
 * applyCsrf(protectedRoute)
 *
 * protectedRoute.post('/sensitive-action', async (c) => {
 *   // 此路由受 CSRF 保护
 * })
 * ```
 */
export function applyCsrf(app: Hono) {
  // 测试环境和开发环境跳过 CSRF 保护
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return
  }

  app.use('*', csrfMiddleware)
}
