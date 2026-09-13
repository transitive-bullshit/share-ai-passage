import { ArrowUpRight, Check, Link2, Terminal } from 'lucide-react'
import Image from 'next/image'

import { brand } from '@/lib/brand'
import landscape from '@/public/images/passage-landscape.png'

export function LandingDetails() {
  return (
    <>
      <figure className='hero-example' aria-label='Example passage'>
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
          <div className='example-window'>
            <div className='example-toolbar'>
              <span className='window-dots' aria-hidden='true'>
                <i />
                <i />
                <i />
              </span>
              <span>
                <Link2 size={12} aria-hidden='true' /> A passage
              </span>
              <span className='example-label'>Preview</span>
            </div>
            <img
              src='/api/example-card'
              width={1200}
              height={630}
              alt='Example passage card: Make room for the unexpected, with three concise conversation highlights'
              fetchPriority='high'
            />
            <div className='example-window-footer'>
              <span>
                <Check size={14} aria-hidden='true' /> The saved conversation
                comes with it.
              </span>
              <ArrowUpRight size={16} aria-hidden='true' />
            </div>
          </div>
        </div>
        <figcaption>
          A clear introduction. The saved conversation, one click away.
        </figcaption>
      </figure>

      <section
        className='provider-section'
        aria-label='Supported conversation providers'
      >
        <p>Bring the conversation from wherever it started.</p>
        <div className='provider-list'>
          <span>
            <img src='/providers/chatgpt.svg' width={24} height={24} alt='' />{' '}
            ChatGPT
          </span>
          <span>
            <img src='/providers/codex.svg' width={24} height={24} alt='' />{' '}
            Codex
          </span>
          <span>
            <img src='/providers/claude.svg' width={24} height={24} alt='' />{' '}
            Claude
          </span>
        </div>
      </section>

      <section
        className='how-it-works'
        id='how-it-works'
        aria-labelledby='how-heading'
      >
        <div className='section-intro'>
          <h2 id='how-heading'>
            The good part,
            <br />
            right up front.
          </h2>
          <p>
            A long conversation can start with one good idea. Help someone else
            find it.
          </p>
        </div>
        <ol className='process-list'>
          <li>
            <span className='step-number'>01</span>
            <div>
              <h3>Bring a conversation.</h3>
              <p>
                Paste a public ChatGPT, Codex, or Claude link. We’ll read the
                conversation and find its main ideas.
              </p>
            </div>
          </li>
          <li>
            <span className='step-number'>02</span>
            <div>
              <h3>Give it a clear introduction.</h3>
              <p>
                Get a concise title, a few AI-generated highlights, and a share
                card. Review everything before it goes live.
              </p>
            </div>
          </li>
          <li>
            <span className='step-number'>03</span>
            <div>
              <h3>Send a link worth opening.</h3>
              <p>
                Publish your passage with the saved conversation. The context
                travels with the idea.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section
        className='agents-section'
        id='for-agents'
        aria-labelledby='agents-heading'
      >
        <div className='section-intro'>
          <h2 id='agents-heading'>
            For you.
            <br />
            And your agents.
          </h2>
          <p>
            Create a passage here, from your terminal, or with an agent skill.
            The same simple flow, wherever you’re working.
          </p>
          <a className='text-link' href='#source-url'>
            {brand.cta} <ArrowUpRight size={15} aria-hidden='true' />
          </a>
        </div>
        <div className='terminal-example'>
          <div className='terminal-heading'>
            <Terminal size={15} aria-hidden='true' />
            <span>From your local checkout</span>
          </div>
          <pre>
            <code>
              <span className='terminal-prompt'>$</span> pnpm share{' '}
              <span className='terminal-argument'>
                &quot;&lt;public-chat-url&gt;&quot;
              </span>
            </code>
          </pre>
          <div className='terminal-output'>
            <p>
              <Check size={14} aria-hidden='true' /> Read the conversation
            </p>
            <p>
              <Check size={14} aria-hidden='true' /> Prepare a title and
              highlights
            </p>
            <p>
              <Check size={14} aria-hidden='true' /> Preview, then publish
            </p>
          </div>
          <div className='terminal-footer'>
            Also available as the <code>passage-share</code> agent skill.
          </div>
        </div>
      </section>
    </>
  )
}
