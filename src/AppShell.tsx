import { useCallback } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import { AppLayout } from '@/components/layout/AppLayout'
import { defaultCharacter } from '@/stores/chat-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUIStore } from '@/stores/ui-store'
import { useAppState } from '@/hooks/use-app-state'
import { useChatActions } from '@/hooks/use-chat-actions'
import { CharacterEditor } from '@/components/character/CharacterEditor'
import { OnboardingWizard, useOnboarding } from '@/components/onboarding/OnboardingWizard'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()

  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const panelCollapsed = useUIStore((s) => s.panelCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const togglePanel = useUIStore((s) => s.togglePanel)

  const genConfig = useSettingsStore((s) => s.genConfig)
  const setTemperature = useSettingsStore((s) => s.setTemperature)
  const setTopP = useSettingsStore((s) => s.setTopP)
  const setContextLength = useSettingsStore((s) => s.setContextLength)
  const setMaxReplyLength = useSettingsStore((s) => s.setMaxReplyLength)

  const {
    characters, charactersLoading,
    activeCharacter, activeChatId, chatsData, messages,
    characterEditorOpen, editingCharacter,
    setCharacterEditorOpen, setEditingCharacter,
    handleSelectCharacter, handleCreateCharacter, handleEditCharacter,
    handleNewChat, handleSelectChat, handleDeleteChat,
  } = useAppState()

  const {
    isStreaming, displayMessages,
    handleSend, handleStop, handleDeleteMessage, handleEditMessage, handleRegenerate,
    handleSwipe, handleContinue,
  } = useChatActions(messages)

  const toast = useToast()
  const queryClient = useQueryClient()
  const handleRenameChat = useCallback(async (chatId: string, name: string) => {
    if (!activeCharacter) return
    try {
      await api.chats.rename(activeCharacter.file_name, chatId, name)
      queryClient.invalidateQueries({ queryKey: ['chats', activeCharacter.file_name] })
    } catch {
      toast.error('重命名失败')
    }
  }, [activeCharacter, toast, queryClient])

  const { showOnboarding, completeOnboarding } = useOnboarding()

  const isDialogRoute = location.pathname !== '/'

  return (
    <>
      <AppLayout
        sidebarCollapsed={sidebarCollapsed}
        panelCollapsed={panelCollapsed}
        onToggleSidebar={toggleSidebar}
        onTogglePanel={togglePanel}
        onOpenSettings={() => navigate('/settings')}
        onOpenWorldBook={() => navigate(`/world-book${activeCharacter?.world ? `?world=${encodeURIComponent(activeCharacter.world)}` : ''}`)}
        onOpenPresets={() => navigate('/presets')}
        chats={chatsData ?? []}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        onRenameChat={handleRenameChat}
        sidebar={{
          characters,
          activeId: activeCharacter?.id ?? '',
          collapsed: sidebarCollapsed,
          onSelect: handleSelectCharacter,
          onImport: () => navigate('/import'),
          onCreate: () => setCharacterEditorOpen(true),
          loading: charactersLoading,
        }}
        chat={{
          character: activeCharacter ?? defaultCharacter,
          messages: displayMessages,
          isStreaming,
          onSend: handleSend,
          onStop: handleStop,
          onDeleteMessage: handleDeleteMessage,
          onEditMessage: handleEditMessage,
          onRegenerate: handleRegenerate,
          onSwipe: handleSwipe,
          onContinue: handleContinue,
        }}
        panel={{
          character: activeCharacter ?? defaultCharacter,
          collapsed: panelCollapsed,
          onTemperatureChange: setTemperature,
          onTopPChange: setTopP,
          onContextLengthChange: setContextLength,
          onMaxReplyLengthChange: setMaxReplyLength,
          temperature: genConfig.temperature,
          topP: genConfig.topP,
          contextLength: genConfig.contextLength,
          maxReplyLength: genConfig.maxReplyLength,
          onOpenWorldBook: () => navigate(`/world-book${activeCharacter?.world ? `?world=${encodeURIComponent(activeCharacter.world)}` : ''}`),
          onOpenPresets: () => navigate('/presets'),
          onOpenSettings: () => navigate('/settings'),
        }}
      />
      {isDialogRoute && <Outlet />}
      <CharacterEditor
        open={characterEditorOpen}
        onClose={() => setCharacterEditorOpen(false)}
        onSave={handleCreateCharacter}
      />
      <CharacterEditor
        open={editingCharacter !== null}
        onClose={() => setEditingCharacter(null)}
        onSave={handleEditCharacter}
        initial={editingCharacter}
      />
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWizard
            characters={characters}
            onSelectCharacter={handleSelectCharacter}
            onComplete={completeOnboarding}
          />
        )}
      </AnimatePresence>
    </>
  )
}
