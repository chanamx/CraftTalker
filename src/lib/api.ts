import { charactersApi } from '@/lib/api-domains/characters'
import { chatsApi } from '@/lib/api-domains/chats'
import { engineApi } from '@/lib/api-domains/engine'
import { llmApi } from '@/lib/api-domains/llm'
import { llmSessionsApi } from '@/lib/api-domains/llm-sessions'
import { presetsApi } from '@/lib/api-domains/presets'
import { runsApi } from '@/lib/api-domains/runs'
import { worldsApi } from '@/lib/api-domains/worlds'

export { ApiRequestError, consumeSSEStream } from '@/lib/api-client'
export type * from '@/lib/api-types'

export const api = {
  testConnection: engineApi.testConnection,
  llm: llmApi,
  llmSessions: llmSessionsApi,
  characters: charactersApi,
  chats: chatsApi,
  runs: runsApi,
  worlds: worldsApi,
  presets: presetsApi,
}
