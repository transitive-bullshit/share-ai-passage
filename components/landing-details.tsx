import { ArrowUpRight, Check, Link2, Terminal } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { brand } from '@/lib/brand'
import { featuredExample } from '@/lib/marketing-examples'
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
          <Link
            className='example-window'
            href={`/examples/${featuredExample.id}`}
            aria-label={`Read the example passage: ${featuredExample.title}`}
          >
            <div className='example-toolbar'>
              <span className='window-dots' aria-hidden='true'>
                <i />
                <i />
                <i />
              </span>
              <span>
                <Link2 size={12} aria-hidden='true' /> Example passage
              </span>
              <span className='example-label'>Read it ↗</span>
            </div>
            <img
              src={`/examples/${featuredExample.id}/image`}
              width={1200}
              height={630}
              alt={`Example passage card: ${featuredExample.title}`}
              fetchPriority='high'
            />
            <div className='example-window-footer'>
              <span>
                <Check size={14} aria-hidden='true' /> Read the passage
              </span>
              <ArrowUpRight size={16} aria-hidden='true' />
            </div>
          </Link>
        </div>
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
                Edit the generated title and highlights, then choose from five
                card styles. Review everything before it goes live.
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
          <a
            className='text-link'
            href={`${brand.repositoryUrl}/blob/main/contributing.md#cli-and-agent-skill`}
          >
            Set up the CLI or agent skill
            <ArrowUpRight size={15} aria-hidden='true' />
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
            Also available as the{' '}
            <a
              href={`${brand.repositoryUrl}/tree/main/.agents/skills/passage-share`}
            >
              <code>passage-share</code> agent skill
            </a>
            .
          </div>
        </div>
      </section>

      <section className='help-section' aria-labelledby='help-heading'>
        <div className='section-intro'>
          <h2 id='help-heading'>A little context.</h2>
          <p>
            Public conversations, a preview you control, and a clear link back
            to the source.
          </p>
        </div>
        <dl className='help-list'>
          <div id='public-link-help'>
            <dt>How do I get a public conversation link?</dt>
            <dd>
              Use the Share option in ChatGPT, Codex, or Claude to create a
              public link, then paste it here. A private conversation address or
              workspace-only link won’t work. Check that the source opens while
              signed out.
            </dd>
          </div>
          <div>
            <dt>What will my passage include?</dt>
            <dd>
              A title and highlights you can edit, your chosen card style, and
              the saved conversation text with a link to the original. Code,
              tables, and formatting are preserved where supported. Missing
              media, tools, and artifacts are marked. Anyone with the passage
              link can read it; public passages can appear in search results.
            </dd>
          </div>
          <div>
            <dt>Can I edit or remove it later?</dt>
            <dd>
              Review your wording before publishing; published passages stay
              fixed. To disable a passage, remove public access to the original
              and use “Check original availability” in the reader. Confirmed
              removal disables its passages and cards here. Checks are limited
              to once an hour, and other platforms may retain previews they
              already fetched.
            </dd>
          </div>
        </dl>
      </section>
    </>
  )
}
