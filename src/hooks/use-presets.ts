import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GenerationPreset, type PresetType } from '@/lib/api'

export function usePresets(type: PresetType | null) {
  return useQuery<string[]>({
    queryKey: ['presets', type],
    queryFn: () => api.presets.list(type!),
    enabled: !!type,
  })
}

export function usePreset(type: PresetType | null, name: string | null) {
  return useQuery<GenerationPreset>({
    queryKey: ['presets', type, name],
    queryFn: () => api.presets.get(type!, name!),
    enabled: !!type && !!name,
  })
}

export function useSavePreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, preset }: { type: PresetType; preset: GenerationPreset }) =>
      api.presets.save(type, preset),
    onSuccess: (_, { type }) => {
      qc.invalidateQueries({ queryKey: ['presets', type] })
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
    },
  })
}
