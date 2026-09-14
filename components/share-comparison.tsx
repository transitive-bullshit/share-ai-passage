import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'

import { featuredExample } from '@/lib/marketing-examples'
import landscape from '@/public/images/passage-landscape.png'

// X logo: https://about.x.com/en/who-we-are/brand-toolkit
// Repost path verified against X's post controls on September 14, 2026.
function PostFrame({ children }: { children: ReactNode }) {
  return (
    <div className='comparison-feed'>
      <div aria-hidden='true'>
        <div className='comparison-feed-top'>
          <svg viewBox='0 0 1200 1227' fill='currentColor' aria-hidden='true'>
            <path d='M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z' />
          </svg>
          <span>For you</span>
          <span className='comparison-following'>Following</span>
          <span className='comparison-dots'>···</span>
        </div>
        <div className='comparison-ambient' aria-hidden='true'>
          <div className='comparison-small-avatar'></div>
          <div className='comparison-ghost-copy'>
            <b>Design notebook</b>
            <p>A few things I learned from building this week.</p>
            <div className='comparison-ghost-lines'></div>
          </div>
        </div>
      </div>
      <div className='comparison-post'>
        <div aria-hidden='true'>
          <header>
            <span className='comparison-avatar'>J</span>
            <div>
              <strong>Jamie</strong>
              <span className='comparison-handle'>@jamie · 2h</span>
            </div>
            <span className='comparison-post-more'>···</span>
          </header>
        </div>
        {children}
        <div className='comparison-actions' aria-hidden='true'>
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
          >
            <path d='M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z' />
          </svg>
          <svg viewBox='0 0 24 24' fill='currentColor'>
            <path d='M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z' />
          </svg>
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
          >
            <path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z' />
          </svg>
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
          >
            <path d='M5 20V10m5 10V4m5 16v-8m5 8V7' />
          </svg>
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
          >
            <path d='M6 4h12v17l-6-4-6 4V4Z' />
          </svg>
          <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.6'
          >
            <path d='M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7' />
          </svg>
        </div>
      </div>
      <div className='comparison-ambient' aria-hidden='true'>
        <div className='comparison-small-avatar'></div>
        <div className='comparison-ghost-copy'>
          <b>Alex Morgan</b>
          <p>The details make all the difference.</p>
          <div className='comparison-ghost-lines'></div>
        </div>
      </div>
    </div>
  )
}

export function ShareComparison() {
  return (
    <section
      className='hero-example'
      aria-labelledby='share-comparison-heading'
    >
      <h2 className='comparison-heading' id='share-comparison-heading'>
        Same chat. A better first impression.
      </h2>
      <div className='showcase-landscape'>
        <Image
          className='showcase-artwork'
          src={landscape}
          alt=''
          fill
          sizes='(max-width: 760px) calc(100vw - 36px), (max-width: 1200px) calc(100vw - 56px), 1120px'
          placeholder='blur'
          loading='eager'
        />
        <div className='comparison-pair'>
          <div>
            <h3 className='comparison-label'>
              <span className='comparison-badge'>Before</span>
              <span>A generic chat link</span>
            </h3>
            <PostFrame>
              <div className='comparison-preview comparison-compact-preview'>
                <div className='comparison-generic-icon' aria-hidden='true'>
                  <svg
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2.2'
                  >
                    <rect x='3' y='2.5' width='18' height='19' rx='3' />
                    <path d='M7 7h5v5H7zM15 7h3M15 11h3M7 16h11' />
                  </svg>
                </div>
                <div className='comparison-generic-meta'>
                  <small>chatgpt.com</small>
                  <strong>Check out this chat</strong>
                  <p>Here's a chat someone thought you'd want to see.</p>
                </div>
              </div>
            </PostFrame>
          </div>
          <div className='comparison-after'>
            <h3 className='comparison-label'>
              <span className='comparison-badge'>With Passage</span>
              <span>A reason to open it</span>
            </h3>
            <PostFrame>
              <Link
                className='comparison-preview'
                href={featuredExample.shareUrl}
                aria-label={`Read the example passage: ${featuredExample.title}`}
              >
                <img
                  className='comparison-card'
                  src={`/examples/${featuredExample.id}/image`}
                  width={1200}
                  height={630}
                  alt={`Passage card: ${featuredExample.title}. ${featuredExample.highlights.join('. ')}`}
                  fetchPriority='high'
                />
              </Link>
            </PostFrame>
          </div>
        </div>
      </div>
      <p className='comparison-note'>
        Illustrative X posts. ChatGPT preview based on a real shared link.
      </p>
    </section>
  )
}
