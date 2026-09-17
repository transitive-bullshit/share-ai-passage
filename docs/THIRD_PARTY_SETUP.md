# Third-party setup checklist

September 14, 2026. Companion to the [implementation handoff](ACCOUNTS_PAID_FEATURES_PLAN.md). The user can prepare accounts, DNS and credentials now, including prerequisites for Phase 2. Application implementation still runs accounts first, pauses for feedback, and only then begins billing/paid integration. This checklist is setup guidance, not a claim that these external resources have been provisioned.

Scope updated September 17: paid customization uses uploaded artwork and templates; image generation and image packs have been removed. Current provisioned resources and remaining launch checks are recorded in [paid review](PAID_REVIEW.md) and [production guidance](PRODUCTION.md).

The current repository records production at `https://www.share-ai-passage.com`, with the apex redirecting there. Use the www origin for production OAuth callbacks. Neon, Vercel and OpenAI are already part of the project; reuse those accounts. Better Auth runs in the application and needs no separate hosted authentication-service account. The email-provider default in the handoff is Resend unless an existing configured sender is reused.

## Start now: accounts prerequisites

### 1. Resend — verification and password-reset emails

- Create/use a Resend account and add the sending subdomain `accounts.share-ai-passage.com`.
- Add the exact DNS records Resend provides for SPF/DKIM verification. Preserve existing mail records. Follow Resend's DNS-only instruction for verification CNAMEs if DNS is on Cloudflare.
- Recommended sender: `Passage <hello@accounts.share-ai-passage.com>`. This is a proposed sender, not an existing mailbox. Receiving email is not needed to send account emails; use a monitored existing address as Reply-To when configured.
- Create separate development/production API keys with Sending access restricted to this domain. Keep authentication-email click/open tracking disabled.
- Save the API key and sender address privately. DNS verification can take time, so this is a useful first task.

[Resend domain setup](https://resend.com/docs/add-a-domain), [key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key), [domain and tracking guidance](https://resend.com/docs/dashboard/domains/introduction).

### 2. Google Cloud / Google Auth Platform — Google sign-in

Create a Passage project, configure an External audience and Passage app branding, and create an OAuth client of type **Web application**. Use a monitored support/contact email and authorized domain `share-ai-passage.com`. If a JavaScript origin is requested, use `https://www.share-ai-passage.com`.

Production authorized redirect URI:

```text
https://www.share-ai-passage.com/api/auth/callback/google
```

Use identity-only scopes (`openid`, `email`, `profile`). No Gmail/Drive permissions are needed. Save the client ID and secret. Production and development/test OAuth environments belong in separate projects; development redirect details follow the local/staging origin selected during implementation. Production audience/publishing and branding requirements must be checked before public launch.

[Better Auth Google setup](https://better-auth.com/docs/authentication/google), [Google production environment policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [branding](https://support.google.com/cloud/answer/15549049).

### 3. GitHub — GitHub sign-in

In **Settings → Developer settings → OAuth apps**, register an OAuth App named Passage. Use homepage `https://www.share-ai-passage.com` and this authorization callback:

```text
https://www.share-ai-passage.com/api/auth/callback/github
```

Save its client ID and client secret. Use a separate development app for environment isolation. Basic identity/email access is sufficient; do not grant repository permissions for sign-in. Current GitHub documentation allows up to ten callback URLs, so separate apps are an isolation recommendation, not a single-callback limitation.

[GitHub OAuth App registration](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [Better Auth GitHub setup](https://better-auth.com/docs/authentication/github).

### Development/staging callback details

Production credentials alone do not make local sign-in work. Register exact callbacks against the origin chosen when the app starts. This repository normally uses Portless and can produce worktree-specific hostnames, so do not invent its origin. A deliberately selected direct local run can use `http://localhost:3000/api/auth/callback/google` and `/github`. Use a stable HTTPS staging origin for shared feedback when required. Arbitrary Vercel preview hosts cannot use a wildcard Google redirect registration. [Google redirect validation](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

## Prepare now if convenient: paid-phase prerequisites

### 4. Stripe — subscriptions

Create/use the intended business's Stripe account, complete business/payout onboarding, and set recognizable Passage public business/support details. Create/select an isolated development sandbox. Actual merchant country and account fees must inform the later margin check; USD plan prices do not establish the merchant's jurisdiction.

Configure Plus/Pro monthly and annual prices, Checkout, Portal and webhooks so their IDs and handlers match the application. The sandbox integration is implemented; live configuration remains rollout work. There are no image-pack purchases. A webhook signing secret is separate from API credentials. Runtime credentials should have the permissions the integration needs and remain separate for sandbox/live use.

[Stripe account setup](https://docs.stripe.com/get-started/account/set-up), [sandbox and API keys](https://docs.stripe.com/keys).

### 5. Cloudflare R2 — use the existing account

Create dedicated Standard-class buckets if you want them ready: suggested names `passage-public` and `passage-private`. The names are proposals; record the actual names if different. Keep both unexposed during preparation. The private bucket must never get a public domain or public `r2.dev` access. Separate development storage will be used during integration.

Create R2 S3 credentials with **Object Read & Write**, scoped to the selected Passage buckets. Save the Access Key ID, Secret Access Key, account ID/S3 endpoint and bucket names. These S3 credentials are distinct from a general Cloudflare API token. [R2 S3 setup](https://developers.cloudflare.com/r2/get-started/s3/).

Reserve `assets.share-ai-passage.com` as the proposed delivery domain for the public bucket. Connect it during integration once public/private routing is verified. R2's custom-domain route requires the domain's zone in the same Cloudflare account. If it is not already there, record that dependency for the implementation instead of making an incidental nameserver migration now. `r2.dev` is for development, not production delivery. [R2 public domains](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Credential handoff

Store secrets in the appropriate Vercel environment, a password manager, or ignored private local configuration; do not paste them into chat or commit them. Production secrets stay out of preview/development environments. Report completion using resource names, domains and status only.

| Needed for accounts     | Planned application setting                |
| ----------------------- | ------------------------------------------ |
| Google client ID/secret | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub client ID/secret | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Resend sending key      | `RESEND_API_KEY`                           |
| Chosen sender           | `RESEND_FROM_EMAIL`                        |
| Optional reply address  | `RESEND_REPLY_TO`                          |

The accounts implementation reads these settings. Configure the Better Auth secret and environment-specific base URL; see the [production guide](PRODUCTION.md) for current provider setup status and the [local HTTPS instructions](../contributing.md#google-sign-in-with-local-https) for Google development with Portless. Keep the existing `APP_SECRET` stable. Stripe/R2 runtime configuration is implemented; use the [environment example](../.env.example) and [paid-service setup](PRODUCTION.md#paid-services-and-launch-gate) for current variables and permissions. Keep development and production credentials separate.

There is no need to sign up for another image provider, a separate auth SaaS, or a separate workflow vendor. The [paid-feature review](PAID_REVIEW.md) records completed development checks and the remaining image qualification and hosted Workflow gates; the pending 25-call qualification batch still requires the approval already requested.
