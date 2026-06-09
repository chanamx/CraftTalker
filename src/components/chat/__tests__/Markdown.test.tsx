import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Markdown } from '@/components/chat/Markdown'

vi.mock('shiki/core', () => ({
  createBundledHighlighter: () => async () => ({
    codeToHtml: (code: string) => `<pre><code><span class="line">${code}</span></code></pre>`,
    getLoadedLanguages: () => [],
    loadLanguage: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('shiki/engine/javascript', () => ({
  createJavaScriptRegexEngine: vi.fn(),
}))

vi.mock('@shikijs/themes/github-dark', () => ({ default: {} }))
vi.mock('@shikijs/themes/github-light', () => ({ default: {} }))
vi.mock('@shikijs/langs/javascript', () => ({ default: [] }))

describe('Markdown', () => {
  it('removes unsafe html, attributes, and protocols', () => {
    const { container } = render(
      <Markdown
        content={`Safe text

<script>alert(1)</script>
<img src=x onerror=alert(2)>
<a href="javascript:alert(3)" onclick="alert(4)" style="color:red">bad link</a>`}
      />
    )

    expect(screen.getByText('Safe text')).toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(container.querySelector('[onclick]')).not.toBeInTheDocument()
    expect(container.querySelector('[style="color:red"]')).not.toBeInTheDocument()
    expect(container.querySelector('a[href^="javascript:"]')).not.toBeInTheDocument()
    expect(screen.getByText('bad link')).toBeInTheDocument()
  })

  it('keeps safe external links with protective attributes', () => {
    const { container } = render(<Markdown content="[docs](https://example.com/docs)" />)
    const link = container.querySelector('a')

    expect(link).toHaveAttribute('href', 'https://example.com/docs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('highlights supported code languages lazily', async () => {
    const { container } = render(<Markdown content={'```js\nconst value = 1\n```'} />)

    await waitFor(() => {
      expect(container.querySelector('code .line')).toHaveTextContent('const value = 1')
    })
  })

  it('leaves unsupported code languages as escaped plain text', () => {
    const { container } = render(<Markdown content={'```cpp\nstd::vector<int> values;\n```'} />)

    const code = container.querySelector('code.shiki-target')
    expect(code).toHaveTextContent('std::vector<int> values;')
    expect(code?.querySelector('.line')).not.toBeInTheDocument()
  })
})
