export const POPUP_TYPE = {
  TEXT: 1,
  CONFIRM: 2,
  INPUT: 3,
  DISPLAY: 4,
  CROP: 5,
}

export const POPUP_RESULT = {
  AFFIRMATIVE: 1,
  NEGATIVE: 0,
  CANCELLED: null,
  CUSTOM1: 1001,
  CUSTOM2: 1002,
  CUSTOM3: 1003,
  CUSTOM4: 1004,
  CUSTOM5: 1005,
  CUSTOM6: 1006,
  CUSTOM7: 1007,
  CUSTOM8: 1008,
  CUSTOM9: 1009,
}

const POPUP_STYLE_ID = 'crafttalker-st-popup-style'

const showPopupHelper = {
  async input(header, text, defaultValue = '', popupOptions = {}) {
    const content = PopupUtils.BuildTextWithHeader(header, text)
    const popup = new Popup(content, POPUP_TYPE.INPUT, defaultValue, popupOptions)
    const value = await popup.show()
    if (value === '') return ''
    return value ? String(value) : null
  },

  async confirm(header, text, popupOptions = {}) {
    const content = PopupUtils.BuildTextWithHeader(header, text)
    const popup = new Popup(content, POPUP_TYPE.CONFIRM, null, popupOptions)
    const result = await popup.show()
    if (typeof result === 'string' || typeof result === 'boolean') {
      throw new Error(`Invalid popup result. CONFIRM popups only support numbers, or null. Result: ${result}`)
    }
    return result
  },

  async text(header, text, popupOptions = {}) {
    const content = PopupUtils.BuildTextWithHeader(header, text)
    const popup = new Popup(content, POPUP_TYPE.TEXT, null, popupOptions)
    const result = await popup.show()
    if (typeof result === 'string' || typeof result === 'boolean') {
      throw new Error(`Invalid popup result. TEXT popups only support numbers, or null. Result: ${result}`)
    }
    return result
  },
}

export class Popup {
  static show = showPopupHelper

  static util = {
    popups: [],
    lastResult: null,
    isPopupOpen() {
      return Popup.util.popups.some(popup => popup.isOpen)
    },
    getTopmostModalLayer() {
      return getTopmostModalLayer()
    },
  }

  constructor(content = '', type = POPUP_TYPE.TEXT, inputValue = '', popupOptions = {}) {
    this.contentSource = content
    this.type = normalisePopupType(type)
    this.inputValue = inputValue
    this.options = popupOptions ?? {}
    this.defaultResult = popupOptions?.defaultResult ?? POPUP_RESULT.AFFIRMATIVE
    this.customButtons = popupOptions?.customButtons ?? null
    this.customInputs = Array.isArray(popupOptions?.customInputs) ? popupOptions.customInputs : []
    this.result = undefined
    this.value = undefined
    this.inputResults = undefined
    this.root = null
    this.dlg = null
    this.body = null
    this.content = null
    this.input = null
    this.mainInput = null
    this.inputControls = null
    this.buttonControls = null
    this.okButton = null
    this.cancelButton = null
    this.closeButton = null
    this.isOpen = false
    this.closePromise = null
    this.resolve = null
  }

  async show() {
    if (!globalThis.document?.body) {
      return fallbackBlockingPopup(this.contentSource, this.type, this.inputValue)
    }

    installPopupStyle()
    this.mount()
    Popup.util.popups.push(this)
    this.isOpen = true
    this.closePromise = new Promise(resolve => {
      this.resolve = resolve
    })

    await Promise.resolve()
    await safelyCall(this.options.onOpen, this)
    focusInitialControl(this)

    return await this.closePromise
  }

  mount() {
    const root = document.createElement('div')
    root.className = 'crafttalker-st-popup-root'
    root.dataset.open = 'true'

    const overlay = document.createElement('div')
    overlay.className = 'crafttalker-st-popup-overlay'
    root.appendChild(overlay)

    const dialog = document.createElement('section')
    dialog.className = buildDialogClass(this.options)
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('tabindex', '-1')
    root.appendChild(dialog)

    const close = document.createElement('button')
    close.className = 'crafttalker-st-popup-close'
    close.type = 'button'
    close.setAttribute('aria-label', 'Close popup')
    close.innerHTML = '<span aria-hidden="true"></span>'
    close.addEventListener('click', () => this.completeCancelled())
    dialog.appendChild(close)

    const body = document.createElement('div')
    body.className = 'crafttalker-st-popup-body'
    if (this.options.tooltip) body.title = String(this.options.tooltip)
    const content = document.createElement('div')
    content.className = 'crafttalker-st-popup-content'
    appendPopupContent(content, this.contentSource)
    body.appendChild(content)
    dialog.appendChild(body)
    applyDialogOptions(dialog, this.options, content)

    if (this.type === POPUP_TYPE.INPUT) {
      this.input = createInput(this.inputValue, this.options)
      this.input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          this.complete(this.defaultResult)
        }
      })
      dialog.appendChild(this.input)
    }

    const inputControls = createCustomInputs(this.customInputs)
    if (inputControls.childElementCount) dialog.appendChild(inputControls)

    const buttons = createButtonRow(this)
    if (buttons.childElementCount) dialog.appendChild(buttons)

    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.options.allowEscapeClose !== false) {
        event.preventDefault()
        this.completeCancelled()
      }
      if (event.key === 'Enter' && !event.altKey && !event.shiftKey && this.type !== POPUP_TYPE.INPUT) {
        const target = event.target
        if (target instanceof HTMLTextAreaElement && !event.ctrlKey) return
        event.preventDefault()
        this.complete(this.defaultResult)
      }
    })

    this.root = root
    this.dlg = dialog
    this.body = body
    this.content = content
    this.mainInput = this.input
    this.inputControls = inputControls
    this.closeButton = close
    document.body.appendChild(root)
  }

  async close(result = POPUP_RESULT.CANCELLED) {
    return await this.complete(result)
  }

  async complete(result = POPUP_RESULT.CANCELLED) {
    if (!this.isOpen) return

    const value = resolvePopupValue(this, result)
    const inputResults = collectCustomInputResults(this)
    this.value = value
    this.result = result
    this.inputResults = inputResults

    const shouldClose = await safelyCall(this.options.onClosing, this)
    if (shouldClose === false) {
      this.value = undefined
      this.result = undefined
      this.inputResults = undefined
      return undefined
    }

    Popup.util.lastResult = { value, result, inputResults }
    this.isOpen = false
    await safelyCall(this.options.onClose, this)
    this.root?.remove()
    removeFromArray(Popup.util.popups, this)
    this.resolve?.(this.value)
    return await this.closePromise
  }

  async completeAffirmative() {
    return await this.complete(POPUP_RESULT.AFFIRMATIVE)
  }

  async completeNegative() {
    return await this.complete(POPUP_RESULT.NEGATIVE)
  }

  async completeCancelled() {
    return await this.complete(POPUP_RESULT.CANCELLED)
  }
}

export class PopupUtils {
  static BuildTextWithHeader(header, text) {
    if (!header) return text
    return `<h3>${header}</h3>${text ?? ''}`
  }
}

export function callGenericPopup(content, type = POPUP_TYPE.TEXT, inputValue = '', popupOptions = {}) {
  return new Popup(content, type, inputValue, popupOptions).show()
}

export function callPopup(content, type = POPUP_TYPE.TEXT, inputValue = '', popupOptions = {}) {
  return callGenericPopup(content, type, inputValue, popupOptions)
}

export function getTopmostModalLayer() {
  const popup = Array.from(document.querySelectorAll('.crafttalker-st-popup-root[data-open="true"] .crafttalker-st-popup-dialog')).pop()
  if (popup instanceof HTMLElement) return popup

  const nativeDialog = Array.from(document.querySelectorAll('dialog[open]:not([closing])')).pop()
  if (nativeDialog instanceof HTMLElement) return nativeDialog

  return document.body
}

export function fixToastrForDialogs() {
  const toast = document.getElementById('toast-container')
  const layer = getTopmostModalLayer()
  if (toast && layer && layer !== document.body && !layer.contains(toast)) {
    layer.appendChild(toast)
  }
}

function normalisePopupType(type) {
  if (typeof type === 'number') return type
  const text = String(type ?? '').toLowerCase()
  if (text === 'confirm') return POPUP_TYPE.CONFIRM
  if (text === 'input') return POPUP_TYPE.INPUT
  if (text === 'display') return POPUP_TYPE.DISPLAY
  if (text === 'crop') return POPUP_TYPE.CROP
  return POPUP_TYPE.TEXT
}

function fallbackBlockingPopup(content, type, inputValue) {
  if (type === POPUP_TYPE.CONFIRM) {
    return globalThis.confirm?.(String(content ?? '')) ? POPUP_RESULT.AFFIRMATIVE : POPUP_RESULT.NEGATIVE
  }
  if (type === POPUP_TYPE.INPUT) {
    return globalThis.prompt?.(String(content ?? ''), String(inputValue ?? '')) ?? POPUP_RESULT.CANCELLED
  }
  globalThis.alert?.(String(content ?? ''))
  return POPUP_RESULT.AFFIRMATIVE
}

function installPopupStyle() {
  if (document.getElementById(POPUP_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = POPUP_STYLE_ID
  style.textContent = `
    .crafttalker-st-popup-root {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 18px;
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      font-family: var(--font-sans, system-ui, sans-serif);
      font-size: var(--mainFontSize, 14px);
    }
    .crafttalker-st-popup-overlay {
      position: fixed;
      inset: 0;
      background: rgba(4, 7, 13, .48);
      backdrop-filter: blur(7px);
    }
    .crafttalker-st-popup-dialog {
      position: relative;
      display: flex;
      width: min(520px, calc(100vw - 28px));
      max-height: min(82vh, 760px);
      flex-direction: column;
      gap: 12px;
      overflow: hidden;
      border: 1px solid var(--SmartThemeBorderColor, rgba(42, 54, 75, .2));
      border-radius: 8px;
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--SmartThemeQuoteColor, rgb(57, 92, 179)) 6%, transparent), transparent 180px),
        var(--SmartThemeBlurTintColor, rgba(238, 242, 248, .96));
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      box-shadow: 0 24px 80px var(--SmartThemeShadowColor, rgba(15, 23, 42, .28));
      padding: 16px;
    }
    .crafttalker-st-popup-dialog[data-size="wide"] { width: min(760px, calc(100vw - 28px)); }
    .crafttalker-st-popup-dialog[data-size="wider"] { width: min(920px, calc(100vw - 28px)); }
    .crafttalker-st-popup-dialog[data-size="large"] {
      width: min(1080px, calc(100vw - 28px));
      height: min(86vh, 820px);
    }
    .crafttalker-st-popup-dialog[data-size="large"] .crafttalker-st-popup-body {
      display: flex;
      min-height: 0;
      flex: 1 1 auto;
      flex-direction: column;
    }
    .crafttalker-st-popup-dialog[data-size="large"] .crafttalker-st-popup-body > * {
      min-height: 0;
    }
    .crafttalker-st-popup-dialog[data-transparent="true"] {
      border-color: transparent;
      background: transparent;
      box-shadow: none;
    }
    .crafttalker-st-popup-close {
      position: absolute;
      right: 8px;
      top: 8px;
      display: grid;
      width: 30px;
      height: 30px;
      place-items: center;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--SmartThemeEmColor, rgb(93, 98, 110));
      cursor: pointer;
    }
    .crafttalker-st-popup-close:hover {
      background: color-mix(in srgb, var(--SmartThemeBodyColor, currentColor) 10%, transparent);
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
    }
    .crafttalker-st-popup-close span,
    .crafttalker-st-popup-close span::after {
      display: block;
      width: 13px;
      height: 2px;
      border-radius: 999px;
      background: currentColor;
      content: '';
      transform: rotate(45deg);
    }
    .crafttalker-st-popup-close span::after { transform: rotate(90deg); }
    .crafttalker-st-popup-body {
      min-height: 0;
      overflow: auto;
      padding: 22px 2px 0;
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      line-height: 1.5;
      text-align: center;
    }
    .crafttalker-st-popup-content {
      min-height: 0;
    }
    .crafttalker-st-popup-dialog[data-left-align="true"] .crafttalker-st-popup-body { text-align: left; }
    .crafttalker-st-popup-dialog[data-scroll-x="true"] .crafttalker-st-popup-body { overflow-x: auto; }
    .crafttalker-st-popup-dialog[data-scroll-y="true"] .crafttalker-st-popup-body { overflow-y: auto; }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .crafttalker-st-popup-content {
      display: flex;
      min-height: 0;
      flex-direction: column;
      gap: 10px;
      text-align: left;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .crafttalker-st-popup-content > * {
      min-width: 0;
      max-width: 100%;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] h1,
    .crafttalker-st-popup-dialog[data-form-layout="true"] h2,
    .crafttalker-st-popup-dialog[data-form-layout="true"] h3 {
      margin: 0;
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      font-size: 15px;
      line-height: 1.25;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] hr,
    .crafttalker-st-popup-dialog[data-form-layout="true"] .sysHR {
      width: 100%;
      height: 1px;
      border: 0;
      margin: 8px 0;
      background: var(--SmartThemeBorderColor, rgba(42, 54, 75, .2));
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .flex-container {
      display: flex;
      min-width: 0;
      gap: 8px;
      flex-wrap: wrap;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .flexFlowColumn {
      flex-direction: column;
      align-items: stretch;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .flexnowrap {
      flex-wrap: nowrap;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .justifyCenter {
      justify-content: center;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .justifySpaceBetween {
      justify-content: space-between;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .alignItemsCenter,
    .crafttalker-st-popup-dialog[data-form-layout="true"] .alignitemscenter {
      align-items: center;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .alignItemsBaseline {
      align-items: baseline;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .flex1 {
      flex: 1 1 0;
      min-width: 180px;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .wide100p {
      width: 100%;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] label {
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] small {
      color: var(--SmartThemeEmColor, rgb(93, 98, 110));
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] .checkbox_label,
    .crafttalker-st-popup-dialog[data-form-layout="true"] label.checkbox {
      display: inline-flex;
      min-width: 0;
      align-items: center;
      gap: 7px;
      line-height: 1.35;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] input[type="text"],
    .crafttalker-st-popup-dialog[data-form-layout="true"] input[type="number"],
    .crafttalker-st-popup-dialog[data-form-layout="true"] select,
    .crafttalker-st-popup-dialog[data-form-layout="true"] textarea,
    .crafttalker-st-popup-dialog[data-form-layout="true"] .text_pole {
      max-width: 100%;
      min-height: 32px;
      border: 1px solid var(--SmartThemeBorderColor, rgba(42, 54, 75, .2));
      border-radius: 7px;
      background: var(--SmartThemeInputColor, rgb(225, 232, 242));
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      padding: 6px 8px;
      outline: none;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] input[type="text"],
    .crafttalker-st-popup-dialog[data-form-layout="true"] textarea,
    .crafttalker-st-popup-dialog[data-form-layout="true"] .text_pole.wide100p {
      width: 100%;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] textarea {
      min-height: 140px;
      resize: vertical;
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] #fixed_text_template,
    .crafttalker-st-popup-dialog[data-form-layout="true"] .task_commands_edit {
      min-height: clamp(190px, 34vh, 360px);
    }
    .crafttalker-st-popup-dialog[data-form-layout="true"] input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--SmartThemeQuoteColor, rgb(57, 92, 179));
    }
    .crafttalker-st-popup-input {
      min-height: 34px;
      border: 1px solid var(--SmartThemeBorderColor, rgba(42, 54, 75, .2));
      border-radius: 7px;
      background: var(--SmartThemeInputColor, rgb(225, 232, 242));
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      padding: 7px 9px;
      outline: none;
    }
    textarea.crafttalker-st-popup-input {
      min-height: 92px;
      resize: vertical;
    }
    .crafttalker-st-popup-inputs {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }
    .crafttalker-st-popup-inputs:empty {
      display: none;
    }
    .crafttalker-st-popup-input-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
    }
    .crafttalker-st-popup-input-row[data-kind="textarea"] {
      align-items: stretch;
      flex-direction: column;
    }
    .crafttalker-st-popup-input-row input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--SmartThemeQuoteColor, rgb(57, 92, 179));
    }
    .crafttalker-st-popup-input-row input[type="text"],
    .crafttalker-st-popup-input-row input[type="number"],
    .crafttalker-st-popup-input-row textarea {
      min-height: 32px;
      min-width: 0;
      flex: 1 1 180px;
      border: 1px solid var(--SmartThemeBorderColor, rgba(42, 54, 75, .2));
      border-radius: 7px;
      background: var(--SmartThemeInputColor, rgb(225, 232, 242));
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      padding: 6px 8px;
      outline: none;
    }
    .crafttalker-st-popup-input-row textarea {
      resize: vertical;
    }
    .crafttalker-st-popup-input-label {
      min-width: 0;
      font-size: 13px;
      line-height: 1.25;
    }
    .crafttalker-st-popup-buttons {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 4px;
    }
    .crafttalker-st-popup-button {
      display: inline-flex;
      min-height: 32px;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid var(--SmartThemeBorderColor, rgba(42, 54, 75, .2));
      border-radius: 7px;
      padding: 6px 12px;
      background: var(--SmartThemeChatTintColor, rgba(230, 236, 246, .94));
      color: var(--SmartThemeBodyColor, rgb(28, 30, 34));
      cursor: pointer;
      line-height: 1.2;
    }
    .crafttalker-st-popup-button:hover {
      border-color: color-mix(in srgb, var(--SmartThemeQuoteColor, rgb(57, 92, 179)) 45%, var(--SmartThemeBorderColor, rgba(42, 54, 75, .2)));
      background: color-mix(in srgb, var(--SmartThemeQuoteColor, rgb(57, 92, 179)) 12%, var(--SmartThemeChatTintColor, rgba(230, 236, 246, .94)));
    }
    .crafttalker-st-popup-button[data-primary="true"] {
      border-color: color-mix(in srgb, var(--SmartThemeQuoteColor, rgb(57, 92, 179)) 68%, var(--SmartThemeBorderColor, rgba(42, 54, 75, .2)));
      color: var(--SmartThemeQuoteColor, rgb(57, 92, 179));
      font-weight: 700;
    }
  `
  document.head.appendChild(style)
}

function buildDialogClass(options) {
  const classes = ['crafttalker-st-popup-dialog']
  return classes.join(' ')
}

function appendPopupContent(parent, content) {
  if (content instanceof Node) {
    parent.appendChild(content)
    return
  }

  if (content?.jquery && typeof content.length === 'number') {
    for (const element of Array.from(content)) {
      if (element instanceof Node) parent.appendChild(element)
    }
    return
  }

  if (Array.isArray(content)) {
    for (const item of content) appendPopupContent(parent, item)
    return
  }

  parent.innerHTML = String(content ?? '')
}

function createInput(inputValue, options) {
  const rows = Number(options.rows ?? 1)
  const input = rows > 1 ? document.createElement('textarea') : document.createElement('input')
  input.className = 'crafttalker-st-popup-input'
  input.value = String(inputValue ?? '')
  if (options.placeholder) input.placeholder = String(options.placeholder)
  if (rows > 1 && input instanceof HTMLTextAreaElement) input.rows = rows
  return input
}

function createCustomInputs(inputs) {
  const controls = document.createElement('div')
  controls.className = 'crafttalker-st-popup-inputs'

  for (const input of inputs) {
    if (!input?.id || typeof input.id !== 'string') {
      console.warn('[CraftTalker ST compat] popup custom input requires a string id', input)
      continue
    }

    const kind = normaliseCustomInputType(input.type)
    const label = document.createElement('label')
    label.className = 'crafttalker-st-popup-input-row'
    label.dataset.kind = kind
    label.setAttribute('for', input.id)
    if (input.tooltip) label.title = String(input.tooltip)

    const labelText = document.createElement('span')
    labelText.className = 'crafttalker-st-popup-input-label'
    labelText.textContent = String(input.label ?? input.id)

    const control = createCustomInputControl(input, kind)
    if (input.autoFocus) {
      control.autofocus = true
      control.tabIndex = 0
    }

    if (kind === 'checkbox') {
      label.append(control, labelText)
    } else {
      label.append(labelText, control)
    }
    controls.appendChild(label)
  }

  return controls
}

function createCustomInputControl(input, kind) {
  const control = kind === 'textarea' ? document.createElement('textarea') : document.createElement('input')
  control.id = input.id
  control.className = 'crafttalker-st-popup-custom-input'
  control.disabled = Boolean(input.disabled)
  if (input.tooltip && kind !== 'checkbox') control.placeholder = String(input.tooltip)

  if (kind === 'checkbox') {
    control.type = 'checkbox'
    control.checked = Boolean(input.defaultState ?? false)
    return control
  }

  if (kind === 'textarea') {
    control.rows = Number(input.rows ?? 1)
  } else {
    control.type = kind
  }
  control.value = String(input.defaultState ?? '')

  if (kind === 'number') {
    if (input.min !== undefined) control.min = String(input.min)
    if (input.max !== undefined) control.max = String(input.max)
    if (input.step !== undefined) control.step = String(input.step)
    control.addEventListener('change', () => clampNumberInput(control, input))
  }

  return control
}

function normaliseCustomInputType(type) {
  if (type === 'text' || type === 'textarea' || type === 'number') return type
  return 'checkbox'
}

function clampNumberInput(control, input) {
  const value = parseFloat(control.value)
  if (Number.isNaN(value)) return
  const min = Number.isFinite(input.min) ? Number(input.min) : -Infinity
  const max = Number.isFinite(input.max) ? Number(input.max) : Infinity
  const clamped = Math.min(max, Math.max(min, value))
  if (clamped !== value) control.value = String(clamped)
}

function createButtonRow(popup) {
  const row = document.createElement('div')
  row.className = 'crafttalker-st-popup-buttons'

  const customButtons = normaliseCustomButtons(popup.customButtons)
  const leadingCustomButtons = customButtons.filter(button => !button.appendAtEnd)
  const trailingCustomButtons = customButtons.filter(button => button.appendAtEnd)

  for (const button of leadingCustomButtons) {
    row.appendChild(createButton(button.text, button.result, popup, {
      title: button.tooltip,
      classes: button.classes,
      icon: button.icon,
      action: button.action,
    }))
  }

  if (shouldShowCancel(popup)) {
    popup.cancelButton = createButton(getCancelText(popup), POPUP_RESULT.NEGATIVE, popup)
    row.appendChild(popup.cancelButton)
  }
  if (shouldShowOk(popup)) {
    popup.okButton = createButton(getOkText(popup), POPUP_RESULT.AFFIRMATIVE, popup, { primary: true })
    row.appendChild(popup.okButton)
  }

  for (const button of trailingCustomButtons) {
    row.appendChild(createButton(button.text, button.result, popup, {
      title: button.tooltip,
      classes: button.classes,
      icon: button.icon,
      action: button.action,
    }))
  }

  popup.buttonControls = row
  return row
}

function normaliseCustomButtons(buttons) {
  if (!Array.isArray(buttons)) return []
  return buttons.map((button, index) => {
    if (typeof button === 'string') {
      return { text: button, result: index + 2 }
    }
    return {
      text: String(button?.text ?? `Action ${index + 1}`),
      result: button?.result,
      tooltip: button?.tooltip,
      classes: button?.classes,
      icon: button?.icon,
      action: button?.action,
      appendAtEnd: Boolean(button?.appendAtEnd),
    }
  })
}

function createButton(text, result, popup, options = {}) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = ['crafttalker-st-popup-button', normaliseClasses(options.classes)].filter(Boolean).join(' ')
  button.textContent = String(text)
  if (options.title) button.title = String(options.title)
  if (options.primary) button.dataset.primary = 'true'
  if (result !== undefined) button.dataset.result = String(result)
  if (options.icon) {
    const icon = document.createElement('span')
    icon.className = String(options.icon)
    icon.setAttribute('aria-hidden', 'true')
    button.prepend(icon)
  }
  button.addEventListener('click', async () => {
    await safelyCall(options.action)
    if (result !== undefined) popup.complete(result)
  })
  return button
}

function shouldShowOk(popup) {
  const option = popup.options.okButton
  if (option === true || typeof option === 'string') return true
  if (option === false) return false
  return popup.type !== POPUP_TYPE.DISPLAY && popup.type !== POPUP_TYPE.CROP
}

function shouldShowCancel(popup) {
  const option = popup.options.cancelButton
  if (option === true || typeof option === 'string') return true
  if (option === false) return false
  return popup.type === POPUP_TYPE.CONFIRM || popup.type === POPUP_TYPE.INPUT
}

function getOkText(popup) {
  if (typeof popup.options.okButton === 'string') return popup.options.okButton
  return popup.type === POPUP_TYPE.CONFIRM ? 'Yes' : 'OK'
}

function getCancelText(popup) {
  if (typeof popup.options.cancelButton === 'string') return popup.options.cancelButton
  return popup.type === POPUP_TYPE.CONFIRM ? 'No' : 'Cancel'
}

function resolvePopupValue(popup, result) {
  if (popup.type !== POPUP_TYPE.INPUT) return result
  if (Number(result) >= POPUP_RESULT.AFFIRMATIVE) return popup.mainInput?.value ?? ''
  if (result === POPUP_RESULT.NEGATIVE) return false
  if (result === POPUP_RESULT.CANCELLED) return null
  return false
}

function collectCustomInputResults(popup) {
  if (!popup.customInputs?.length || !popup.inputControls) return undefined
  const results = new Map()
  for (const input of popup.customInputs) {
    if (!input?.id) continue
    const control = popup.inputControls.querySelector(`#${escapeCss(input.id)}`)
    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      results.set(control.id, control.checked)
    } else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
      results.set(control.id, control.value)
    }
  }
  return results
}

function focusInitialControl(popup) {
  const target = popup.dlg?.querySelector('[autofocus]')
    ?? popup.mainInput
    ?? popup.dlg?.querySelector(`[data-result="${popup.defaultResult}"]`)
    ?? popup.dlg?.querySelector('[data-primary="true"]')
    ?? popup.dlg
  target?.focus?.()
}

async function safelyCall(fn, ...args) {
  if (typeof fn !== 'function') return undefined
  try {
    return await fn(...args)
  } catch (error) {
    console.warn('[CraftTalker ST compat] popup callback failed', error)
    return undefined
  }
}

function normaliseClasses(classes) {
  if (Array.isArray(classes)) return classes.join(' ')
  return classes ? String(classes) : ''
}

function removeFromArray(array, item) {
  const index = array.indexOf(item)
  if (index >= 0) array.splice(index, 1)
}

function escapeCss(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value))
  return String(value).replaceAll('"', '\\"').replaceAll('\\', '\\\\')
}

function applyDialogOptions(dialog, options, content) {
  const size = resolveDialogSize(options, content)
  const formLayout = shouldUseFormLayout(content)
  dialog.dataset.size = size
  dialog.dataset.transparent = String(Boolean(options.transparent))
  dialog.dataset.leftAlign = String(Boolean(options.leftAlign) || (options.leftAlign === undefined && formLayout))
  dialog.dataset.formLayout = String(formLayout)
  dialog.dataset.scrollX = String(Boolean(options.allowHorizontalScrolling))
  dialog.dataset.scrollY = String(Boolean(options.allowVerticalScrolling))
}

function resolveDialogSize(options, content) {
  if (typeof options.size === 'string' && ['normal', 'wide', 'wider', 'large'].includes(options.size)) return options.size
  if (options.large) return 'large'
  if (options.wider) return 'wider'
  if (options.wide) return 'wide'
  if (shouldUseLargeLayout(content)) return 'large'
  if (shouldUseWiderLayout(content)) return 'wider'
  if (shouldUseWideLayout(content)) return 'wide'
  return 'normal'
}

function shouldUseFormLayout(content) {
  if (!(content instanceof Element)) return false
  return Boolean(content.querySelector([
    'form',
    'input',
    'select',
    'textarea',
    '.text_pole',
    '.flex-container',
    '.inline-drawer',
    '#editor-container',
    '.monaco-editor',
  ].join(',')))
}

function shouldUseLargeLayout(content) {
  if (!(content instanceof Element)) return false
  return Boolean(content.querySelector('#editor-container, .monaco-editor, [data-popup-size="large"]'))
}

function shouldUseWiderLayout(content) {
  if (!(content instanceof Element)) return false
  const textareaCount = content.querySelectorAll('textarea').length
  const controlCount = content.querySelectorAll('input, select, textarea, button.menu_button').length
  return Boolean(content.querySelector([
    '[data-popup-size="wider"]',
    '#xiaobai_template_editor',
    '.xiaobai_template_editor',
    '.task_editor',
    '.wide100p',
    'textarea[style*="height:200px"]',
    'textarea[style*="min-height"]',
  ].join(','))) || textareaCount >= 1 && controlCount >= 4 || controlCount >= 8
}

function shouldUseWideLayout(content) {
  if (!(content instanceof Element)) return false
  const controlCount = content.querySelectorAll('input, select, textarea').length
  return controlCount >= 3 || Boolean(content.querySelector('[data-popup-size="wide"], table'))
}

export default {
  POPUP_TYPE,
  POPUP_RESULT,
  Popup,
  PopupUtils,
  callGenericPopup,
  callPopup,
  getTopmostModalLayer,
  fixToastrForDialogs,
}
