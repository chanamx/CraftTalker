import { request } from '@/lib/api-client'
import type {
  CharacterCreateInput,
  CharacterDetail,
  CharacterIndex,
} from '@/lib/api-types'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read file'))
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export const charactersApi = {
  list: () => request<CharacterIndex[]>('/characters'),
  get: (name: string) => request<CharacterDetail>(`/characters/${encodeURIComponent(name)}`),
  import: (filePath: string) =>
    request<CharacterDetail>('/characters/import', {
      method: 'POST',
      body: JSON.stringify({ filePath }),
    }),
  upload: async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file)
    const base64 = dataUrl.split(',')[1] ?? ''
    return request<CharacterDetail>('/characters/upload', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, data: base64 }),
    })
  },
  update: (name: string, data: Partial<CharacterDetail>) =>
    request<CharacterDetail>(`/characters/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (name: string) =>
    request<{ success: boolean }>(`/characters/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  create: (data: CharacterCreateInput) =>
    request<CharacterDetail>('/characters', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  clone: (name: string) =>
    request<CharacterDetail>(`/characters/${encodeURIComponent(name)}/clone`, {
      method: 'POST',
    }),
  exportJson: (name: string) =>
    request<Record<string, unknown>>(`/characters/${encodeURIComponent(name)}/export`),
}
