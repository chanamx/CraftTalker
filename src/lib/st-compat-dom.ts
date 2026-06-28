import type { ChatLine } from '@/lib/api'

export interface StCompatDomState {
  chat: ChatLine[]
  selectedWorldInfo: string[]
  worldNames: string[]
}

let compatPanelObserver: MutationObserver | null = null
let observedCompatPanel: HTMLElement | null = null

const PLUGIN_DRAWER_STORAGE_KEY = 'crafttalker-st-plugins-open'

// Host-owned ST chrome: third-party scripts keep global selectors, React stays out.
const ST_COMPAT_THEME_STYLE = `
  :root {
    --SmartThemeBodyColor: rgb(28, 30, 34);
    --SmartThemeTextColor: rgb(28, 30, 34);
    --SmartThemeText: rgb(28, 30, 34);
    --SmartThemeBGColor: rgb(241, 245, 250);
    --SmartThemeBlurTintColor: rgba(238, 242, 248, .96);
    --SmartThemeChatTintColor: rgba(230, 236, 246, .94);
    --SmartThemeUserMesBlurTintColor: rgba(221, 230, 250, .9);
    --SmartThemeBotMesBlurTintColor: rgba(230, 236, 246, .94);
    --SmartThemeInputColor: rgb(225, 232, 242);
    --SmartThemeBorderColor: rgba(42, 54, 75, .2);
    --SmartThemeQuoteColor: rgb(57, 92, 179);
    --SmartThemeEmColor: rgb(93, 98, 110);
    --SmartThemeUnderlineColor: rgb(37, 99, 235);
    --SmartThemeShadowColor: rgba(15, 23, 42, .2);
    --SmartThemeAccentColor: rgb(57, 92, 179);
    --SmartThemeAccent: rgb(57, 92, 179);
    --SmartThemeCheckboxBgColor: rgb(238, 242, 248);
    --SmartThemeBlurStrength: 10px;
    --black30a: rgba(0, 0, 0, .3);
    --black70a: rgba(0, 0, 0, .7);
    --white20a: rgba(255, 255, 255, .2);
    --grey30: rgb(115, 115, 115);
    --grey50: rgb(128, 128, 128);
    --grey5020a: rgba(128, 128, 128, .2);
    --grey5050a: rgba(128, 128, 128, .5);
    --crimson70a: rgba(190, 18, 60, .7);
    --transparent: rgba(0, 0, 0, 0);
    --mainFontSize: 14px;
    --monoFontFamily: 'JetBrains Mono', Consolas, monospace;
  }
  .dark {
    --SmartThemeBodyColor: rgb(241, 243, 247);
    --SmartThemeTextColor: rgb(241, 243, 247);
    --SmartThemeText: rgb(241, 243, 247);
    --SmartThemeBGColor: rgb(18, 19, 23);
    --SmartThemeBlurTintColor: rgba(29, 31, 38, .96);
    --SmartThemeChatTintColor: rgba(35, 38, 46, .92);
    --SmartThemeUserMesBlurTintColor: rgba(48, 58, 89, .72);
    --SmartThemeBotMesBlurTintColor: rgba(35, 38, 46, .92);
    --SmartThemeInputColor: rgb(34, 37, 44);
    --SmartThemeBorderColor: rgba(255, 255, 255, .14);
    --SmartThemeQuoteColor: rgb(139, 162, 255);
    --SmartThemeEmColor: rgb(174, 178, 189);
    --SmartThemeUnderlineColor: rgb(164, 183, 255);
    --SmartThemeShadowColor: rgba(0, 0, 0, .55);
    --SmartThemeAccentColor: rgb(139, 162, 255);
    --SmartThemeAccent: rgb(139, 162, 255);
    --SmartThemeCheckboxBgColor: rgb(34, 37, 44);
  }
`

const ST_COMPAT_DRAWER_STYLE = `
  .crafttalker-st-compat-root {
    position: fixed;
    inset: 0;
    z-index: 45;
    overflow: visible;
    pointer-events: none;
    color: var(--SmartThemeBodyColor);
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: var(--mainFontSize);
  }
  .crafttalker-st-compat-toggle {
    position: fixed;
    right: calc(var(--crafttalker-st-compat-right-offset, 0px) + 20px + env(safe-area-inset-right, 0px));
    top: 50%;
    display: inline-flex;
    width: 40px;
    min-height: 112px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 10px 6px;
    pointer-events: auto;
    z-index: 3;
    border: 1px solid var(--SmartThemeBorderColor);
    border-right: 0;
    border-radius: 8px 0 0 8px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--SmartThemeQuoteColor) 9%, transparent), transparent),
      var(--SmartThemeChatTintColor);
    color: var(--SmartThemeBodyColor);
    box-shadow: 0 10px 28px var(--SmartThemeShadowColor);
    cursor: pointer;
    transform: translateY(-50%);
    transition: transform .18s ease, opacity .18s ease, background .18s ease, border-color .18s ease;
  }
  .crafttalker-st-compat-toggle:hover {
    transform: translate(-2px, -50%);
    border-color: color-mix(in srgb, var(--SmartThemeQuoteColor) 35%, var(--SmartThemeBorderColor));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--SmartThemeQuoteColor) 14%, transparent), transparent),
      var(--SmartThemeBlurTintColor);
  }
  .crafttalker-st-compat-root[data-open="true"] .crafttalker-st-compat-toggle {
    opacity: .84;
    transform: translate(-8px, -50%);
    border-color: color-mix(in srgb, var(--SmartThemeQuoteColor) 55%, var(--SmartThemeBorderColor));
  }
  .crafttalker-st-compat-toggle-icon {
    display: grid;
    grid-template-columns: repeat(2, 6px);
    grid-template-rows: repeat(2, 6px);
    gap: 3px;
    width: 15px;
    height: 15px;
  }
  .crafttalker-st-compat-toggle-icon span {
    border-radius: 2px;
    background: currentColor;
    opacity: .82;
  }
  .crafttalker-st-compat-toggle-label {
    writing-mode: vertical-rl;
    font-size: 12px;
    font-weight: 650;
    line-height: 1;
    transform: rotate(180deg);
    white-space: nowrap;
  }
  .crafttalker-st-compat-toggle-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--SmartThemeQuoteColor);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--SmartThemeQuoteColor) 18%, transparent);
    opacity: 0;
    transform: scale(.5);
    transition: opacity .18s ease, transform .18s ease;
  }
  .crafttalker-st-compat-root[data-has-content="true"] .crafttalker-st-compat-toggle-dot {
    opacity: 1;
    transform: scale(1);
  }
  .crafttalker-st-compat-settings-panel {
    position: fixed;
    top: 64px;
    right: calc(var(--crafttalker-st-compat-right-offset, 0px) + 20px);
    bottom: 14px;
    display: flex;
    z-index: 2;
    width: min(480px, calc(100vw - 24px));
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transform: translateX(calc(100% + 22px));
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--SmartThemeQuoteColor) 5%, transparent), transparent 180px),
      var(--SmartThemeBlurTintColor);
    color: var(--SmartThemeBodyColor);
    box-shadow: 0 22px 70px var(--SmartThemeShadowColor);
    transition: transform .22s ease, opacity .18s ease, visibility 0s linear .22s;
  }
  .crafttalker-st-compat-root[data-open="true"] .crafttalker-st-compat-settings-panel {
    pointer-events: auto;
    visibility: visible;
    opacity: 1;
    transform: translateX(0);
    transition-delay: 0s;
  }
  .crafttalker-st-compat-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 48px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--SmartThemeBorderColor);
    background: color-mix(in srgb, var(--SmartThemeChatTintColor) 86%, transparent);
    flex: 0 0 auto;
  }
  .crafttalker-st-compat-title-group {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }
  .crafttalker-st-compat-title {
    color: var(--SmartThemeBodyColor);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.1;
  }
  .crafttalker-st-compat-badge {
    display: inline-flex;
    height: 20px;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--SmartThemeQuoteColor) 35%, transparent);
    border-radius: 999px;
    padding: 0 7px;
    color: var(--SmartThemeQuoteColor);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0;
    line-height: 1;
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, transparent);
  }
  .crafttalker-st-compat-close {
    position: relative;
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--SmartThemeEmColor);
    cursor: pointer;
    transition: background .16s ease, color .16s ease;
  }
  .crafttalker-st-compat-close:hover {
    background: var(--SmartThemeChatTintColor);
    color: var(--SmartThemeBodyColor);
  }
  .crafttalker-st-compat-close span,
  .crafttalker-st-compat-close span::after {
    display: block;
    width: 13px;
    height: 2px;
    border-radius: 999px;
    background: currentColor;
    content: '';
    transform: rotate(45deg);
  }
  .crafttalker-st-compat-close span::after {
    transform: rotate(90deg);
  }
  .crafttalker-st-compat-settings-body {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    padding: 10px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--SmartThemeQuoteColor) 4%, transparent), transparent 120px),
      var(--SmartThemeBlurTintColor);
    scrollbar-color: var(--SmartThemeBorderColor) transparent;
  }
  #extensions_settings,
  #extensions_settings2 {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 10px;
  }
  #extensions_settings:empty,
  #extensions_settings2:empty {
    display: none;
  }
  .crafttalker-st-compat-extensions-menu {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--SmartThemeBorderColor);
  }
  .crafttalker-st-compat-extensions-menu:empty {
    display: none;
  }
  .crafttalker-st-compat-extensions-menu .extension_container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .crafttalker-st-compat-extensions-menu .extension_container > *,
  .crafttalker-st-compat-extensions-menu .list-group-item {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 32px;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 7px;
    padding: 6px 8px;
    background: var(--SmartThemeChatTintColor);
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    transition: border-color .16s ease, background .16s ease;
  }
  .crafttalker-st-compat-extensions-menu .extensionsMenuExtensionButton {
    width: 32px;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
  }
  .crafttalker-st-compat-extensions-menu .extension_container > *:hover,
  .crafttalker-st-compat-extensions-menu .list-group-item:hover {
    border-color: color-mix(in srgb, var(--SmartThemeQuoteColor) 45%, var(--SmartThemeBorderColor));
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 10%, var(--SmartThemeChatTintColor));
  }
  @media (max-width: 640px) {
    .crafttalker-st-compat-root {
      z-index: 60;
    }
    .crafttalker-st-compat-toggle {
      top: auto;
      right: max(8px, env(safe-area-inset-right));
      bottom: max(86px, env(safe-area-inset-bottom));
      width: 40px;
      min-height: 40px;
      padding: 0 11px;
      border-right: 1px solid var(--SmartThemeBorderColor);
      border-radius: 8px;
      transform: none;
    }
    .crafttalker-st-compat-toggle:hover,
    .crafttalker-st-compat-root[data-open="true"] .crafttalker-st-compat-toggle {
      transform: translateY(-2px);
    }
    .crafttalker-st-compat-toggle-label {
      display: none;
    }
    .crafttalker-st-compat-settings-panel {
      top: 52px;
      right: 8px;
      bottom: 8px;
      width: calc(100vw - 16px);
    }
  }
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

const ST_COMPAT_CONTROL_STYLE = `
  .crafttalker-st-compat-settings-panel .inline-drawer {
    overflow: hidden;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: var(--SmartThemeChatTintColor);
    color: var(--SmartThemeBodyColor);
  }
  .crafttalker-st-compat-settings-panel .inline-drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 38px;
    padding: 9px 11px;
    border-bottom: 1px solid var(--SmartThemeBorderColor);
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 8%, var(--SmartThemeBlurTintColor));
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    user-select: none;
  }
  .crafttalker-st-compat-settings-panel .inline-drawer-header b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .crafttalker-st-compat-settings-panel .inline-drawer-content {
    display: block;
    padding: 10px 11px;
  }
  .crafttalker-st-compat-settings-panel .inline-drawer.closedDrawer .inline-drawer-content {
    display: none;
  }
  .crafttalker-st-compat-settings-panel .inline-drawer-icon {
    flex: 0 0 auto;
    color: var(--SmartThemeQuoteColor);
    transition: transform .16s ease;
  }
  .crafttalker-st-compat-settings-panel .inline-drawer.closedDrawer .inline-drawer-icon {
    transform: rotate(-90deg);
  }
  .crafttalker-st-compat-settings-panel .flex-container {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex-wrap: wrap;
  }
  .crafttalker-st-compat-settings-panel .flexFlowColumn {
    flex-direction: column;
    align-items: stretch;
  }
  .crafttalker-st-compat-settings-panel .flexnowrap {
    flex-wrap: nowrap;
  }
  .crafttalker-st-compat-settings-panel .alignItemsCenter,
  .crafttalker-st-compat-settings-panel .alignitemscenter {
    align-items: center;
  }
  .crafttalker-st-compat-settings-panel .justifySpaceBetween {
    justify-content: space-between;
  }
  .crafttalker-st-compat-settings-panel .wide100p {
    width: 100%;
  }
  .crafttalker-st-compat-settings-panel .padding5 {
    padding: 5px;
  }
  .crafttalker-st-compat-settings-panel .margin0 {
    margin: 0;
  }
  .crafttalker-st-compat-settings-panel hr,
  .crafttalker-st-compat-settings-panel .sysHR {
    width: 100%;
    height: 1px;
    border: 0;
    margin: 10px 0;
    background: var(--SmartThemeBorderColor);
  }
  .crafttalker-st-compat-settings-panel label {
    color: var(--SmartThemeBodyColor);
  }
  .crafttalker-st-compat-settings-panel small {
    color: var(--SmartThemeEmColor);
  }
  .crafttalker-st-compat-settings-panel input,
  .crafttalker-st-compat-settings-panel select,
  .crafttalker-st-compat-settings-panel textarea,
  .crafttalker-st-compat-settings-panel .text_pole {
    max-width: 100%;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 7px;
    background: var(--SmartThemeInputColor);
    color: var(--SmartThemeBodyColor);
    outline: none;
  }
  .crafttalker-st-compat-settings-panel input[type="text"],
  .crafttalker-st-compat-settings-panel input[type="number"],
  .crafttalker-st-compat-settings-panel select,
  .crafttalker-st-compat-settings-panel textarea,
  .crafttalker-st-compat-settings-panel .text_pole {
    min-height: 30px;
    padding: 5px 8px;
  }
  .crafttalker-st-compat-settings-panel textarea {
    resize: vertical;
  }
  .crafttalker-st-compat-settings-panel input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--SmartThemeQuoteColor);
  }
  .crafttalker-st-compat-settings-panel input[type="range"] {
    accent-color: var(--SmartThemeQuoteColor);
  }
  .crafttalker-st-compat-settings-panel .range-block-range {
    flex: 1 1 160px;
    min-width: 120px;
  }
  .crafttalker-st-compat-settings-panel .range-block-range input {
    width: 100%;
  }
  .crafttalker-st-compat-settings-panel .range-block-counter input {
    width: 72px;
  }
  .crafttalker-st-compat-settings-panel .menu_button,
  .crafttalker-st-compat-settings-panel button.menu_button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 30px;
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 7px;
    padding: 5px 9px;
    background: var(--SmartThemeBlurTintColor);
    color: var(--SmartThemeBodyColor);
    cursor: pointer;
    line-height: 1.2;
    transition: border-color .16s ease, background .16s ease, color .16s ease;
  }
  .crafttalker-st-compat-settings-panel .menu_button:hover,
  .crafttalker-st-compat-settings-panel .menu_button.active {
    border-color: color-mix(in srgb, var(--SmartThemeQuoteColor) 45%, var(--SmartThemeBorderColor));
    background: color-mix(in srgb, var(--SmartThemeQuoteColor) 12%, var(--SmartThemeBlurTintColor));
    color: var(--SmartThemeBodyColor);
  }
  .crafttalker-st-compat-settings-panel .menu_button_icon {
    min-width: 30px;
  }
  .crafttalker-st-compat-settings-panel .interactable {
    cursor: pointer;
  }
  .crafttalker-st-compat-settings-panel .section-divider {
    color: var(--SmartThemeEmColor);
    font-size: 12px;
    font-weight: 700;
    margin-top: 12px;
  }
  .crafttalker-st-compat-settings-panel .fa,
  .crafttalker-st-compat-settings-panel .fas,
  .crafttalker-st-compat-settings-panel .fa-solid {
    display: inline-flex;
    min-width: 1em;
    align-items: center;
    justify-content: center;
    font-style: normal;
    line-height: 1;
  }
  .crafttalker-st-compat-settings-panel .fa-chevron-down::before,
  .crafttalker-st-compat-settings-panel .fa-circle-chevron-down::before { content: 'v'; }
  .crafttalker-st-compat-settings-panel .fa-chevron-up::before { content: '^'; }
  .crafttalker-st-compat-settings-panel .fa-xmark::before,
  .crafttalker-st-compat-settings-panel .fa-close::before { content: 'x'; }
  .crafttalker-st-compat-settings-panel .fa-plus::before { content: '+'; }
  .crafttalker-st-compat-settings-panel .fa-rotate-left::before,
  .crafttalker-st-compat-settings-panel .fa-rotate-right::before { content: 'R'; }
  .crafttalker-st-compat-settings-panel .fa-trash::before { content: 'Del'; font-size: 10px; }
  .crafttalker-st-compat-settings-panel .fa-pencil::before,
  .crafttalker-st-compat-settings-panel .fa-pen-to-square::before { content: 'Edit'; font-size: 10px; }
  .crafttalker-st-compat-settings-panel .fa-download::before,
  .crafttalker-st-compat-settings-panel .fa-cloud-arrow-down::before { content: 'Dn'; font-size: 10px; }
  .crafttalker-st-compat-settings-panel .fa-upload::before { content: 'Up'; font-size: 10px; }
  .crafttalker-st-compat-settings-panel .fa-circle-question::before,
  .crafttalker-st-compat-settings-panel .fa-question::before { content: '?'; }
`

const ST_COMPAT_FLOATING_DIALOG_STYLE = `
  .dialog-teleported {
    color: var(--SmartThemeBodyColor);
    font-family: var(--font-sans, system-ui, sans-serif);
    font-size: var(--mainFontSize);
  }
  .dialog-teleported [role="dialog"] {
    border: 1px solid var(--SmartThemeBorderColor);
    border-radius: 8px;
    background: var(--SmartThemeBlurTintColor);
    color: var(--SmartThemeBodyColor);
    box-shadow: 0 22px 70px var(--SmartThemeShadowColor);
  }
  .dialog-teleported [role="dialog"] > div:first-child {
    min-height: 32px;
    padding: 2px 6px;
  }
  .dialog-teleported [role="dialog"] > div:first-child > div:last-child {
    align-items: center;
    min-height: 28px;
  }
  .dialog-teleported [role="dialog"] > div:first-child > div:last-child > *,
  .dialog-teleported .fa-solid.cursor-pointer,
  .dialog-teleported .fa.cursor-pointer,
  .dialog-teleported .fas.cursor-pointer {
    display: inline-flex;
    width: 28px;
    min-width: 28px;
    height: 28px;
    min-height: 28px;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    cursor: pointer;
  }
  .dialog-teleported [role="dialog"] > div:first-child > div:last-child > *:hover,
  .dialog-teleported .fa-solid.cursor-pointer:hover,
  .dialog-teleported .fa.cursor-pointer:hover,
  .dialog-teleported .fas.cursor-pointer:hover {
    background: color-mix(in srgb, var(--SmartThemeBodyColor) 12%, transparent);
  }
  .dialog-teleported .fa,
  .dialog-teleported .fas,
  .dialog-teleported .fa-solid {
    display: inline-flex;
    min-width: 1em;
    min-height: 1em;
    align-items: center;
    justify-content: center;
    font-style: normal;
    line-height: 1;
  }
  .dialog-teleported .fa-magnifying-glass::before,
  .dialog-teleported .fa-search::before { content: 'S'; font-size: 11px; font-weight: 700; }
  .dialog-teleported .fa-square-root-variable::before { content: 'V'; font-size: 11px; font-weight: 700; }
  .dialog-teleported .fa-file-invoice::before { content: 'L'; font-size: 11px; font-weight: 700; }
  .dialog-teleported .fa-question::before,
  .dialog-teleported .fa-circle-question::before { content: '?'; font-weight: 700; }
  .dialog-teleported .fa-chevron-down::before,
  .dialog-teleported .fa-circle-chevron-down::before { content: 'v'; }
  .dialog-teleported .fa-chevron-up::before { content: '^'; }
  .dialog-teleported .fa-xmark::before,
  .dialog-teleported .fa-close::before { content: 'x'; font-weight: 700; }
  .dialog-teleported .fa-expand::before { content: '+'; font-weight: 700; }
  .dialog-teleported .fa-compress::before { content: '-'; font-weight: 700; }
  .dialog-teleported .fa-copy::before { content: 'C'; font-size: 11px; font-weight: 700; }
  .dialog-teleported .fa-rotate-left::before,
  .dialog-teleported .fa-rotate-right::before { content: 'R'; font-size: 11px; font-weight: 700; }
  .dialog-teleported .fa-filter::before { content: 'F'; font-size: 11px; font-weight: 700; }
`

const ST_COMPAT_DOM_STYLE = [
  ST_COMPAT_THEME_STYLE,
  ST_COMPAT_DRAWER_STYLE,
  ST_COMPAT_CONTROL_STYLE,
  ST_COMPAT_FLOATING_DIALOG_STYLE,
].join('\n')

export function ensureStCompatDomAnchors(): void {
  if (!document.body) return
  installCompatDomStyle()

  const root = ensureCompatRoot()
  root.classList.add('crafttalker-st-compat-root')
  initialiseCompatDrawerState(root)
  if (document.body.firstElementChild !== root) {
    document.body.prepend(root)
  }

  const toggle = ensureCompatDrawerToggle(root)
  const settingsPanel = ensureElement('section', 'crafttalker-st-compat-settings-panel', root)
  settingsPanel.classList.add('crafttalker-st-compat-settings-panel')
  settingsPanel.setAttribute('aria-label', 'SillyTavern extension compatibility panels')
  settingsPanel.setAttribute('aria-labelledby', 'crafttalker-st-compat-title')

  const header = ensureElement('div', 'crafttalker-st-compat-panel-header', settingsPanel)
  header.classList.add('crafttalker-st-compat-panel-header')
  const titleGroup = ensureElement('div', 'crafttalker-st-compat-title-group', header)
  titleGroup.classList.add('crafttalker-st-compat-title-group')
  const title = ensureElement('div', 'crafttalker-st-compat-title', titleGroup)
  title.classList.add('crafttalker-st-compat-title')
  title.textContent = 'Extensions'
  const badge = ensureElement('span', 'crafttalker-st-compat-badge', titleGroup)
  badge.classList.add('crafttalker-st-compat-badge')
  badge.textContent = 'ST'
  const closeButton = ensureElement('button', 'crafttalker-st-compat-close', header)
  closeButton.classList.add('crafttalker-st-compat-close')
  closeButton.setAttribute('type', 'button')
  closeButton.setAttribute('aria-label', 'Close ST plugins panel')
  if (!closeButton.dataset.compatCloseInitialized) {
    closeButton.innerHTML = '<span aria-hidden="true"></span>'
    closeButton.addEventListener('click', () => setCompatDrawerOpen(root, false))
    closeButton.dataset.compatCloseInitialized = 'true'
  }

  const settingsBody = ensureElement('div', 'crafttalker-st-compat-settings-body', settingsPanel)
  settingsBody.classList.add('crafttalker-st-compat-settings-body')
  const extensionsMenu = ensureElement('div', 'extensionsMenu', settingsBody)
  extensionsMenu.classList.add('crafttalker-st-compat-extensions-menu')
  ensureElement('div', 'extensions_settings', settingsBody)
  ensureElement('div', 'extensions_settings2', settingsBody)
  observeCompatSettingsPanel(settingsPanel, root, toggle)
  ensureCompatInlineDrawerBehavior(root)
  syncCompatDrawerChrome(root)

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
  style.textContent = ST_COMPAT_DOM_STYLE
  document.head.appendChild(style)
}

function observeCompatSettingsPanel(panel: HTMLElement, root: HTMLElement, toggle: HTMLButtonElement): void {
  if (compatPanelObserver && observedCompatPanel === panel) return
  compatPanelObserver?.disconnect()
  observedCompatPanel = panel
  const refresh = () => {
    const hasContent = Boolean(panel.querySelector([
      '#extensionsMenu > :not(script):not(style):not(template)',
      '#extensions_settings > :not(script):not(style):not(template)',
      '#extensions_settings2 > :not(script):not(style):not(template)',
    ].join(',')))
    panel.dataset.hasContent = String(hasContent)
    root.dataset.hasContent = String(hasContent)
    toggle.dataset.hasContent = String(hasContent)
  }
  compatPanelObserver = new MutationObserver(refresh)
  compatPanelObserver.observe(panel, { childList: true, subtree: true })
  refresh()
}

function initialiseCompatDrawerState(root: HTMLElement): void {
  if (root.dataset.open !== 'true' && root.dataset.open !== 'false') {
    root.dataset.open = String(readCompatDrawerOpen())
  }
  if (root.dataset.hasContent !== 'true' && root.dataset.hasContent !== 'false') {
    root.dataset.hasContent = 'false'
  }
}

function ensureCompatDrawerToggle(root: HTMLElement): HTMLButtonElement {
  const toggle = ensureElement('button', 'crafttalker-st-compat-toggle', root)
  toggle.classList.add('crafttalker-st-compat-toggle')
  toggle.dataset.stCompatToggle = 'true'
  toggle.setAttribute('type', 'button')
  toggle.setAttribute('aria-controls', 'crafttalker-st-compat-settings-panel')
  toggle.setAttribute('aria-label', 'Open ST plugins')
  if (!toggle.dataset.compatToggleInitialized) {
    toggle.innerHTML = [
      '<span class="crafttalker-st-compat-toggle-icon" aria-hidden="true">',
      '<span></span><span></span><span></span><span></span>',
      '</span>',
      '<span class="crafttalker-st-compat-toggle-label">Plugins</span>',
      '<span class="crafttalker-st-compat-toggle-dot" aria-hidden="true"></span>',
    ].join('')
    toggle.addEventListener('click', () => setCompatDrawerOpen(root, root.dataset.open !== 'true'))
    toggle.dataset.compatToggleInitialized = 'true'
  }
  return toggle
}

function ensureCompatInlineDrawerBehavior(root: HTMLElement): void {
  if (root.dataset.compatInlineDrawerInitialized) return
  root.addEventListener('click', event => {
    const target = event.target
    if (!(target instanceof Element)) return
    const toggle = target.closest('.inline-drawer-toggle')
    if (!toggle || !root.contains(toggle)) return
    const drawer = toggle.closest('.inline-drawer')
    if (!(drawer instanceof HTMLElement)) return
    drawer.classList.toggle('closedDrawer')
    const content = drawer.querySelector<HTMLElement>('.inline-drawer-content')
    content?.setAttribute('aria-hidden', String(drawer.classList.contains('closedDrawer')))
  })
  root.dataset.compatInlineDrawerInitialized = 'true'
}

function setCompatDrawerOpen(root: HTMLElement, open: boolean): void {
  root.dataset.open = String(open)
  writeCompatDrawerOpen(open)
  syncCompatDrawerChrome(root)
}

function syncCompatDrawerChrome(root: HTMLElement): void {
  const open = root.dataset.open === 'true'
  const toggle = getCompatElement<HTMLButtonElement>(root, 'crafttalker-st-compat-toggle')
  const panel = getCompatElement<HTMLElement>(root, 'crafttalker-st-compat-settings-panel')
  toggle?.setAttribute('aria-expanded', String(open))
  toggle?.setAttribute('aria-label', open ? 'Close ST plugins' : 'Open ST plugins')
  panel?.setAttribute('aria-hidden', String(!open))
}

function readCompatDrawerOpen(): boolean {
  try {
    return localStorage.getItem(PLUGIN_DRAWER_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeCompatDrawerOpen(open: boolean): void {
  try {
    localStorage.setItem(PLUGIN_DRAWER_STORAGE_KEY, String(open))
  } catch {
    // Ignore storage failures in embedded or privacy-restricted contexts.
  }
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
  const existing = getCompatElement<HTMLElementTagNameMap[K]>(document, id)
  if (existing) {
    if (existing.parentElement !== parent) {
      parent.appendChild(existing)
    }
    return existing
  }
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
