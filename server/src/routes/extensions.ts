import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  discoverExtensions,
  getExtensionCompatibilityReport,
  readExtensionSettings,
  saveExtensionSettings,
} from '../services/extension.service.js'

const extensionsRoute = new Hono()

const extensionSettingsSchema = z.object({}).catchall(z.unknown())

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

function notImplemented(name: string) {
  return {
    success: false,
    error: `SillyTavern extension ${name} is not implemented in the CraftTalker compatibility runtime yet.`,
  }
}

extensionsRoute.post('/install', (c) => c.json(notImplemented('install'), 501))
extensionsRoute.post('/update', (c) => c.json(notImplemented('update'), 501))
extensionsRoute.post('/delete', (c) => c.json(notImplemented('delete'), 501))
extensionsRoute.post('/move', (c) => c.json(notImplemented('move'), 501))
extensionsRoute.post('/version', (c) => c.json(notImplemented('version'), 501))
extensionsRoute.post('/branches', (c) => c.json(notImplemented('branches'), 501))
extensionsRoute.post('/switch', (c) => c.json(notImplemented('switch'), 501))

export { extensionsRoute }
