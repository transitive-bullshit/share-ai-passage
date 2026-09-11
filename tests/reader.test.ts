import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SavedMessage } from '../components/saved-message'
import { type Message } from '../lib/domain'

function renderMessage(markdown: string, options: Partial<Message> = {}) {
  return renderToStaticMarkup(
    createElement(SavedMessage, {
      message: {
        id: 'message-1',
        speaker: 'assistant',
        markdown,
        text: markdown,
        ...options
      },
      index: 0,
      selected: true
    })
  )
}

describe('safe, faithful conversation reader', () => {
  it('shows raw HTML and script content as escaped text instead of executing or omitting it', () => {
    const html = renderMessage(
      [
        'Before the example.',
        '<script>alert("keep these original words")</script>',
        '<img src="https://untrusted.example/pixel" onerror="alert(1)">',
        '<div onclick="alert(2)">Original HTML & content</div>',
        '<iframe src="https://untrusted.example/frame"></iframe>',
        'After the example.'
      ].join('\n\n')
    )

    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('keep these original words')
    expect(html).toContain('&lt;/script&gt;')
    expect(html).toContain('&lt;img src=')
    expect(html).toContain('Original HTML &amp; content')
    expect(html).toContain('&lt;iframe src=')
    expect(html).toContain('Before the example.')
    expect(html).toContain('After the example.')
    expect(html).not.toMatch(/<(?:script|img|iframe|object|embed)\b/i)
    expect(html).not.toMatch(/<[^>]+\s(?:onclick|onerror)=/i)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'javascript&#58;alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//untrusted.example/path',
    '/internal-route'
  ])(
    'keeps link text but removes unsafe or unresolved destination %s',
    (destination) => {
      const html = renderMessage(`[Read these original words](${destination})`)
      expect(html).toContain('Read these original words')
      expect(html).not.toContain('href=')
    }
  )

  it('preserves supported public links, email links, and document fragments safely', () => {
    const html = renderMessage(
      '[Reference](https://example.com/docs?a=1&b=2) [Email](mailto:hello@example.com) [Note](#note)'
    )
    expect(html).toContain('href="https://example.com/docs?a=1&amp;b=2"')
    expect(html).toContain('href="mailto:hello@example.com"')
    expect(html).toContain('href="#note"')
    expect(html).not.toMatch(/href="#note"[^>]*target=/)
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('represents remote Markdown images explicitly without image elements or remote loads', () => {
    const html = renderMessage(
      '![A helpful diagram](https://untrusted.example/diagram.png)\n\n![Embedded picture](data:image/png;base64,aGVsbG8=)'
    )
    expect(html).toContain('[Image omitted: A helpful diagram]')
    expect(html).toContain('[Image omitted: Embedded picture]')
    expect(html).not.toMatch(/<(?:img|image|picture|source|link)\b/i)
    expect(html).not.toContain('src=')
    expect(html).not.toContain('https://untrusted.example')
    expect(html).not.toContain('data:image')
  })

  it('preserves fenced code, Unicode, tables, links, and source ordering', () => {
    const html = renderMessage(
      [
        '# A useful example',
        'The first point 🦊.',
        '```typescript\nconst tag = "<script>example</script>"\nconst greeting = "你好 🌱"\n```',
        '| Topic | Result |\n| --- | --- |\n| Code | Preserved |\n| Links | [Reference](https://example.com) |',
        'The final point.'
      ].join('\n\n')
    )
    expect(html).toContain('<h1>A useful example</h1>')
    expect(html).toContain('<pre><code class="language-typescript">')
    expect(html).toContain(
      'const tag = &quot;&lt;script&gt;example&lt;/script&gt;&quot;'
    )
    expect(html).toContain('你好 🌱')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>Topic</th>')
    expect(html).toContain('<td>Preserved</td>')
    expect(html.indexOf('The first point 🦊.')).toBeLessThan(
      html.indexOf('<pre>')
    )
    expect(html.indexOf('<pre>')).toBeLessThan(html.indexOf('<table>'))
    expect(html.indexOf('<table>')).toBeLessThan(
      html.indexOf('The final point.')
    )
    expect(html).not.toContain('<script>')
  })

  it('keeps original speaker labels and explicit unsupported-content markers visible', () => {
    const html = renderMessage('[Attachment omitted: research.pdf]', {
      speaker: 'user',
      text: ''
    })
    expect(html).toContain('aria-label="Human, message 1"')
    expect(html).toContain('[Attachment omitted: research.pdf]')
    expect(html).toContain('SELECTED PASSAGE')
  })
})
