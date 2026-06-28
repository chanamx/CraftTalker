import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { deleteUserFileByPath, readUserFile, saveUploadedUserFile } from '../services/user-file.service.js'

const filesRoute = new Hono()
const userFilesRoute = new Hono()

const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  data: z.string(),
})
const deleteSchema = z.object({
  path: z.string().min(1).max(255),
})

filesRoute.post('/upload', zValidator('json', uploadSchema), async (c) => {
  const { name, data } = c.req.valid('json')
  return c.json(await saveUploadedUserFile(name, data))
})

filesRoute.post('/delete', zValidator('json', deleteSchema), async (c) => {
  const { path } = c.req.valid('json')
  return c.json(await deleteUserFileByPath(path))
})

userFilesRoute.get('/:filename', async (c) => {
  const file = await readUserFile(c.req.param('filename'))
  c.header('Content-Type', file.contentType)
  c.header('Cache-Control', 'no-cache')
  return c.body(file.body)
})

export { filesRoute, userFilesRoute }
