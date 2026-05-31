import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Tokens } from 'marked'
import { createHighlighter } from 'shiki'
import katex from 'katex'

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'javascript',
        'typescript',
        'python',
        'bash',
        'json',
        'css',
        'html',
        'markdown',
        'yaml',
        'rust',
        'go',
        'java',
        'c',
        'cpp',
        'sql',
      ],
    })
  }
  return highlighterPromise
}

const LATEX_INLINE = /\$([^$\n]+?)\$/g

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
  const langLabel = lang
    ? `<span class="text-[10px] uppercase tracking-wider opacity-50">${lang}</span>`
    : ''
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div class="relative my-3 rounded-lg overflow-hidden border border-[var(--color-border-subtle)] markdown-code-block">
    <div class="flex items-center justify-between px-4 py-1.5 bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] text-xs">${langLabel}<button class="copy-btn text-[10px] hover:text-[var(--color-accent)] transition-colors">复制</button></div>
    <pre class="p-4 overflow-x-auto text-xs leading-relaxed font-mono bg-[var(--color-bg-elevated)]"><code class="shiki-target" data-lang="${lang || 'text'}">${escaped}</code></pre>
  </div>`
}

renderer.codespan = function ({ text }: Tokens.Codespan) {
  return `<code class="px-1.5 py-0.5 rounded-md bg-[var(--color-bg-surface)] text-[var(--color-accent)] text-xs font-mono before:content-none after:content-none">${text}</code>`
}

renderer.heading = function (token: Tokens.Heading) {
  const sizes: Record<number, string> = { 1: 'text-lg', 2: 'text-base', 3: 'text-sm' }
  return `<h${token.depth} class="${sizes[token.depth] ?? 'text-sm'} font-semibold mt-4 mb-2 first:mt-0 text-[var(--color-text-primary)]">${token.text}</h${token.depth}>`
}

renderer.list = function (token: Tokens.List) {
  const tag = token.ordered ? 'ol' : 'ul'
  const listItems = token.items
    .map(
      (item) =>
        `<li class="ml-4 my-0.5 list-inside" style="list-style-type: ${token.ordered ? 'decimal' : 'disc'}">${item.text}</li>`
    )
    .join('')
  return `<${tag} class="my-2 space-y-0.5">${listItems}</${tag}>`
}

renderer.listitem = function ({ text }: Tokens.ListItem) {
  return text
}

renderer.paragraph = function (token: Tokens.Paragraph) {
  const trimmed = token.text.trim()
  if (!trimmed) return ''
  return `<p class="my-1 leading-relaxed first:mt-0 last:mb-0">${trimmed}</p>`
}

renderer.strong = function (token: Tokens.Strong) {
  return `<strong class="font-semibold text-[var(--color-text-primary)]">${token.text}</strong>`
}

renderer.em = function (token: Tokens.Em) {
  return `<em class="italic">${token.text}</em>`
}

renderer.link = function ({ href, title, text }: Tokens.Link) {
  const titleAttr = title ? ` title="${title}"` : ''
  return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr} class="text-[var(--color-accent)] underline underline-offset-2 hover:opacity-80 transition-opacity">${text}</a>`
}

renderer.hr = function () {
  return `<hr class="my-4 border-[var(--color-border-subtle)]" />`
}

renderer.blockquote = function (token: Tokens.Blockquote) {
  return `<blockquote class="border-l-3 border-[var(--color-accent)] pl-3 my-2 text-[var(--color-text-secondary)] italic">${token.text}</blockquote>`
}

renderer.table = function (token: Tokens.Table) {
  const headerRow = token.header
    .map(
      (h) => `<th class="px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)]">${h.text}</th>`
    )
    .join('')
  const bodyRows = token.rows
    .map(
      (row) =>
        `<tr class="border-t border-[var(--color-border-subtle)]">${row.map((cell) => `<td class="px-3 py-2 text-xs">${cell.text}</td>`).join('')}</tr>`
    )
    .join('')
  return `<div class="my-3 overflow-x-auto rounded-lg border border-[var(--color-border-subtle)]"><table class="w-full border-collapse"><thead><tr class="bg-[var(--color-bg-surface)]">${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`
}

renderer.del = function (token: Tokens.Del) {
  return `<del class="line-through opacity-70">${token.text}</del>`
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
    const withLatex = renderLatex(raw)
    return DOMPurify.sanitize(withLatex)
  }, [content])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const codeElements = container.querySelectorAll<HTMLElement>('code.shiki-target')
    if (codeElements.length === 0) return

    const isDark = document.documentElement.classList.contains('dark')
    const theme = isDark ? 'github-dark' : 'github-light'

    getHighlighter().then((highlighter) => {
      codeElements.forEach((el) => {
        const lang = el.dataset.lang || 'text'
        const code = el.textContent || ''
        try {
          const html = highlighter.codeToHtml(code, {
            lang,
            theme,
          })
          const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)
          if (match) {
            el.innerHTML = match[1]
          }
        } catch {
          el.textContent = code
        }
      })
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
