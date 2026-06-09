import { request } from '@/lib/api-client'
import type { LlmRequestConfig } from '@/lib/api-types'

export const engineApi = {
  testConnection: (config: LlmRequestConfig) =>
    request<{ success: boolean }>('/engine/test', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
}
