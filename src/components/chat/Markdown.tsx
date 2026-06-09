import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Tokens } from 'marked'
import type { HighlighterGeneric, LanguageInput, ThemeInput } from 'shiki/core'
import katex from 'katex'

const shikiThemes = {
  'github-dark': () => import('@shikijs/themes/github-dark'),
  'github-light': () => import('@shikijs/themes/github-light'),
} satisfies Record<string, ThemeInput>

const shikiLanguages = {
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  python: () => import('@shikijs/langs/python'),
  bash: () => import('@shikijs/langs/bash'),
  json: () => import('@shikijs/langs/json'),
  css: () => import('@shikijs/langs/css'),
  html: () => import('@shikijs/langs/html'),
  markdown: () => import('@shikijs/langs/markdown'),
  yaml: () => import('@shikijs/langs/yaml'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  java: () => import('@shikijs/langs/java'),
  c: () => import('@shikijs/langs/c'),
  sql: () => import('@shikijs/langs/sql'),
} satisfies Record<string, LanguageInput>

type ShikiLanguage = keyof typeof shikiLanguages
type ShikiTheme = keyof typeof shikiThemes
type MarkdownHighlighter = HighlighterGeneric<ShikiLanguage, ShikiTheme>

let highlighterPromise: Promise<MarkdownHighlighter> | null = null
const languageLoadPromises = new Map<ShikiLanguage, Promise<void>>()

const markdownSanitizeConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'u', 'del', 's', 'code', 'pre',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote',
    'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr',
    'div', 'span',
    'button',
  ],
  ALLOWED_ATTR: [
    'class', 'href', 'target', 'rel', 'title',
  ],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: [
    'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math',
    'form', 'input', 'textarea', 'select', 'option',
    'meta', 'link', 'base',
  ],
  FORBID_ATTR: ['style'],
}

const renderedSanitizeConfig = {
  ...markdownSanitizeConfig,
  ALLOWED_TAGS: [
    ...markdownSanitizeConfig.ALLOWED_TAGS,
    'annotation', 'math', 'mfrac', 'mi', 'mn', 'mo', 'msup', 'mtext',
    'semantics',
  ],
  ALLOWED_ATTR: [
    ...markdownSanitizeConfig.ALLOWED_ATTR,
    'aria-hidden', 'encoding', 'style', 'xmlns',
  ],
  FORBID_TAGS: [
    'script', 'iframe', 'object', 'embed', 'svg',
    'form', 'input', 'textarea', 'select', 'option',
    'meta', 'link', 'base',
  ],
  FORBID_ATTR: [],
}

const shikiSanitizeConfig = {
  ALLOWED_TAGS: ['span'],
  ALLOWED_ATTR: ['class', 'style'],
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: [
    'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math',
    'form', 'input', 'textarea', 'select', 'option',
    'meta', 'link', 'base',
  ],
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return char
    }
  })
}

function normalizeCodeLanguage(lang: string | undefined): string {
  const normalized = (lang || 'text').trim().toLowerCase()
  return /^[\w#+.-]{1,32}$/.test(normalized) ? normalized : 'text'
}

function resolveHighlightLanguage(lang: string): ShikiLanguage | null {
  switch (lang) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript'
    case 'py':
      return 'python'
    case 'sh':
    case 'shell':
    case 'zsh':
      return 'bash'
    case 'yml':
      return 'yaml'
    case 'md':
      return 'markdown'
    case 'htm':
      return 'html'
    default:
      return lang in shikiLanguages ? (lang as ShikiLanguage) : null
  }
}

function getCodeLanguage(el: HTMLElement): string {
  const languageClass = Array.from(el.classList).find((className) =>
    className.startsWith('language-')
  )
  return languageClass ? normalizeCodeLanguage(languageClass.slice('language-'.length)) : 'text'
}

function isSafeLink(href: string | null | undefined): href is string {
  return /^(?:https?|mailto):/i.test((href || '').trim())
}

async function getHighlighter(): Promise<MarkdownHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = Promise.all([
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]).then(([core, engine]) => {
      const createHighlighter = core.createBundledHighlighter<ShikiLanguage, ShikiTheme>({
        langs: shikiLanguages,
        themes: shikiThemes,
        engine: () => engine.createJavaScriptRegexEngine(),
      })
      return createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: [],
      })
    })
  }
  return highlighterPromise
}

async function ensureLanguageLoaded(highlighter: MarkdownHighlighter, lang: ShikiLanguage): Promise<void> {
  if (highlighter.getLoadedLanguages().includes(lang)) return
  let promise = languageLoadPromises.get(lang)
  if (!promise) {
    promise = highlighter.loadLanguage(lang)
    languageLoadPromises.set(lang, promise)
  }
  await promise
}

const LATEX_INLINE = /\$([^$\n]+?)\$/g

type InlineRendererContext = {
  parser: {
    parse(tokens: Tokens.Generic[]): string
    parseInline(tokens: Tokens.Generic[]): string
  }
}

function renderInline(ctx: InlineRendererContext, tokens?: Tokens.Generic[], fallback = ''): string {
  return tokens ? ctx.parser.parseInline(tokens) : fallback
}

function renderBlocks(ctx: InlineRendererContext, tokens?: Tokens.Generic[], fallback = ''): string {
  return tokens ? ctx.parser.parse(tokens) : fallback
}

function renderLatex(html: string): string {
  return html
    .replace(/<p>\$\$([\s\S]*?)\$\$<\/p>/g, (_m, formula) => {
      try {
        return `<div class="my-3 flex justify-center overflow-x-auto">${katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false })}</div>`
      } catch {
        return `<div class="my-3 text-xs text-[var(--color-text-muted)] italic">LaTeX 渲染失败</div>`
      }
    })
    .replace(LATEX_INLINE, (_m, formula) => {
      try {
        return katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false })
      } catch {
        return `<span class="text-xs text-[var(--color-text-muted)] italic">LaTeX 错误</span>`
      }
    })
}

const renderer = new marked.Renderer()

renderer.code = function ({ text, lang }: Tokens.Code) {
  const safeLang = normalizeCodeLanguage(lang)
  const langLabel = lang
    ? `<span class="text-[10px] uppercase tracking-wider opacity-50">${escapeHtml(safeLang)}</span>`
    : ''
  const escaped = escapeHtml(text)
  return `<div class="relative my-3 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] markdown-code-block">
    <div class="flex items-center justify-between px-4 py-1.5 bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] text-xs">${langLabel}<button class="copy-btn text-[10px] hover:text-[var(--color-accent)] transition-colors">复制</button></div>
    <pre class="p-4 overflow-x-auto text-xs leading-relaxed font-mono bg-[var(--color-bg-elevated)]"><code class="shiki-target language-${safeLang}">${escaped}</code></pre>
  </div>`
}

renderer.codespan = function ({ text }: Tokens.Codespan) {
  return `<code class="px-1.5 py-0.5 rounded-md bg-[var(--color-bg-surface)] text-[var(--color-accent)] text-xs font-mono before:content-none after:content-none">${escapeHtml(text)}</code>`
}

renderer.heading = function (this: InlineRendererContext, token: Tokens.Heading) {
  const sizes: Record<number, string> = { 1: 'text-lg', 2: 'text-base', 3: 'text-sm' }
  const text = renderInline(this, token.tokens, token.text)
  return `<h${token.depth} class="${sizes[token.depth] ?? 'text-sm'} font-semibold mt-4 mb-2 first:mt-0 text-[var(--color-text-primary)]">${text}</h${token.depth}>`
}

renderer.list = function (this: InlineRendererContext, token: Tokens.List) {
  const tag = token.ordered ? 'ol' : 'ul'
  const listItems = token.items
    .map(
      (item) =>
        `<li class="ml-4 my-0.5 list-inside">${renderBlocks(this, item.tokens, item.text)}</li>`
    )
    .join('')
  return `<${tag} class="my-2 space-y-0.5">${listItems}</${tag}>`
}

renderer.listitem = function (this: InlineRendererContext, token: Tokens.ListItem) {
  return renderBlocks(this, token.tokens, token.text)
}

renderer.paragraph = function (this: InlineRendererContext, token: Tokens.Paragraph) {
  const trimmed = token.text.trim()
  if (!trimmed) return ''
  return `<p class="my-1 leading-relaxed first:mt-0 last:mb-0">${renderInline(this, token.tokens, trimmed)}</p>`
}

renderer.strong = function (this: InlineRendererContext, token: Tokens.Strong) {
  return `<strong class="font-semibold text-[var(--color-text-primary)]">${renderInline(this, token.tokens, token.text)}</strong>`
}

renderer.em = function (this: InlineRendererContext, token: Tokens.Em) {
  return `<em class="italic">${renderInline(this, token.tokens, token.text)}</em>`
}

renderer.link = function ({ href, title, text }: Tokens.Link) {
  if (!isSafeLink(href)) {
    return text
  }

  const safeHref = escapeHtml(href.trim())
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr} class="text-[var(--color-accent)] underline underline-offset-2 hover:opacity-80 transition-opacity">${text}</a>`
}

renderer.hr = function () {
  return `<hr class="my-4 border-[var(--color-border-subtle)]" />`
}

renderer.blockquote = function (this: InlineRendererContext, token: Tokens.Blockquote) {
  return `<blockquote class="border-l-3 border-[var(--color-accent)] pl-3 my-2 text-[var(--color-text-secondary)] italic">${renderBlocks(this, token.tokens, token.text)}</blockquote>`
}

renderer.table = function (this: InlineRendererContext, token: Tokens.Table) {
  const headerRow = token.header
    .map(
      (h) => `<th class="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">${renderInline(this, h.tokens, h.text)}</th>`
    )
    .join('')
  const bodyRows = token.rows
    .map(
      (row) =>
        `<tr class="border-t border-[var(--color-border-subtle)]">${row.map((cell) => `<td class="px-3 py-2 text-xs">${renderInline(this, cell.tokens, cell.text)}</td>`).join('')}</tr>`
    )
    .join('')
  return `<div class="my-3 overflow-x-auto rounded-lg border border-[var(--color-border-subtle)]"><table class="w-full border-collapse"><thead><tr class="bg-[var(--color-bg-surface)]">${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`
}

renderer.del = function (this: InlineRendererContext, token: Tokens.Del) {
  return `<del class="line-through opacity-70">${renderInline(this, token.tokens, token.text)}</del>`
}

marked.use({ renderer, breaks: true, gfm: true })

interface MarkdownProps {
  content: string
  isUser?: boolean
}

export function Markdown({ content, isUser }: MarkdownProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [, setRenderTick] = useState(0)

  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content) as string
    const safeMarkdown = DOMPurify.sanitize(raw, markdownSanitizeConfig)
    const withLatex = renderLatex(safeMarkdown)

    return DOMPurify.sanitize(withLatex, renderedSanitizeConfig)
  }, [content])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
      const href = link.getAttribute('href')
      if (!isSafeLink(href)) {
        link.removeAttribute('href')
        link.removeAttribute('target')
        link.removeAttribute('rel')
        return
      }

      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    })

    const codeElements = container.querySelectorAll<HTMLElement>('code.shiki-target')
    if (codeElements.length === 0) return

    const isDark = document.documentElement.classList.contains('dark')
    const theme = isDark ? 'github-dark' : 'github-light'

    getHighlighter().then(async (highlighter) => {
      for (const el of codeElements) {
        const lang = getCodeLanguage(el)
        const highlightLang = resolveHighlightLanguage(lang)
        if (!highlightLang) continue

        const code = el.textContent || ''
        try {
          await ensureLanguageLoaded(highlighter, highlightLang)
          const html = highlighter.codeToHtml(code, {
            lang: highlightLang,
            theme,
          })
          const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
          if (match) {
            el.innerHTML = DOMPurify.sanitize(match[1], shikiSanitizeConfig)
          }
        } catch {
          el.textContent = code
        }
      }
      setRenderTick((t) => t + 1)
    })
  }, [html])

  const handleCopy = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement
      if (!target.classList.contains('copy-btn')) return

      const codeBlock = target.closest('.markdown-code-block')?.querySelector('code')
      if (!codeBlock) return

      const text = codeBlock.textContent ?? ''
      navigator.clipboard.writeText(text).then(
        () => {
          target.textContent = t('markdown.copied')
          setTimeout(() => {
            target.textContent = t('markdown.copy')
          }, 1500)
        },
        () => {
          target.textContent = t('markdown.failed')
          setTimeout(() => {
            target.textContent = t('markdown.copy')
          }, 1500)
        }
      )
    },
    [t]
  )

  return (
    <div
      ref={containerRef}
      className={`prose-custom prose-sm max-w-none ${isUser ? '[&_strong]:text-white [&_code]:bg-white/15 [&_code]:text-white/90' : ''} [&_a]:break-all`}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleCopy}
    />
  )
}
