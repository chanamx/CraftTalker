import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  discoverExtensions,
  getExtensionVersionInfo,
  getExtensionCompatibilityReport,
  readExtensionSettings,
  saveExtensionSettings,
} from '../services/extension.service.js'
import { createError, ErrorCode } from '../lib/errors.js'

const extensionsRoute = new Hono()

const extensionSettingsSchema = z.object({}).catchall(z.unknown())
const extensionVersionSchema = z.object({
  extensionName: z.string().optional(),
  name: z.string().optional(),
  global: z.boolean().optional(),
})

extensionsRoute.get('/discover', async (c) => {
  const extensions = await discoverExtensions()
  return c.json(extensions)
})

extensionsRoute.get('/settings', async (c) => {
  const settings = await readExtensionSettings()
  return c.json(settings)
})

extensionsRoute.get('/compatibility-report', async (c) => {
  const report = await getExtensionCompatibilityReport()
  return c.json(report)
})

extensionsRoute.post('/settings', zValidator('json', extensionSettingsSchema), async (c) => {
  const settings = await saveExtensionSettings(c.req.valid('json'))
  return c.json(settings)
})

extensionsRoute.get('/version', async (c) => {
  const extensionName = c.req.query('extensionName') ?? c.req.query('name')
  if (!extensionName) throw createError(ErrorCode.VALIDATION_ERROR, 'extensionName is required')
  const globalQuery = c.req.query('global')
  const globalFlag = globalQuery === undefined ? undefined : globalQuery === 'true'
  const version = await getExtensionVersionInfo(extensionName, globalFlag)
  return c.json(version)
})

extensionsRoute.post('/version', zValidator('json', extensionVersionSchema), async (c) => {
  const payload = c.req.valid('json')
  const extensionName = payload.extensionName ?? payload.name
  if (!extensionName) throw createError(ErrorCode.VALIDATION_ERROR, 'extensionName is required')
  const version = await getExtensionVersionInfo(extensionName, payload.global)
  return c.json(version)
})

function notImplemented(name: string) {
  return {
    success: false,
    message: `SillyTavern extension ${name} is blocked in the CraftTalker compatibility runtime.`,
    error: `SillyTavern extension ${name} is blocked in the CraftTalker compatibility runtime.`,
    blocked: true,
  }
}

extensionsRoute.post('/install', (c) => c.json(notImplemented('install'), 501))
extensionsRoute.post('/update', (c) => c.json(notImplemented('update'), 501))
extensionsRoute.post('/delete', (c) => c.json(notImplemented('delete'), 501))
extensionsRoute.post('/move', (c) => c.json(notImplemented('move'), 501))
extensionsRoute.post('/branches', (c) => c.json(notImplemented('branches'), 501))
extensionsRoute.post('/switch', (c) => c.json(notImplemented('switch'), 501))

export { extensionsRoute }
