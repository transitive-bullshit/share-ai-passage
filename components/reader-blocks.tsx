'use client'

import { Check, ChevronDown, Copy, Maximize2, Minimize2 } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

function CopyContent({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  useEffect(() => {
    if (status === 'idle') return
    const timeout = setTimeout(() => setStatus('idle'), 2500)
    return () => clearTimeout(timeout)
  }, [status])
  return (
    <span className='reader-copy'>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setStatus('copied')
          } catch {
            setStatus('error')
          }
        }}
      >
        {status === 'copied' ? (
          <Check data-icon='inline-start' />
        ) : (
          <Copy data-icon='inline-start' />
        )}
        {status === 'copied' ? 'Copied' : 'Copy'}
      </Button>
      <span
        className={status === 'error' ? 'copy-error' : 'sr-only'}
        role='status'
      >
        {status === 'error'
          ? 'Couldn’t copy. Select and copy the text.'
          : status === 'copied'
            ? 'Copied to clipboard'
            : ''}
      </span>
    </span>
  )
}

export function CodeBlock({
  children,
  text,
  language
}: {
  children: ReactNode
  text: string
  language: string
}) {
  return (
    <div className='code-block'>
      <div className='code-toolbar'>
        <span>{language}</span>
        <CopyContent text={text} label='Copy code' />
      </div>
      <pre tabIndex={0} aria-label={`${language} code`}>
        {children}
      </pre>
    </div>
  )
}

export function TableBlock({
  children,
  text
}: {
  children: ReactNode
  text: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = () =>
      setOverflows(element.scrollWidth > element.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div className='table-block' data-expanded={expanded}>
      <div className='table-toolbar'>
        {overflows ? (
          <span className='table-scroll-hint'>Scroll to see more →</span>
        ) : null}
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='table-expand'
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <Minimize2 data-icon='inline-start' />
          ) : (
            <Maximize2 data-icon='inline-start' />
          )}
          {expanded ? 'Restore width' : 'Expand table'}
        </Button>
        <CopyContent text={text} label='Copy table' />
      </div>
      <div
        className='table-scroll'
        ref={scroller}
        id={id}
        role='region'
        aria-label='Scrollable table'
        tabIndex={0}
      >
        <table>{children}</table>
      </div>
    </div>
  )
}

export function UserMessageContent({
  children,
  initiallyCollapsed = false
}: {
  children: ReactNode
  initiallyCollapsed?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(initiallyCollapsed)
  const content = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    const element = content.current
    if (!element) return
    const measure = () => setOverflows(element.scrollHeight > 352)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      className='user-message-content'
      data-expanded={expanded}
      data-collapsible={overflows}
    >
      <noscript>
        <style>
          {
            '.user-message-text { max-height: none !important; mask-image: none !important } .user-message-toggle { display: none !important }'
          }
        </style>
      </noscript>
      <div id={id} ref={content} className='user-message-text'>
        {children}
      </div>
      {overflows ? (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='user-message-toggle'
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : 'Show more'}
          <ChevronDown data-icon='inline-end' />
        </Button>
      ) : null}
    </div>
  )
}
