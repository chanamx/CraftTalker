import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type PresetData, type PresetIndexEntry, type PresetType } from '@/lib/api'

export function usePresets(type: PresetType | null) {
  return useQuery<string[]>({
    queryKey: ['presets', type],
    queryFn: () => api.presets.list(type!),
    enabled: !!type,
  })
}

export function usePresetEntries(type: PresetType | null) {
  return useQuery<PresetIndexEntry[]>({
    queryKey: ['presets', type, 'details'],
    queryFn: () => api.presets.listDetails(type!),
    enabled: !!type,
  })
}

export function usePreset(type: PresetType | null, name: string | null) {
  return useQuery<PresetData>({
    queryKey: ['presets', type, name],
    queryFn: () => api.presets.get(type!, name!),
    enabled: !!type && !!name,
  })
}

export function useSavePreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, preset }: { type: PresetType; preset: PresetData }) =>
      api.presets.save(type, preset),
    onSuccess: (_, { type }) => {
      qc.invalidateQueries({ queryKey: ['presets', type] })
      qc.invalidateQueries({ queryKey: ['presets', type, 'details'] })
    },
  })
}

export function useDeletePreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, name }: { type: PresetType; name: string }) =>
      api.presets.delete(type, name),
    onSuccess: (_, { type }) => {
      qc.invalidateQueries({ queryKey: ['presets', type] })
      qc.invalidateQueries({ queryKey: ['presets', type, 'details'] })
    },
  })
}
