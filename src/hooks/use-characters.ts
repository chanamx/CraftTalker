import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type CharacterIndex, type CharacterDetail } from '@/lib/api'

export function useCharacters() {
  return useQuery<CharacterIndex[]>({
    queryKey: ['characters'],
    queryFn: api.characters.list,
  })
}

export function useCharacter(name: string | null) {
  return useQuery<CharacterDetail>({
    queryKey: ['characters', name],
    queryFn: () => api.characters.get(name!),
    enabled: !!name,
  })
}

export function useImportCharacter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.characters.upload(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters'] }),
  })
}

export function useUpdateCharacter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Partial<CharacterDetail> }) =>
      api.characters.update(name, data),
    onSuccess: (_, { name }) => {
      qc.invalidateQueries({ queryKey: ['characters'] })
      qc.invalidateQueries({ queryKey: ['characters', name] })
    },
  })
}

export function useCreateCharacter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof api.characters.create>[0]) =>
      api.characters.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters'] }),
  })
}

export function useDeleteCharacter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.characters.delete(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['characters'] }),
  })
}
