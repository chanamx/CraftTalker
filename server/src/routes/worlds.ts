import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as worldService from '../services/world.service.js'
import { updateCharacter, getCharacter } from '../services/character.service.js'

const worldsRoute = new Hono()

worldsRoute.get('/', async (c) => {
  const worlds = await worldService.listWorlds()
  return c.json(worlds)
})

worldsRoute.get('/:name', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const world = await worldService.getWorld(name)
  return c.json(world)
})

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

worldsRoute.post('/', zValidator('json', createSchema), async (c) => {
  const { name, description } = c.req.valid('json')
  const world = await worldService.createWorld(name, description)
  return c.json(world, 201)
})

const updateSchema = z.object({
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  global_selective: z.boolean().optional(),
  selective_default: z.boolean().optional(),
  recursive_scanning: z.boolean().optional(),
  scan_depth: z.number().optional(),
  token_budget: z.number().optional(),
  recursive_scanning_depth: z.number().optional(),
})

worldsRoute.patch('/:name', zValidator('json', updateSchema), async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const updates = c.req.valid('json')
  const updated = await worldService.updateWorld(name, updates)
  return c.json(updated)
})

worldsRoute.delete('/:name', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  await worldService.deleteWorld(name)
  return c.json({ success: true })
})

const entrySchema = z.object({
  uid: z.number().optional(),
  key: z.array(z.string()),
  keysecondary: z.array(z.string()).optional(),
  comment: z.string().optional(),
  content: z.string(),
  constant: z.boolean().optional(),
  selective: z.boolean().optional(),
  insertion_order: z.number().optional(),
  enabled: z.boolean().optional(),
  position: z.number().min(0).max(6).optional(),
  depth: z.number().optional(),
  order: z.number().optional(),
  use_regexp: z.boolean().optional(),
  probability: z.number().optional(),
  group: z.string().optional(),
  group_override: z.boolean().optional(),
  exclude_recursion: z.boolean().optional(),
  prevent_recursion: z.boolean().optional(),
  delay_until_recursion: z.boolean().optional(),
  scan_depth: z.number().optional(),
  match_whole_words: z.boolean().optional(),
  use_group_scoring: z.boolean().optional(),
  case_sensitive: z.boolean().optional(),
  automation_id: z.string().optional(),
  role: z.number().optional(),
  sticky: z.number().optional(),
  cooldown: z.number().optional(),
  delay: z.number().optional(),
  display_index: z.number().optional(),
})

worldsRoute.post('/:name/entries', zValidator('json', entrySchema), async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const entry = c.req.valid('json')
  const updated = await worldService.addWorldEntry(name, entry as any)
  return c.json(updated, 201)
})

worldsRoute.patch('/:name/entries/:uid', zValidator('json', entrySchema.partial()), async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const uid = parseInt(c.req.param('uid'), 10)
  const updates = c.req.valid('json')
  const updated = await worldService.updateWorldEntry(name, uid, updates as any)
  return c.json(updated)
})

worldsRoute.delete('/:name/entries/:uid', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const uid = parseInt(c.req.param('uid'), 10)
  const updated = await worldService.deleteWorldEntry(name, uid)
  return c.json(updated)
})

const bindSchema = z.object({
  characterName: z.string().min(1),
})

worldsRoute.post('/:name/bind', zValidator('json', bindSchema), async (c) => {
  const worldName = decodeURIComponent(c.req.param('name'))
  const { characterName } = c.req.valid('json')
  await worldService.getWorld(worldName)
  const char = await getCharacter(characterName)
  const extensions = { ...char.extensions, world: worldName }
  await updateCharacter(characterName, { extensions })
  return c.json({ success: true })
})

worldsRoute.post('/:name/unbind', zValidator('json', bindSchema), async (c) => {
  const worldName = decodeURIComponent(c.req.param('name'))
  const { characterName } = c.req.valid('json')
  const char = await getCharacter(characterName)
  if (char.extensions?.world === worldName) {
    const { world: _, ...rest } = char.extensions as Record<string, unknown>
    await updateCharacter(characterName, { extensions: rest })
  }
  return c.json({ success: true })
})

export { worldsRoute }
