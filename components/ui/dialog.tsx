'use client'

import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

function DialogContent({
  className,
  children,
  overlayClassName,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot='dialog-overlay'
        className={cn('fixed inset-0 z-50 bg-black/50', overlayClassName)}
      />
      <DialogPrimitive.Content
        data-slot='dialog-content'
        className={cn(
          'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 outline-none',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot='dialog-close'
          className='absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current focus-visible:outline-none'
        >
          <XIcon size={16} aria-hidden='true' />
          <span className='sr-only'>Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription }
