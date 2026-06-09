import { request } from '@/lib/api-client'
import type { PresetData, PresetIndexEntry, PresetType } from '@/lib/api-types'

export const presetsApi = {
  list: (type: PresetType) => request<string[]>(`/presets/${type}`),
  listDetails: (type: PresetType) => request<PresetIndexEntry[]>(`/presets/${type}?details=1`),
  get: (type: PresetType, name: string) =>
    request<PresetData>(`/presets/${type}/${encodeURIComponent(name)}`),
  save: (type: PresetType, preset: PresetData) =>
    request<PresetData>(`/presets/${type}`, {
      method: 'POST',
      body: JSON.stringify(preset),
    }),
  delete: (type: PresetType, name: string) =>
    request<{ success: boolean }>(`/presets/${type}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
}
