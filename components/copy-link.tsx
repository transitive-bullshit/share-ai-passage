'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className='copy-control'>
      <Button variant='outline' onClick={copy}>
        {copied ? (
          <Check data-icon='inline-start' />
        ) : (
          <Copy data-icon='inline-start' />
        )}
        {copied ? 'Link copied' : 'Copy share link'}
      </Button>
      <span role='status' aria-live='polite'>
        {failed
          ? 'Select the link below to copy it manually.'
          : copied
            ? 'Copied to clipboard.'
            : ''}
      </span>
      {failed ? (
        <Input
          aria-label='Share link to copy'
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
        />
      ) : null}
    </div>
  )
}
