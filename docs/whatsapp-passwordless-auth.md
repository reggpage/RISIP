# WhatsApp passwordless web authentication

The public web app no longer asks for email or password. A visitor enters a
WhatsApp number on `/login` or `/signup`; the Vercel function at
`/api/auth/whatsapp/request` responds identically for linked and unlinked
numbers so it cannot be used as an account directory.

## Linked number

1. The endpoint rate-limits an HMAC of the phone and source IP.
2. `wa_issue_login_token` creates a single-use, five-minute token and supersedes
   older unused tokens.
3. Meta sends the approved `risip_login_link` template with the full
   `https://risip.online/wa-login?t=...` URL as body parameter 1.
4. `/wa-login` consumes the token and exchanges a Supabase magic-link hash for a
   browser session. The user never sees or sets an email password.

Suggested template copy:

> Your secure Risip sign-in link is {{1}}. Open it within five minutes. It works
> once. Do not share it with anyone.

The Swahili version should carry the same meaning. The approved template's
language codes must match the values used by Meta (`en_US` and `sw`).

## New number

The endpoint creates only a short-lived `whatsapp_onboarding` row. It does not
create an orphan auth user or profile. Meta sends the approved
`risip_start_onboarding` template asking the person to reply. Their reply enters
the existing language → create/join business → person name flow. Auth user,
profile, membership and identity are created together only when onboarding has
enough information.

Suggested template copy:

> Welcome to Risip. Reply to this message to choose a language and register your
> business or join one you were invited to.

## Floating WhatsApp button

The button uses `VITE_RISIP_WHATSAPP_NUMBER` and opens a `wa.me` link. On mobile
it opens the WhatsApp app; on desktop it opens WhatsApp Web. The message is
prefilled but is never sent automatically—the person reviews it and taps Send.
That user-initiated message also opens Meta's 24-hour customer-service window,
so normal webhook replies do not require a template.

## Required server configuration

See `.env.example`. In addition, both Meta templates must be approved before the
Vercel endpoint is enabled. Never put the service-role key, Meta access token or
rate-limit secret in a `VITE_*` variable.
