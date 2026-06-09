import { request } from '@/lib/api-client'
import type { LlmRequestConfig } from '@/lib/api-types'

export const llmApi = {
  models: (config: LlmRequestConfig) =>
    request<string[]>('/llm/models', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
}
