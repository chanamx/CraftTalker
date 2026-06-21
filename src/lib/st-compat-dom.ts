import type { ChatLine } from '@/lib/api'

export interface StCompatDomState {
  chat: ChatLine[]
  selectedWorldInfo: string[]
  worldNames: string[]
}

let compatPanelObserver: MutationObserver | null = null
let observedCompatPanel: HTMLElement | null = null

export function ensureStCompatDomAnchors(): void {
  if (!document.body) return
  installCompatDomStyle()

  const root = ensureCompatRoot()
  root.classList.add('crafttalker-st-compat-root')
  if (document.body.firstElementChild !== root) {
    document.body.prepend(root)
  }

  const settingsPanel = ensureElement('section', 'crafttalker-st-compat-settings-panel', root)
  settingsPanel.classList.add('crafttalker-st-compat-settings-panel')
  settingsPanel.setAttribute('aria-label', 'SillyTavern extension compatibility panels')
  ensureElement('div', 'extensions_settings', settingsPanel)
  ensureElement('div', 'extensions_settings2', settingsPanel)
  observeCompatSettingsPanel(settingsPanel)

  const mirror = ensureElement('div', 'crafttalker-st-compat-mirror', root)
  mirror.classList.add('crafttalker-st-compat-mirror')
  mirror.setAttribute('aria-hidden', 'true')

  const worldControls = ensureElement('div', 'world_info_block', mirror)
  ensureSelect('world_info', worldControls, true)
  ensureSelect('world_editor_select', worldControls, false)
  ensureInput('world_info_depth', worldControls, 'number', '4')
  ensureInput('world_info_budget', worldControls, 'number', '25')
  ensureInput('world_info_budget_cap', worldControls, 'number', '0')
  ensureInput('world_info_min_activations', worldControls, 'number', '0')
  ensureInput('world_info_min_activations_depth_max', worldControls, 'number', '0')
  ensureInput('world_info_max_recursion_steps', worldControls, 'number', '10')
  ensureSelect('world_info_character_strategy', worldControls, false)
  ensureInput('world_info_include_names', worldControls, 'checkbox', 'true')
  ensureInput('world_info_recursive', worldControls, 'checkbox', 'false')
  ensureInput('world_info_case_sensitive', worldControls, 'checkbox', 'false')
  ensureInput('world_info_match_whole_words', worldControls, 'checkbox', 'false')
  ensureInput('world_info_use_group_scoring', worldControls, 'checkbox', 'false')
  ensureInput('world_info_overflow_alert', worldControls, 'checkbox', 'false')

  const sendForm = ensureElement('form', 'send_form', mirror)
  sendForm.classList.add('send_form')
  ensureElement('div', 'form_sheld', sendForm)
  ensureElement('div', 'qr--bar', sendForm).classList.add('qr--bar')
  const qrButtons = ensureElement('div', 'crafttalker-st-qr-buttons', sendForm)
  qrButtons.classList.add('qr--buttons')
  ensureTextarea('send_textarea', sendForm)
  ensureElement('button', 'send_but', sendForm).setAttribute('type', 'button')

  const chatRoot = ensureElement('div', 'chat', mirror)
  chatRoot.classList.add('chat')
  ensureElement('div', 'show_more_messages', chatRoot)
}

export function syncStCompatDomState(state: StCompatDomState): void {
  syncWorldSelects(state)
  syncChatMirror(state)
}

export function syncStCompatWorldSelects(state: Pick<StCompatDomState, 'selectedWorldInfo' | 'worldNames'>): void {
  const root = getCompatRoot()
  const worldSelect = getCompatElement<HTMLSelectElement>(root, 'world_info')
  const editorSelect = getCompatElement<HTMLSelectElement>(root, 'world_editor_select')
  if (worldSelect) fillWorldSelect(worldSelect, true, state)
  if (editorSelect) fillWorldSelect(editorSelect, false, state)
}

function installCompatDomStyle(): void {
  if (document.getElementById('crafttalker-st-compat-style')) return
  const style = document.createElement('style')
  style.id = 'crafttalker-st-compat-style'
  style.textContent = `
    .crafttalker-st-compat-root { position: relative; z-index: 30; }
    .crafttalker-st-compat-settings-panel {
      display: none;
      width: min(960px, calc(100vw - 32px));
      max-height: min(70vh, 720px);
      overflow: auto;
      margin: 12px auto;
      padding: 12px;
      border: 1px solid color-mix(in srgb, CanvasText 16%, transparent);
      border-radius: 8px;
      background: Canvas;
      color: CanvasText;
      box-shadow: 0 18px 50px rgba(0, 0, 0, .18);
    }
    .crafttalker-st-compat-settings-panel[data-has-content="true"] { display: block; }
    .crafttalker-st-compat-mirror {
      position: fixed;
      left: -10000px;
      top: 0;
      width: 1px;
      height: 1px;
      overflow: hidden;
      pointer-events: none;
    }
  `
  document.head.appendChild(style)
}

function observeCompatSettingsPanel(panel: HTMLElement): void {
  if (compatPanelObserver && observedCompatPanel === panel) return
  compatPanelObserver?.disconnect()
  observedCompatPanel = panel
  const refresh = () => {
    const hasContent = Boolean(panel.querySelector('#extensions_settings > :not(script):not(style), #extensions_settings2 > :not(script):not(style)'))
    panel.dataset.hasContent = String(hasContent)
  }
  compatPanelObserver = new MutationObserver(refresh)
  compatPanelObserver.observe(panel, { childList: true, subtree: true })
  refresh()
}

function syncWorldSelects(state: StCompatDomState): void {
  syncStCompatWorldSelects(state)
}

function fillWorldSelect(
  select: HTMLSelectElement,
  multi: boolean,
  state: Pick<StCompatDomState, 'selectedWorldInfo' | 'worldNames'>,
): void {
  const current = new Set(Array.from(select.selectedOptions).map(option => option.value))
  select.multiple = multi
  select.textContent = ''
  const empty = document.createElement('option')
  empty.value = ''
  empty.textContent = ''
  select.appendChild(empty)
  for (const [index, name] of state.worldNames.entries()) {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = name
    option.selected = state.selectedWorldInfo.includes(name) || current.has(String(index))
    select.appendChild(option)
  }
}

function syncChatMirror(state: StCompatDomState): void {
  const root = getCompatRoot()
  const chatRoot = getCompatElement<HTMLElement>(root, 'chat')
  if (!chatRoot) return
  const showMore = getCompatElement<HTMLElement>(chatRoot, 'show_more_messages') ?? document.createElement('div')
  showMore.id = 'show_more_messages'
  showMore.dataset.stCompatAnchor = 'show_more_messages'
  chatRoot.textContent = ''
  chatRoot.appendChild(showMore)
  state.chat.forEach((line, index) => {
    if (!('mes' in line)) return
    chatRoot.appendChild(createCompatMessageElement(line, index, state.chat.length))
  })
}

function createCompatMessageElement(line: ChatLine, index: number, totalLines: number): HTMLElement {
  const message = document.createElement('div')
  message.className = `mes ${line.is_user ? 'user_mes' : 'char_mes'}${index === totalLines - 1 ? ' last_mes' : ''}`
  message.setAttribute('mesid', String(index))
  message.setAttribute('ch_name', String(line.name ?? ''))

  const block = document.createElement('div')
  block.className = 'mes_block'
  const name = document.createElement('div')
  name.className = 'ch_name'
  const nameText = document.createElement('span')
  nameText.className = 'name_text'
  nameText.textContent = String(line.name ?? '')
  name.appendChild(nameText)
  const buttons = document.createElement('div')
  buttons.className = 'mes_buttons'
  const text = document.createElement('div')
  text.className = 'mes_text'
  text.textContent = String(line.mes ?? '')

  block.append(name, buttons, text)
  message.appendChild(block)
  return message
}

function ensureElement<K extends keyof HTMLElementTagNameMap>(tag: K, id: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const existing = getCompatElement<HTMLElementTagNameMap[K]>(parent, id)
  if (existing) return existing
  const element = document.createElement(tag)
  element.id = id
  element.dataset.stCompatAnchor = id
  parent.appendChild(element)
  return element
}

function getCompatRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-st-compat-anchor="crafttalker-st-compat-root"]')
}

function ensureCompatRoot(): HTMLElement {
  const existing = getCompatRoot()
  if (existing) return existing
  const root = document.createElement('div')
  root.id = 'crafttalker-st-compat-root'
  root.dataset.stCompatAnchor = 'crafttalker-st-compat-root'
  document.body.appendChild(root)
  return root
}

function getCompatElement<T extends HTMLElement>(parent: ParentNode | null, id: string): T | null {
  return parent?.querySelector<T>(`[data-st-compat-anchor="${CSS.escape(id)}"]`) ?? null
}

function ensureSelect(id: string, parent: HTMLElement, multiple: boolean): HTMLSelectElement {
  const select = ensureElement('select', id, parent)
  select.multiple = multiple
  return select
}

function ensureInput(id: string, parent: HTMLElement, type: string, value: string): HTMLInputElement {
  const input = ensureElement('input', id, parent)
  input.type = type
  if (type === 'checkbox') {
    input.checked = value === 'true'
  } else if (!input.value) {
    input.value = value
  }
  return input
}

function ensureTextarea(id: string, parent: HTMLElement): HTMLTextAreaElement {
  return ensureElement('textarea', id, parent)
}
