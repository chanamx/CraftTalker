import { serve } from '@hono/node-server'
import { createApp } from './app.js'

const app = createApp()

const port = parseInt(process.env.PORT ?? '3000', 10)

console.log(`CraftTalker server starting on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`Server listening on http://localhost:${info.port}`)
})
