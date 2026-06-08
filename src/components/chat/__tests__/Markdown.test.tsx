import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from '@/components/chat/Markdown'

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
})
