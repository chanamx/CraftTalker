import { Hono } from 'hono'
import { getStCompatModelListResponse } from '../services/st-compat-models.service.js'

const stOpenAiRoute = new Hono()

stOpenAiRoute.get('/models', (c) => {
  return c.json(getStCompatModelListResponse())
})

export { stOpenAiRoute }
