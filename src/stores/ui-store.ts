import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  panelCollapsed: boolean
  toggleSidebar: () => void
  togglePanel: () => void
  setSidebarCollapsed: (v: boolean) => void
  setPanelCollapsed: (v: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      panelCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      togglePanel: () => set((s) => ({ panelCollapsed: !s.panelCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      setPanelCollapsed: (v) => set({ panelCollapsed: v }),
    }),
    {
      name: 'luker-ui-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        panelCollapsed: state.panelCollapsed,
      }),
    }
  )
)
