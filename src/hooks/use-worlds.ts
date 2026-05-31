import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type WorldIndex, type WorldBook, type WorldBookEntry } from '@/lib/api'

export function useWorlds() {
  return useQuery<WorldIndex[]>({
    queryKey: ['worlds'],
    queryFn: api.worlds.list,
  })
}

export function useWorld(name: string | null) {
  return useQuery<WorldBook>({
    queryKey: ['worlds', name],
    queryFn: () => api.worlds.get(name!),
    enabled: !!name,
  })
}

export function useCreateWorld() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      api.worlds.create(name, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worlds'] }),
  })
}

export function useUpdateWorld() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, data }: { name: string; data: Partial<WorldBook> }) =>
      api.worlds.update(name, data),
    onSuccess: (_, { name }) => {
      qc.invalidateQueries({ queryKey: ['worlds'] })
      qc.invalidateQueries({ queryKey: ['worlds', name] })
    },
  })
}

export function useDeleteWorld() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.worlds.delete(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worlds'] }),
  })
}

export function useAddWorldEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worldName, entry }: { worldName: string; entry: Partial<WorldBookEntry> }) =>
      api.worlds.addEntry(worldName, entry),
    onSuccess: (_, { worldName }) => {
      qc.invalidateQueries({ queryKey: ['worlds', worldName] })
    },
  })
}

export function useUpdateWorldEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      worldName,
      uid,
      entry,
    }: {
      worldName: string
      uid: number
      entry: Partial<WorldBookEntry>
    }) => api.worlds.updateEntry(worldName, uid, entry),
    onSuccess: (_, { worldName }) => {
      qc.invalidateQueries({ queryKey: ['worlds', worldName] })
    },
  })
}

export function useDeleteWorldEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worldName, uid }: { worldName: string; uid: number }) =>
      api.worlds.deleteEntry(worldName, uid),
    onSuccess: (_, { worldName }) => {
      qc.invalidateQueries({ queryKey: ['worlds', worldName] })
    },
  })
}

export function useBindWorld() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worldName, characterName }: { worldName: string; characterName: string }) =>
      api.worlds.bind(worldName, characterName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worlds'] })
      qc.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}

export function useUnbindWorld() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worldName, characterName }: { worldName: string; characterName: string }) =>
      api.worlds.unbind(worldName, characterName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worlds'] })
      qc.invalidateQueries({ queryKey: ['characters'] })
    },
  })
}
