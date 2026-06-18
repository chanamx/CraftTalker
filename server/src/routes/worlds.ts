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
  global_enabled: z.boolean().optional(),
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
  const normalizedUpdates = {
    ...updates,
    ...(updates.global_enabled === true ? { enabled: true } : {}),
  }
  await worldService.updateWorld(name, normalizedUpdates)
  const updated = await syncWorldActivationForScopes(name)
  return c.json(updated)
})

worldsRoute.delete('/:name', async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  await worldService.deleteWorld(name)
  return c.json({ success: true })
})

const entryPositionSchema = z.union([
  z.number().int().min(0).max(7),
  z.enum([
    'before',
    'before_char',
    'after',
    'after_char',
    'an_top',
    'author_note_top',
    'an_bottom',
    'author_note_bottom',
    'at_depth',
    'example_top',
    'em_top',
    'example_bottom',
    'em_bottom',
    'outlet',
  ]),
])
const booleanOrNumberSchema = z.union([z.boolean(), z.number(), z.string()])

const entrySchema = z.object({
  uid: z.number().optional(),
  key: z.array(z.string()).optional(),
  keys: z.array(z.string()).optional(),
  keysecondary: z.array(z.string()).optional(),
  secondary_keys: z.array(z.string()).optional(),
  comment: z.string().optional(),
  content: z.string(),
  constant: z.boolean().optional(),
  vectorized: z.boolean().optional(),
  selective: z.boolean().optional(),
  selectiveLogic: z.number().optional(),
  selective_logic: z.number().optional(),
  addMemo: z.boolean().optional(),
  add_memo: z.boolean().optional(),
  insertion_order: z.number().optional(),
  enabled: z.boolean().optional(),
  disable: z.boolean().optional(),
  position: entryPositionSchema.optional(),
  depth: z.number().optional(),
  order: z.number().optional(),
  use_regexp: z.boolean().optional(),
  use_regex: z.boolean().optional(),
  probability: z.number().nullable().optional(),
  useProbability: z.boolean().optional(),
  use_probability: z.boolean().optional(),
  group: z.string().optional(),
  groupOverride: z.boolean().optional(),
  group_override: z.boolean().optional(),
  groupWeight: z.number().optional(),
  group_weight: z.number().optional(),
  ignoreBudget: z.boolean().optional(),
  ignore_budget: z.boolean().optional(),
  excludeRecursion: z.boolean().optional(),
  exclude_recursion: z.boolean().optional(),
  preventRecursion: z.boolean().optional(),
  prevent_recursion: z.boolean().optional(),
  delayUntilRecursion: booleanOrNumberSchema.optional(),
  delay_until_recursion: booleanOrNumberSchema.optional(),
  scanDepth: z.number().nullable().optional(),
  scan_depth: z.number().optional(),
  matchWholeWords: z.boolean().nullable().optional(),
  match_whole_words: z.boolean().optional(),
  useGroupScoring: z.boolean().nullable().optional(),
  use_group_scoring: z.boolean().optional(),
  caseSensitive: z.boolean().nullable().optional(),
  case_sensitive: z.boolean().optional(),
  automationId: z.string().optional(),
  automation_id: z.string().optional(),
  role: z.number().optional(),
  sticky: z.number().nullable().optional(),
  cooldown: z.number().nullable().optional(),
  delay: z.number().nullable().optional(),
  displayIndex: z.number().optional(),
  display_index: z.number().optional(),
  outletName: z.string().optional(),
  outlet_name: z.string().optional(),
  matchPersonaDescription: z.boolean().optional(),
  match_persona_description: z.boolean().optional(),
  matchCharacterDescription: z.boolean().optional(),
  match_character_description: z.boolean().optional(),
  matchCharacterPersonality: z.boolean().optional(),
  match_character_personality: z.boolean().optional(),
  matchCharacterDepthPrompt: z.boolean().optional(),
  match_character_depth_prompt: z.boolean().optional(),
  matchScenario: z.boolean().optional(),
  match_scenario: z.boolean().optional(),
  matchCreatorNotes: z.boolean().optional(),
  match_creator_notes: z.boolean().optional(),
  triggers: z.array(z.string()).optional(),
  characterFilter: z.object({
    names: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    isExclude: z.boolean().optional(),
  }).optional(),
  character_filter: z.object({
    names: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    isExclude: z.boolean().optional(),
  }).optional(),
}).passthrough()
const entryUpdateSchema = entrySchema.partial()
type WorldEntryInput = z.infer<typeof entrySchema>
type WorldEntryUpdate = z.infer<typeof entryUpdateSchema>

worldsRoute.post('/:name/entries', zValidator('json', entrySchema), async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const entry: WorldEntryInput = c.req.valid('json')
  const updated = await worldService.addWorldEntry(name, entry)
  return c.json(updated, 201)
})

worldsRoute.patch('/:name/entries/:uid', zValidator('json', entryUpdateSchema), async (c) => {
  const name = decodeURIComponent(c.req.param('name'))
  const uid = parseInt(c.req.param('uid'), 10)
  const updates: WorldEntryUpdate = c.req.valid('json')
  const updated = await worldService.updateWorldEntry(name, uid, updates)
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
  const world = await worldService.getWorld(worldName)
  let worldUpdates: Partial<worldService.WorldBook> = {}
  if (typeof world.global_enabled !== 'boolean') {
    const currentListItem = (await worldService.listWorlds()).find(item => item.name === worldName)
    if (currentListItem?.global_enabled) {
      worldUpdates = { ...worldUpdates, global_enabled: true }
    }
  }
  const char = await getCharacter(characterName)
  const existingWorlds = worldService.getWorldNamesFromExtensions(char.extensions)
  const nextWorlds = existingWorlds.includes(worldName) ? existingWorlds : [...existingWorlds, worldName]
  if (nextWorlds.length !== existingWorlds.length && !world.enabled) {
    worldUpdates = { ...worldUpdates, enabled: true }
  }
  if (Object.keys(worldUpdates).length > 0) {
    await worldService.updateWorld(worldName, worldUpdates)
  }
  const extensions: Record<string, unknown> = { ...char.extensions }
  if (nextWorlds.length > 0) {
    extensions.world = nextWorlds[0]
  } else {
    delete extensions.world
  }
  if (nextWorlds.length > 1) {
    extensions.worlds = nextWorlds
  } else {
    delete extensions.worlds
  }
  await updateCharacter(characterName, { extensions })
  return c.json({ success: true })
})

worldsRoute.post('/:name/unbind', zValidator('json', bindSchema), async (c) => {
  const worldName = decodeURIComponent(c.req.param('name'))
  const { characterName } = c.req.valid('json')
  const char = await getCharacter(characterName)
  const nextWorlds = worldService.getWorldNamesFromExtensions(char.extensions)
    .filter(name => name !== worldName)
  const extensions: Record<string, unknown> = { ...char.extensions }
  if (nextWorlds.length > 0) {
    extensions.world = nextWorlds[0]
  } else {
    delete extensions.world
  }
  if (nextWorlds.length > 1) {
    extensions.worlds = nextWorlds
  } else {
    delete extensions.worlds
  }
  await updateCharacter(characterName, { extensions })
  await syncWorldActivationForScopes(worldName)
  return c.json({ success: true })
})

async function syncWorldActivationForScopes(worldName: string): Promise<worldService.WorldBook> {
  const current = await worldService.getWorld(worldName)
  const listItem = (await worldService.listWorlds()).find(item => item.name === worldName)
  const hasActiveScope = worldService.hasExplicitGlobalScope(current) || Boolean(listItem?.bound_to.length)
  if (!hasActiveScope && current.enabled) {
    return worldService.updateWorld(worldName, { enabled: false, global_enabled: false })
  }
  return current
}

export { worldsRoute }
