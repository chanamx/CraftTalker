import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as presetService from '../services/preset.service.js'
import { isPresetType } from '../services/preset.service.js'

const presetsRoute = new Hono()

presetsRoute.get('/:type', async (c) => {
  const type = c.req.param('type')
  if (!isPresetType(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  if (c.req.query('details') === '1') {
    const entries = await presetService.listPresetEntries(type)
    return c.json(entries)
  }
  const presets = await presetService.listPresets(type)
  return c.json(presets)
})

presetsRoute.get('/:type/:name', async (c) => {
  const type = c.req.param('type')
  const name = decodeURIComponent(c.req.param('name'))
  if (!isPresetType(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  const preset = await presetService.getPreset(type, name)
  return c.json(preset)
})

const presetSchema = z.object({
  name: z.string().min(1),
}).catchall(z.unknown())

presetsRoute.post('/:type', zValidator('json', presetSchema), async (c) => {
  const type = c.req.param('type')
  if (!isPresetType(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  const data = c.req.valid('json')
  const preset = await presetService.savePreset(type, data.name, data)
  return c.json(preset, 201)
})

presetsRoute.delete('/:type/:name', async (c) => {
  const type = c.req.param('type')
  const name = decodeURIComponent(c.req.param('name'))
  if (!isPresetType(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  await presetService.deletePreset(type, name)
  return c.json({ success: true })
})

export { presetsRoute }
