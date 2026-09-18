import type { Metadata } from 'next'

import { appUrl } from '@/lib/config'
import { publicPageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  const origin = appUrl()
  return publicPageMetadata({
    title: 'Privacy policy',
    description:
      'How Passage handles accounts, public conversations, uploaded artwork, payments and service data.',
    url: `${origin}/privacy`,
    image: { url: `${origin}/brand/social-preview.jpg`, type: 'image/jpeg' },
    type: 'website'
  })
}

export default function PrivacyPage() {
  return (
    <main
      id='main'
      className='mx-auto flex max-w-2xl flex-col gap-10 py-12 sm:py-20'
    >
      <header className='flex flex-col gap-4'>
        <h1 className='text-4xl leading-tight font-medium tracking-tight sm:text-5xl'>
          Privacy policy
        </h1>
        <p className='text-sm text-muted-foreground'>
          Updated September 17, 2026
        </p>
        <p className='leading-relaxed'>
          Passage turns public AI conversations into shareable pages and cards.
          This page explains the information we use to provide that service.
          Contact us at{' '}
          <a
            className='underline underline-offset-4'
            href='mailto:passage@transitivebullsh.it'
          >
            passage@transitivebullsh.it
          </a>{' '}
          with privacy questions or requests.
        </p>
      </header>

      <section
        className='flex flex-col gap-3'
        aria-labelledby='privacy-accounts'
      >
        <h2 id='privacy-accounts' className='text-xl font-medium'>
          Accounts and sign-in
        </h2>
        <p className='leading-relaxed'>
          You can create a passage without registering. We use cookies to keep
          your signed-in or guest session and browser storage to remember your
          preferences. Registered accounts store your name, email address,
          verification status, preferences and sign-in information. Passwords
          are stored as hashes, rather than readable passwords.
        </p>
        <p className='leading-relaxed'>
          Google and GitHub sign-in provide your basic profile and email
          address. We use that information to identify you and manage your
          account. We request identity access only; we do not request access to
          your Gmail, Google Drive or GitHub repositories. Provider credentials
          may be stored with your linked account. We send account verification,
          password recovery and subscription messages through Resend.
        </p>
      </section>

      <section
        className='flex flex-col gap-3'
        aria-labelledby='privacy-passages'
      >
        <h2 id='privacy-passages' className='text-xl font-medium'>
          Conversations and published passages
        </h2>
        <p className='leading-relaxed'>
          When you submit a public conversation link, we retrieve and save its
          content, including supported embedded images, to prepare your passage.
          We send selected conversation text to OpenAI to generate a title and
          highlights. You can edit the result before publishing.
        </p>
        <p className='leading-relaxed'>
          Private drafts, account settings and templates are not publicly
          listed. Publishing makes the saved conversation, title, highlights,
          share card and any included branding available to anyone with its
          passage link. Search engines and social platforms may copy or cache
          public pages and images. Only submit content you have permission to
          share publicly.
        </p>
      </section>

      <section
        className='flex flex-col gap-3'
        aria-labelledby='privacy-artwork'
      >
        <h2 id='privacy-artwork' className='text-xl font-medium'>
          Uploaded artwork and templates
        </h2>
        <p className='leading-relaxed'>
          We store uploaded backgrounds and logos in Cloudflare R2, and save
          your templates and share-card settings with your account. Original
          account uploads use private storage. Their appearance can become
          public when you include them in a published passage. Passage does not
          generate custom background images with AI.
        </p>
      </section>

      <section
        className='flex flex-col gap-3'
        aria-labelledby='privacy-payments'
      >
        <h2 id='privacy-payments' className='text-xl font-medium'>
          Payments
        </h2>
        <p className='leading-relaxed'>
          Stripe handles Checkout, payment methods and billing management. We
          store Stripe customer and subscription identifiers, plan and payment
          status, billing periods and related billing events to provide paid
          access. Your full payment-card details are handled by Stripe and are
          not stored in Passage&apos;s database.
        </p>
      </section>

      <section
        className='flex flex-col gap-3'
        aria-labelledby='privacy-providers'
      >
        <h2 id='privacy-providers' className='text-xl font-medium'>
          Service providers and operational data
        </h2>
        <p className='leading-relaxed'>
          Vercel hosts the application and background preparation workflows;
          Neon stores application data; Cloudflare R2 stores images; OpenAI
          processes summary requests; Resend delivers transactional emails; and
          Stripe processes payments. Google and GitHub provide optional sign-in.
          These providers process the information needed for their respective
          services, which may involve processing outside your country.
        </p>
        <p className='leading-relaxed'>
          We use website analytics, request logs, session metadata and usage
          records to understand site use, troubleshoot problems, prevent abuse
          and enforce allowances and spending limits. These records can include
          page addresses, browser or device information, IP addresses and
          timestamps. We do not sell your account information.
        </p>
      </section>

      <section
        className='flex flex-col gap-3'
        aria-labelledby='privacy-retention'
      >
        <h2 id='privacy-retention' className='text-xl font-medium'>
          Your choices and data retention
        </h2>
        <p className='leading-relaxed'>
          Account settings let you manage linked sign-in methods and delete your
          account. Account deletion removes your profile, private drafts,
          preferences and templates, and disables passages owned by the account.
          Shared conversation snapshots and limited billing, usage and security
          records may remain for service operation, accounting and abuse
          prevention. Backups and service-provider records may also retain
          information beyond deletion from the active application.
        </p>
        <p className='leading-relaxed'>
          Deletion does not recall previously shared content. Public image
          assets may be retained, and cached pages, social previews and other
          copies can remain available. Contact us for help accessing, correcting
          or deleting information, including passages created without an
          account.
        </p>
      </section>
    </main>
  )
}
