import { createElement } from 'react'
import { Window } from 'happy-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SavedMessage } from '../components/saved-message'
import { SavedConversation } from '../components/saved-conversation'
import { type Message } from '../lib/domain'
import { message } from '../lib/messages'
import { groupReaderMessages } from '../lib/reader'

function renderMessage(markdown: string, options: Partial<Message> = {}) {
  return renderToStaticMarkup(
    createElement(SavedMessage, {
      message: {
        id: 'message-1',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type:
              options.role && options.role !== 'assistant'
                ? 'input_text'
                : 'output_text',
            text: markdown
          }
        ],
        ...options
      },
      index: 0
    })
  )
}

describe('safe, faithful conversation reader', () => {
  it('presents Codex async question replies as selected responses while preserving stored text', () => {
    const source =
      '<send_user_message_question_reply> [{"questionItemId":"["request_user_input_async","call_example",0]","question":"Where should this temporary review tool live?","answer":"Keep it **local**; this is temporary."}] </send_user_message_question_reply>'
    const entry = message('codex-1-0', 'user', source)
    const html = renderMessage('', entry)

    expect(html).toContain('Prompt answered')
    expect(html).toContain('Keep it <strong>local</strong>; this is temporary.')
    expect(html).not.toContain('send_user_message_question_reply')
    expect(html).not.toContain('questionItemId')
    expect(entry.content).toEqual([{ type: 'input_text', text: source }])
    expect(renderMessage(source, { role: 'user' })).toContain(
      '&lt;send_user_message_question_reply&gt;'
    )
  })

  it('presents every selection in a well-formed multi-question reply', () => {
    const source = `<send_user_message_question_reply>
${JSON.stringify([
  {
    questionItemId: ['request_user_input_async', 'call_example', 0],
    question: 'Choose a location',
    answer: 'Keep it local'
  },
  {
    questionItemId: ['request_user_input_async', 'call_example', 1],
    question: 'Choose a format',
    answer: 'Use the compact layout'
  }
])}
</send_user_message_question_reply>`
    const html = renderMessage(source, { id: 'codex-1-0', role: 'user' })

    expect(html.match(/Prompt answered/g)).toHaveLength(2)
    expect(html).toContain('Keep it local')
    expect(html).toContain('Use the compact layout')
    const document = new Window().document
    document.body.innerHTML = html
    expect(
      Array.from(document.querySelectorAll('.question-reply'), (reply) =>
        reply.textContent?.trim()
      )
    ).toEqual([
      'Prompt answeredKeep it local',
      'Prompt answeredUse the compact layout'
    ])
  })

  it('keeps malformed async reply envelopes literal', () => {
    const html = renderMessage(
      '<send_user_message_question_reply> [{"question":"Missing answer"}] </send_user_message_question_reply>',
      { id: 'codex-1-0', role: 'user' }
    )

    expect(html).toContain('&lt;send_user_message_question_reply&gt;')
    expect(html).toContain('Missing answer')
  })

  it('displays a complete Codex delegation as a prompt with provenance while preserving stored text', () => {
    const source =
      '<codex_delegation>\n  <source_thread_id></source_thread_id>\n  <input>Compare **these examples**.\n\nKeep &lt;script&gt; literal.</input>\n</codex_delegation>'
    const entry = message('codex-0-0', 'user', source)
    const html = renderMessage('', entry)
    expect(html).toContain('Sent from another task')
    expect(html).toContain('Compare <strong>these examples</strong>')
    expect(html).toContain('Keep &lt;script&gt; literal.')
    expect(html).not.toContain('codex_delegation')
    expect(entry.content).toEqual([{ type: 'input_text', text: source }])

    // The same text in an ordinary message, or an incomplete envelope, stays literal.
    expect(renderMessage(source, { role: 'user' })).toContain(
      '&lt;codex_delegation&gt;'
    )
    expect(
      renderMessage(source.slice(0, -20), { id: 'codex-0-0', role: 'user' })
    ).toContain('&lt;codex_delegation&gt;')
  })

  it('marks unavailable local files without turning them into broken navigation links', () => {
    const html = renderMessage(
      '[hello.ts](/Users/example/outputs/hello.ts) [data.json](sandbox:/mnt/data/data.json)'
    )
    const document = new Window().document
    document.body.innerHTML = html
    expect(
      Array.from(document.querySelectorAll('.unavailable-file'), (file) =>
        file.textContent?.replace(/\u2060/g, '')
      )
    ).toEqual(['hello.ts', 'data.json'])
    expect(document.querySelectorAll('a')).toHaveLength(0)
    expect(html).not.toContain('/Users/example')
  })

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
    expect(html).toContain('<code class="hljs language-typescript">')
    expect(html).toContain('class="hljs-keyword"')
    expect(html).toContain('TypeScript code')
    const document = new Window().document
    document.body.innerHTML = html
    expect(document.querySelector('pre code')?.textContent).toBe(
      'const tag = "<script>example</script>"\nconst greeting = "你好 🌱"\n'
    )
    expect(html).toContain('你好 🌱')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>Topic</th>')
    expect(html).toContain('<td>Preserved</td>')
    expect(html.indexOf('The first point 🦊.')).toBeLessThan(
      html.indexOf('<pre ')
    )
    expect(html.indexOf('<pre ')).toBeLessThan(html.indexOf('<table>'))
    expect(html.indexOf('<table>')).toBeLessThan(
      html.indexOf('The final point.')
    )
    expect(html).not.toContain('<script>')
  })

  it('keeps input text and omitted content in source order with its original role', () => {
    const html = renderMessage('', {
      role: 'user',
      content: [
        { type: 'input_text', text: 'Compare these examples.' },
        { type: 'omitted', kind: 'image', reason: 'not_exposed', count: 2 },
        { type: 'input_text', text: 'Use the attached reference.' },
        { type: 'omitted', kind: 'file', reason: 'unsupported' }
      ]
    })
    expect(html).toContain('aria-label="User, message 1"')
    expect(html).toContain('[2 images omitted]')
    expect(html).toContain('[Attachment omitted]')
    expect(html.indexOf('Compare these examples.')).toBeLessThan(
      html.indexOf('[2 images omitted]')
    )
    expect(html.indexOf('[2 images omitted]')).toBeLessThan(
      html.indexOf('Use the attached reference.')
    )
    expect(html.indexOf('Use the attached reference.')).toBeLessThan(
      html.indexOf('[Attachment omitted]')
    )
    expect(html).not.toMatch(/<(?:img|audio|video|iframe)\b/i)
  })

  it('labels developer messages without treating them as assistant replies', () => {
    const html = renderMessage('Answer with a short explanation.', {
      role: 'developer'
    })
    expect(html).toContain('aria-label="Developer, message 1"')
    expect(html).toContain('data-speaker="developer"')
    expect(html).toContain('Answer with a short explanation.')
  })

  it('renders unknown code languages safely without losing their text', () => {
    const html = renderMessage(
      '```an-unregistered-language\n<literal> & original\n```'
    )
    expect(html).toContain('&lt;literal&gt; &amp; original')
    expect(html).toContain('Copy code')
  })

  it('uses local favicon glyphs without requesting sites in the transcript', () => {
    const html = renderMessage(
      '[GitHub](https://github.com/openai) [Web](https://example.com)'
    )
    expect(html.match(/link-favicon/g)).toHaveLength(2)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('src=')
  })

  it('preserves all activity in closed disclosures and leaves the answer visible', () => {
    const messages = [
      message('codex-0-0', 'user', 'A question'),
      {
        ...message('codex-0-1', 'assistant', 'Public reasoning summary'),
        kind: 'reasoning_summary' as const
      },
      message('codex-0-2', 'assistant', 'A progress update', 'commentary'),
      message('codex-0-3', 'tool', 'Visible tool contribution'),
      message('codex-0-4', 'assistant', 'The full final answer')
    ]
    const html = renderToStaticMarkup(
      createElement(SavedConversation, {
        groups: groupReaderMessages(messages)
      })
    )
    const document = new Window().document
    document.body.innerHTML = html
    const activity = document.querySelector('details')!
    expect(activity.hasAttribute('open')).toBe(false)
    expect(activity.querySelectorAll('article')).toHaveLength(3)
    expect(activity.textContent).toContain('Public reasoning summary')
    expect(document.querySelectorAll('.conversation > article')).toHaveLength(2)
    expect(document.querySelector('#message-5')?.closest('details')).toBeNull()
    expect(document.querySelectorAll('article')).toHaveLength(messages.length)
  })
})
