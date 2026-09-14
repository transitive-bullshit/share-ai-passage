// @vitest-environment happy-dom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { CopyLink } from '../components/copy-link'
import { SavedMessage } from '../components/saved-message'
import { message } from '../lib/messages'

let container: HTMLDivElement
let root: Root
const writeText = vi.fn<Clipboard['writeText']>()

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  writeText.mockReset().mockResolvedValue()
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function render(markdown: string) {
  await act(async () =>
    root.render(
      createElement(SavedMessage, {
        message: message('answer', 'assistant', markdown),
        index: 0
      })
    )
  )
}

async function copy(label: string) {
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
      .click()
  )
}

it('copies code with indentation and literal characters, without highlighting markup', async () => {
  const code = 'const greeting = "<hello> 🌱"\n  console.log(greeting)'
  await render(`\`\`\`typescript\n${code}\n\`\`\``)
  await copy('Copy code')
  expect(writeText).toHaveBeenCalledWith(code)
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Copied to clipboard'
  )
})

it('copies table rows as TSV, retaining cell text without Markdown or favicon glyphs', async () => {
  await render(
    '| Stack | Example |\n| --- | --- |\n| **Typed** | `const a = 1` |\n| Links | [Docs](https://example.com) |'
  )
  await copy('Copy table')
  expect(writeText).toHaveBeenCalledWith(
    'Stack\tExample\nTyped\tconst a = 1\nLinks\tDocs'
  )
})

it('keeps the code readable and gives recovery guidance when clipboard access fails', async () => {
  writeText.mockRejectedValue(new Error('Clipboard denied'))
  await render('```text\nAn original code example\n```')
  await copy('Copy code')
  expect(container.querySelector('pre code')?.textContent).toBe(
    'An original code example\n'
  )
  expect(container.querySelector('[role="status"]')?.textContent).toBe(
    'Couldn’t copy. Select and copy the text.'
  )
  expect(container.textContent).not.toContain('Copied to clipboard')
})

it('confirms a copied passage inside the button without inserting a status row', async () => {
  const url = 'https://passage.example/chatgpt/example'
  await act(async () => root.render(createElement(CopyLink, { url })))
  await act(async () => container.querySelector('button')!.click())
  expect(writeText).toHaveBeenCalledWith(url)
  expect(container.querySelector('button')?.textContent).toBe('Link copied')
  expect(container.querySelector('[role="status"]')?.textContent || '').toBe('')
  expect(container.querySelector('.copy-control')?.textContent).toBe(
    'Link copied'
  )
})

it('offers a manual passage link when copying fails and clears it after a successful retry', async () => {
  const url = 'https://passage.example/chatgpt/example'
  writeText.mockRejectedValueOnce(new Error('Clipboard denied'))
  await act(async () => root.render(createElement(CopyLink, { url })))
  await act(async () => container.querySelector('button')!.click())
  expect(container.querySelector('input')?.value).toBe(url)
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    'copy it manually'
  )
  await act(async () => container.querySelector('button')!.click())
  expect(container.querySelector('input')).toBeNull()
  expect(container.querySelector('.copy-control')?.textContent).toBe(
    'Link copied'
  )
})
