import { afterEach, describe, expect, it } from 'vitest'
import { ensureStCompatDomAnchors, syncStCompatDomState } from '@/lib/st-compat-dom'

describe('SillyTavern compatibility DOM anchors', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.documentElement.classList.remove('dark')
    document.documentElement.style.removeProperty('--crafttalker-st-compat-right-offset')
    localStorage.removeItem('crafttalker-st-plugins-open')
  })

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
    expect(getComputedStyle(root as Element).position).toBe('fixed')
    expect(getComputedStyle(root as Element).inset).toBe('0px')
    expect(getComputedStyle(root as Element).pointerEvents).toBe('none')
    expect(nativeMessage?.isConnected).toBe(true)
    expect(nativeMessage?.textContent).toBe('Native')
    expect(compatChat?.querySelector('.mes[mesid="1"] .mes_text')?.textContent).toBe('Hello')
    expect(root?.querySelector('#world_info option:nth-child(2)')?.textContent).toBe('GlobalLore')
  })

  it('hosts extension settings in a collapsed drawer instead of page flow', async () => {
    ensureStCompatDomAnchors()

    const root = document.getElementById('crafttalker-st-compat-root')
    const toggle = document.getElementById('crafttalker-st-compat-toggle') as HTMLButtonElement | null
    const close = document.getElementById('crafttalker-st-compat-close') as HTMLButtonElement | null
    const panel = document.getElementById('crafttalker-st-compat-settings-panel')
    const settings = document.getElementById('extensions_settings')

    settings?.appendChild(document.createElement('section'))
    await Promise.resolve()

    expect(root?.dataset.hasContent).toBe('true')
    expect(panel?.dataset.hasContent).toBe('true')
    expect(panel?.getAttribute('aria-hidden')).toBe('true')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(toggle?.dataset.stCompatToggle).toBe('true')
    expect(close?.getAttribute('aria-label')).toBe('Close ST plugins panel')

    toggle?.click()

    expect(root?.dataset.open).toBe('true')
    expect(panel?.getAttribute('aria-hidden')).toBe('false')
    expect(toggle?.getAttribute('aria-expanded')).toBe('true')
    expect(localStorage.getItem('crafttalker-st-plugins-open')).toBe('true')

    close?.click()

    expect(root?.dataset.open).toBe('false')
    expect(panel?.getAttribute('aria-hidden')).toBe('true')
    expect(toggle?.getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem('crafttalker-st-plugins-open')).toBe('false')
  })

  it('reads the native right-panel offset as a safe rail for the plugin drawer', () => {
    document.documentElement.style.setProperty('--crafttalker-st-compat-right-offset', '300px')

    ensureStCompatDomAnchors()

    const toggle = document.getElementById('crafttalker-st-compat-toggle')
    const panel = document.getElementById('crafttalker-st-compat-settings-panel')

    expect(normaliseCssToken(getComputedStyle(toggle as Element).right))
      .toContain('var(--crafttalker-st-compat-right-offset,0px)+20px')
    expect(normaliseCssToken(getComputedStyle(panel as Element).right))
      .toContain('var(--crafttalker-st-compat-right-offset,0px)+20px')
  })

  it('maps ST SmartTheme variables to light and dark CraftTalker themes', () => {
    ensureStCompatDomAnchors()

    const lightText = normaliseCssToken(getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBodyColor'))
    const lightSurface = normaliseCssToken(getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor'))

    document.documentElement.classList.add('dark')

    const darkText = normaliseCssToken(getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBodyColor'))
    const darkSurface = normaliseCssToken(getComputedStyle(document.documentElement).getPropertyValue('--SmartThemeBlurTintColor'))

    expect(lightText).toBe('rgb(28,30,34)')
    expect(lightSurface).toBe('rgba(238,242,248,.96)')
    expect(darkText).toBe('rgb(241,243,247)')
    expect(darkSurface).toBe('rgba(29,31,38,.96)')
  })

  it('provides minimal ST drawer behavior for extension settings templates', () => {
    ensureStCompatDomAnchors()

    document.getElementById('extensions_settings')?.insertAdjacentHTML('beforeend', `
      <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
          <b>Plugin</b>
          <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">Settings</div>
      </div>
    `)

    const drawer = document.querySelector<HTMLElement>('.inline-drawer')
    const toggle = document.querySelector<HTMLElement>('.inline-drawer-toggle')
    const content = document.querySelector<HTMLElement>('.inline-drawer-content')

    toggle?.click()

    expect(drawer?.classList.contains('closedDrawer')).toBe(true)
    expect(content?.getAttribute('aria-hidden')).toBe('true')

    toggle?.click()

    expect(drawer?.classList.contains('closedDrawer')).toBe(false)
    expect(content?.getAttribute('aria-hidden')).toBe('false')
  })

  it('keeps teleported ST plugin dialog controls clickable', () => {
    ensureStCompatDomAnchors()

    document.body.insertAdjacentHTML('beforeend', `
      <div class="dialog-teleported">
        <div role="dialog">
          <div>
            <div>Plugin dialog</div>
            <div>
              <div class="fa-solid fa-close relative z-20 flex cursor-pointer"></div>
            </div>
          </div>
        </div>
      </div>
    `)

    const close = document.querySelector('.dialog-teleported .fa-close')
    const closeStyle = getComputedStyle(close as Element)

    expect(closeStyle.width).toBe('28px')
    expect(closeStyle.height).toBe('28px')
    expect(closeStyle.cursor).toBe('pointer')
  })
})

function normaliseCssToken(value: string): string {
  return value.trim().replace(/\s+/g, '')
}
