import { request } from '@/lib/api-client'
import type { ExtensionCompatibilityReport, ExtensionDiscovery, ExtensionSettings } from '@/lib/api-types'

export const extensionsApi = {
  discover: () => request<ExtensionDiscovery[]>('/extensions/discover'),
  getCompatibilityReport: () => request<ExtensionCompatibilityReport>('/extensions/compatibility-report'),
  getSettings: () => request<ExtensionSettings>('/extensions/settings'),
  saveSettings: (settings: ExtensionSettings) =>
    request<ExtensionSettings>('/extensions/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
}
