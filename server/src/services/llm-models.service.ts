import {
  apiFormatFromConfig,
  geminiModelId,
  headersFromConfig,
  modelListUrlFromConfig,
  providerFromConfig,
} from '../lib/llm-provider.js'
import type { LLMConfig } from '../lib/llm-config.js'

type ModelListItem = Record<string, unknown>

interface ModelListResponse {
  data?: ModelListItem[]
  models?: ModelListItem[]
  value?: ModelListItem[]
  nextPageToken?: string
  has_more?: boolean
  last_id?: string
  [key: string]: unknown
}

const MAX_MODEL_LIST_PAGES = 10

export async function fetchModelsFromAPI(config: LLMConfig): Promise<string[]> {
  const provider = providerFromConfig(config)
  const apiFormat = apiFormatFromConfig(config)
  let url: string | undefined = initialModelListUrl(modelListUrlFromConfig(config), apiFormat)
  const headers = headersFromConfig(config, provider)
  const models: string[] = []

  for (let page = 0; url && page < MAX_MODEL_LIST_PAGES; page += 1) {
    if (process.env.DEBUG_LLM === 'true') {
      console.info('[LLM] Fetching models from:', url)
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText}`)
    }

    const data = await response.json() as ModelListResponse
    models.push(...parseModelList(data, apiFormat))
    url = nextModelListPageUrl(url, data, apiFormat)
  }

  return uniqueModelList(models)
}

function parseModelList(data: ModelListResponse | unknown[], apiFormat?: string): string[] {
  if (apiFormat === 'gemini_generate_content') {
    return parseGeminiModelList(data)
  }

  if (!Array.isArray(data) && apiFormat === 'azure_openai_chat' && data.value && Array.isArray(data.value)) {
    return data.value.map(m => modelNameFromItem(m, ['name', 'id', 'model'])).filter(Boolean)
  }

  if (!Array.isArray(data) && data.data && Array.isArray(data.data)) {
    return data.data.map(m => modelNameFromItem(m, ['id', 'name', 'model'])).filter(Boolean)
  }

  if (!Array.isArray(data) && data.models && Array.isArray(data.models)) {
    return data.models.map(m => modelNameFromItem(m, ['name', 'id', 'model', 'baseModelId'])).filter(Boolean)
  }

  if (!Array.isArray(data) && data.value && Array.isArray(data.value)) {
    return data.value.map(m => modelNameFromItem(m, ['name', 'id', 'model'])).filter(Boolean)
  }

  if (Array.isArray(data)) {
    return data.map(m => modelNameFromItem(m, ['id', 'name', 'model'])).filter(Boolean)
  }

  console.warn('[LLM] Unknown model list format:', data)
  return []
}

function parseGeminiModelList(data: ModelListResponse | unknown[]): string[] {
  const values = Array.isArray(data) ? data : Array.isArray(data.models) ? data.models : []
  return values
    .filter(geminiSupportsGenerateContent)
    .map(m => geminiModelId(modelNameFromItem(m, ['baseModelId', 'name', 'id', 'model'])))
    .filter(Boolean)
}

function geminiSupportsGenerateContent(item: unknown): boolean {
  if (!isRecord(item)) return true
  const actions = item.supportedGenerationMethods ?? item.supportedActions ?? item.supported_actions
  if (!Array.isArray(actions)) return true
  return actions.some(action => typeof action === 'string' && action.toLowerCase() === 'generatecontent')
}

function modelNameFromItem(item: unknown, fields: string[]): string {
  if (typeof item === 'string') return item.trim()
  if (!isRecord(item)) return ''
  for (const field of fields) {
    const value = item[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function uniqueModelList(models: string[]): string[] {
  return Array.from(new Set(models.map(model => model.trim()).filter(Boolean)))
}

function initialModelListUrl(url: string, apiFormat: string): string {
  if (apiFormat === 'anthropic_messages') return withQueryParam(url, 'limit', '1000')
  if (apiFormat === 'gemini_generate_content') return withQueryParam(url, 'pageSize', '1000')
  return url
}

function nextModelListPageUrl(currentUrl: string, data: ModelListResponse, apiFormat: string): string | undefined {
  if (apiFormat === 'anthropic_messages' && data.has_more === true && data.last_id) {
    return withQueryParam(currentUrl, 'after_id', data.last_id)
  }

  if (apiFormat === 'gemini_generate_content' && data.nextPageToken) {
    return withQueryParam(currentUrl, 'pageToken', data.nextPageToken)
  }

  return undefined
}

function withQueryParam(url: string, key: string, value: string): string {
  const next = new URL(url)
  next.searchParams.set(key, value)
  return next.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
