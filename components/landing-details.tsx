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
            href={featuredExample.shareUrl}
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
            Install the Passage skill, then ask your agent to turn a public
            conversation into a passage. Preview first. Publish when you’re
            ready.
          </p>
          <a
            className='text-link'
            href={`${brand.repositoryUrl}/blob/main/contributing.md#cli-and-agent-skill`}
          >
            Set up the agent skill
            <ArrowUpRight size={15} aria-hidden='true' />
          </a>
        </div>
        <div className='terminal-example'>
          <div className='terminal-heading'>
            <Terminal size={15} aria-hidden='true' />
            <span>Install the agent skill</span>
          </div>
          <pre>
            <code>
              <span className='terminal-prompt'>$</span> npx skills add{' '}
              <span className='terminal-argument'>
                transitive-bullshit/share-ai-passage --skill passage-share
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
            Then ask your agent to use{' '}
            <a
              href={`${brand.repositoryUrl}/tree/main/.agents/skills/passage-share`}
            >
              <code>passage-share</code>
            </a>{' '}
            with a public conversation link.
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
              Choose Share in ChatGPT, Codex, or Claude, then paste the public
              link here. Check that it opens without signing in.
            </dd>
          </div>
          <div>
            <dt>What will my passage include?</dt>
            <dd>
              A share card, title, highlights, and saved conversation with a
              link to the original. Anyone can read it, and it may appear in
              search results.
            </dd>
          </div>
          <div>
            <dt>Can I edit or remove it later?</dt>
            <dd>
              You can’t edit a published passage. To remove it, stop sharing the
              original conversation. Passage disables its copy once removal is
              confirmed. Previews on other sites may remain.
            </dd>
          </div>
        </dl>
      </section>
    </>
  )
}
