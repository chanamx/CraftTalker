import { describe, expect, it } from 'vitest'
import { ensureStCompatDomAnchors, syncStCompatDomState } from '@/lib/st-compat-dom'

describe('SillyTavern compatibility DOM anchors', () => {
  it('keeps mirrored ST nodes scoped while preserving pre-existing native nodes', () => {
    document.body.innerHTML = '<main id="chat"><div class="native-message">Native</div></main>'
    const nativeMessage = document.querySelector('.native-message')

    ensureStCompatDomAnchors()
    syncStCompatDomState({
      worldNames: ['GlobalLore'],
      selectedWorldInfo: ['GlobalLore'],
      chat: [
        { chat_metadata: { variables: {}, extensions: {} }, user_name: 'User', character_name: 'Cora' },
        { name: 'Cora', is_user: false, is_system: false, mes: 'Hello', send_date: '2026-06-18T00:00:00.000Z', extra: {} },
      ],
    })

    const root = document.querySelector('[data-st-compat-anchor="crafttalker-st-compat-root"]')
    const compatChat = root?.querySelector('[data-st-compat-anchor="chat"]')

    expect(document.body.firstElementChild).toBe(root)
    expect(nativeMessage?.isConnected).toBe(true)
    expect(nativeMessage?.textContent).toBe('Native')
    expect(compatChat?.querySelector('.mes[mesid="1"] .mes_text')?.textContent).toBe('Hello')
    expect(root?.querySelector('#world_info option:nth-child(2)')?.textContent).toBe('GlobalLore')
  })
})
