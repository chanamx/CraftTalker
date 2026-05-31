import { cn } from '@/lib/utils'

function pulse() {
  return 'bg-[var(--color-bg-surface)] animate-pulse rounded-md'
}

export function SidebarSkeleton() {
  return (
    <div className="flex flex-col h-full p-3 gap-3">
      <div className={cn(pulse(), 'h-5 w-12')} />
      <div className={cn(pulse(), 'h-8 w-full')} />
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={cn(pulse(), 'w-9 h-9 rounded-xl flex-shrink-0')} />
          <div className="flex-1 space-y-1.5">
            <div className={cn(pulse(), 'h-3.5 w-20')} />
            <div className={cn(pulse(), 'h-2.5 w-32')} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ChatAreaSkeleton() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4">
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className={cn(pulse(), 'w-16 h-16 rounded-2xl')} />
        <div className={cn(pulse(), 'h-5 w-32')} />
        <div className={cn(pulse(), 'h-4 w-64')} />
      </div>
    </div>
  )
}

export function CharacterPanelSkeleton() {
  return (
    <div className="flex flex-col h-full p-4 gap-4">
      <div className="flex items-center gap-3">
        <div className={cn(pulse(), 'w-12 h-12 rounded-xl flex-shrink-0')} />
        <div className="space-y-1.5 flex-1">
          <div className={cn(pulse(), 'h-4 w-24')} />
          <div className={cn(pulse(), 'h-3 w-40')} />
        </div>
      </div>
      <div className={cn(pulse(), 'h-16 w-full')} />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className={cn(pulse(), 'h-3 w-16')} />
          <div className={cn(pulse(), 'h-8 w-full')} />
        </div>
      ))}
    </div>
  )
}

export function ChatListSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className={cn(pulse(), 'h-8 w-full')} />
      ))}
    </div>
  )
}

export function WorldBookSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <div className={cn(pulse(), 'h-5 w-20')} />
      {[...Array(5)].map((_, i) => (
        <div key={i} className={cn(pulse(), 'h-14 w-full')} />
      ))}
    </div>
  )
}
