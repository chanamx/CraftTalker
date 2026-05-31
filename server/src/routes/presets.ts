import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import * as presetService from '../services/preset.service.js'
import type { PresetType } from '../services/preset.service.js'

const presetsRoute = new Hono()

presetsRoute.get('/:type', async (c) => {
  const type = c.req.param('type') as PresetType
  if (!['kobold', 'openai', 'textgen', 'novel'].includes(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  const presets = await presetService.listPresets(type)
  return c.json(presets)
})

presetsRoute.get('/:type/:name', async (c) => {
  const type = c.req.param('type') as PresetType
  const name = decodeURIComponent(c.req.param('name'))
  if (!['kobold', 'openai', 'textgen', 'novel'].includes(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  const preset = await presetService.getPreset(type, name)
  return c.json(preset)
})

const presetSchema = z.object({
  name: z.string().min(1),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().optional(),
  top_a: z.number().optional(),
  min_p: z.number().optional(),
  max_tokens: z.number().optional(),
  repetition_penalty: z.number().optional(),
  repetition_penalty_range: z.number().optional(),
  repetition_penalty_slope: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
  typical_p: z.number().optional(),
  tfs: z.number().optional(),
  mirostat_mode: z.number().optional(),
  mirostat_tau: z.number().optional(),
  mirostat_eta: z.number().optional(),
  sampler_order: z.array(z.number()).optional(),
  skip_special_tokens: z.boolean().optional(),
  ban_eos_token: z.boolean().optional(),
  add_bos_token: z.boolean().optional(),
  token_healing: z.boolean().optional(),
  seed: z.number().optional(),
  grammar_string: z.string().optional(),
  guidance_scale: z.number().optional(),
  negative_prompt: z.string().optional(),
  dry_allowed_length: z.number().optional(),
  dry_multiplier: z.number().optional(),
  dry_base: z.number().optional(),
  dry_sequence_breakers: z.string().optional(),
  xtc_threshold: z.number().optional(),
  xtc_probability: z.number().optional(),
})

presetsRoute.post('/:type', zValidator('json', presetSchema), async (c) => {
  const type = c.req.param('type') as PresetType
  if (!['kobold', 'openai', 'textgen', 'novel'].includes(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  const data = c.req.valid('json')
  const preset = await presetService.savePreset(type, data.name, {
    ...presetService.getDefaultPreset(),
    ...data,
  })
  return c.json(preset, 201)
})

presetsRoute.delete('/:type/:name', async (c) => {
  const type = c.req.param('type') as PresetType
  const name = decodeURIComponent(c.req.param('name'))
  if (!['kobold', 'openai', 'textgen', 'novel'].includes(type)) {
    return c.json({ error: 'Invalid preset type' }, 400)
  }
  await presetService.deletePreset(type, name)
  return c.json({ success: true })
})

export { presetsRoute }
