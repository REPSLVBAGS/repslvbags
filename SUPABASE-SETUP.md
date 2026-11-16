# Supabase Setup — Reps LV Bags

The site runs fully on localStorage without Supabase. To enable cloud sync,
real email delivery to **supportrepslvbags@gmail.com**, and private screenshot
storage, complete the steps below.

> **No credentials belong in the website files.** All secrets live in Supabase
> Edge Function environment variables (server-side only).

## 1. Create a Supabase project
1. Go to https://supabase.com → **New Project**
2. Wait for provisioning, then open **Project Settings → API**
3. Copy **Project URL** and **anon public key**

## 2. Run the database schema
1. Open **SQL Editor** → paste the contents of `supabase-schema.sql` → **Run**
2. This creates the `orders` table, `email_log` table, and the private
   `payment-evidence` storage bucket with RLS policies.

## 3. Configure the site
Open `supabase.js` and paste your values:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
const EMAIL_SECRET = 'a-long-random-string-you-choose'; // e.g. openssl rand -hex 32
```

`EMAIL_SECRET` is a shared secret between the browser and the Edge Function —
it prevents strangers from triggering emails through your function. It is NOT
a password; it only gates who may invoke the function.

## 4. Deploy the email Edge Function
The function lives in `supabase/functions/send-email/index.ts` and sends via
**Resend** (https://resend.com).

1. Install the CLI: `npm i -g supabase`
2. `supabase login`
3. `supabase link --project-ref YOUR_PROJECT_REF`
4. `supabase functions deploy send-email`
5. Set the secrets:

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
supabase secrets set EMAIL_FROM="Reps LV Bags <orders@yourdomain.com>"
supabase secrets set EMAIL_SECRET="the-same-string-as-supabase.js"
```

### About the sender address (EMAIL_FROM)
- **Testing:** Resend lets you send from `onboarding@resend.dev` immediately,
  but ONLY to the email address you signed up to Resend with. Good for a first
  test, not for production.
- **Production:** verify a domain you own in Resend (add the DNS records they
  provide), then set `EMAIL_FROM` to an address on that domain, e.g.
  `Reps LV Bags <orders@repslvbags.com>`.
- **Important:** the Gmail address `supportrepslvbags@gmail.com` is the
  RECIPIENT of all notifications. Gmail cannot be used as the sender through
  Resend — you need a verified domain (or Resend's test sender).

## 5. What gets emailed automatically
All of these go to **supportrepslvbags@gmail.com** with unique references:

| Event | Subject format |
|---|---|
| New order | `NEW ORDER – #ORD-4821` |
| Payment evidence submitted | `PAYMENT EVIDENCE – #ORD-4821` |
| Contact form | `CUSTOMER MESSAGE – #MSG-4821` |
| Product inquiry | `CUSTOMER INQUIRY – #INQ-4821` |
| Support request | `CUSTOMER SUPPORT – #SUP-4821` |
| Newsletter signup | `NEWSLETTER SIGNUP – #NEWS-4821` |

Order notifications include every customer/order field as labeled rows plus a
`_replyto` set to the customer's email, so you can reply directly from Gmail.
When Supabase + Resend is configured, the new-order email is sent as a
professional branded HTML layout (with plain-text fallback).

Customer-facing emails (order confirmation, payment instructions, shipping
updates) go to the customer's own email address.

## 6. Until Supabase is configured — FormSubmit fallback

Business notifications (new orders, payment evidence, contact messages,
newsletter signups) automatically fall back to **FormSubmit.co** when Supabase
isn't configured, so they reach supportrepslvbags@gmail.com without any
account setup.

**One-time activation required:** FormSubmit sent an "Activate Form" email to
supportrepslvbags@gmail.com — open it and click the activation link ONCE.
After that, every notification delivers automatically.

Notes:
- Test from a web server or your deployed/preview URL (not a double-clicked
  HTML file) — FormSubmit requires a proper `Origin` header, which browsers
  send automatically.
- The fallback applies ONLY to notifications addressed to
  supportrepslvbags@gmail.com. Customer-facing emails (order confirmations,
  payment instructions, shipping updates) still require the Supabase + Resend
  setup below to actually reach customers.
- Every email is also stored in the local `vr_email_log` (localStorage) and
  printed to the browser console as a backup record.

## Security notes
- The anon key is safe to expose (RLS governs access)
- `RESEND_API_KEY` and `EMAIL_SECRET` exist ONLY as Supabase secrets — never
  commit them to the repo or paste them into frontend files
- The `send-email` function requires the `x-email-secret` header and validates
  all inputs before sending
- Order notifications are idempotent (`emailsSent` flags) — refreshing the
  checkout page cannot send duplicates
