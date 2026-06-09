import { request } from '@/lib/api-client'
import type { WorldBook, WorldBookEntry, WorldIndex } from '@/lib/api-types'

export const worldsApi = {
  list: () => request<WorldIndex[]>('/worlds'),
  get: (name: string) => request<WorldBook>(`/worlds/${encodeURIComponent(name)}`),
  create: (name: string, description?: string) =>
    request<WorldBook>('/worlds', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  update: (name: string, data: Partial<WorldBook>) =>
    request<WorldBook>(`/worlds/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (name: string) =>
    request<{ success: boolean }>(`/worlds/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  addEntry: (worldName: string, entry: Partial<WorldBookEntry>) =>
    request<WorldBook>(`/worlds/${encodeURIComponent(worldName)}/entries`, {
      method: 'POST',
      body: JSON.stringify(entry),
    }),
  updateEntry: (worldName: string, uid: number, entry: Partial<WorldBookEntry>) =>
    request<WorldBook>(`/worlds/${encodeURIComponent(worldName)}/entries/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify(entry),
    }),
  deleteEntry: (worldName: string, uid: number) =>
    request<WorldBook>(`/worlds/${encodeURIComponent(worldName)}/entries/${uid}`, {
      method: 'DELETE',
    }),
  bind: (worldName: string, characterName: string) =>
    request<{ success: boolean }>(`/worlds/${encodeURIComponent(worldName)}/bind`, {
      method: 'POST',
      body: JSON.stringify({ characterName }),
    }),
  unbind: (worldName: string, characterName: string) =>
    request<{ success: boolean }>(`/worlds/${encodeURIComponent(worldName)}/unbind`, {
      method: 'POST',
      body: JSON.stringify({ characterName }),
    }),
}
