import { Hono } from 'hono'

const stSdRoute = new Hono()

function blockedSdProxy(feature: string) {
  return {
    success: false,
    blocked: true,
    error: `${feature} is blocked in the CraftTalker compatibility runtime until an explicit trusted image-backend proxy boundary is implemented.`,
  }
}

stSdRoute.all('/comfy/*', (c) => c.json(blockedSdProxy('SillyTavern ComfyUI proxy'), 501))
stSdRoute.all('/ping', (c) => c.json(blockedSdProxy('SillyTavern Stable Diffusion proxy'), 501))
stSdRoute.all('/*', (c) => c.json(blockedSdProxy('SillyTavern Stable Diffusion proxy'), 501))

export { stSdRoute }
