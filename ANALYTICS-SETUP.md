# Analytics Dashboard — Setup & Deployment

Private, real-time e-commerce analytics for Reps LV Bags at **`/admin/analytics`**.

## Architecture

| Piece | File | Role |
|---|---|---|
| Storefront tracker | `tracker.js` | Anonymous event collection on all customer pages |
| Events table | `supabase/analytics-schema.sql` | `analytics_events` + `analytics_visitors` (RLS locked) |
| Event collector | `supabase/functions/analytics-ingest` | Public, rate-limited, validated writes |
| Admin read API | `supabase/functions/analytics-query` | Admin-JWT only; returns events + orders |
| Order events | `sync-order`, `admin-orders` (patched) | Authoritative `order_created` / `payment_*` events |
| Dashboard | `admin/analytics.html` `.css` `dashboard.js` | Dark admin UI, Supabase Auth login, Realtime feed |

## One-time Supabase setup

1. **Run the schema** — Supabase Dashboard → SQL Editor → paste
   `supabase/analytics-schema.sql` → Run. (Run `supabase-schema.sql` first if not already done.)

2. **Deploy the functions**
   ```bash
   supabase link --project-ref wetxlhacaeakstqwqtdh
   supabase functions deploy analytics-ingest
   supabase functions deploy analytics-query
   supabase functions deploy sync-order
   supabase functions deploy admin-orders
   ```
   (`sync-order` and `admin-orders` were modified — redeploy both.)

3. **Admin login** — the dashboard uses the SAME Supabase Auth account as the
   existing admin panel (`admin@repslvbags.com` or whatever user you created in
   Supabase Auth). The `ADMIN_EMAIL` secret/env on the functions must match that
   email (default `admin@repslvbags.com`). Set it if different:
   ```bash
   supabase secrets set ADMIN_EMAIL=you@yourdomain.com
   ```

## How tracking works

- `tracker.js` loads on every customer-facing page (added before `</body>`).
  It generates an anonymous `visitor_id` (persistent localStorage UUID) and
  `session_id` (per-tab sessionStorage UUID) — **page refreshes do not create
  new visitors**; a `visit` event fires once per session.
- It wraps the existing `trackEvent()` (GA4/Meta helper) so every existing
  storefront call — `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`,
  `Search` — is mirrored into first-party analytics. Cart removals are captured
  via a delegated click listener on `[data-rm]`.
- Events batch (5s / 10 events) and flush via `fetch keepalive` on
  `pagehide`/`visibilitychange`. Tracking fails silently — the storefront is
  never blocked or broken by analytics.
- **Consent:** if a visitor clicks "Decline" on the cookie banner
  (`vr_analytics_consent=no`), first-party tracking is disabled entirely.
- No cookies, no fingerprinting, no PII. Only event type, page, product name,
  anonymous IDs, referrer host, device class, and UTM params are stored.

## Revenue & payment truth

Client-side `Purchase`/`checkout_complete` events are recorded for funnel
analysis but **never counted as revenue**. Revenue comes only from the
`orders` table where `payment_status = 'Paid'` — which can only be set through
the existing admin verification workflow (`verifyPayment` / admin-orders).
Authoritative events are emitted server-side:

- `order_created` — first time an order_no appears in `sync-order`
- `payment_submitted` — transition to `Evidence Submitted`/`Pending Verification`
- `payment_verified` — transition to `Paid`
- `payment_rejected` — transition to `Rejected`

These event types are **rejected** by `analytics-ingest` if sent by a client.

## Abandoned carts / checkouts

Computed server-data-side in the dashboard: a session is "abandoned" when its
last activity is older than the configured threshold (default **30 min**,
Settings page) and it has no downstream step:

- **Abandoned cart** — `add_to_cart` but no `checkout_start`
- **Abandoned checkout** — `checkout_start` but no `checkout_complete`

Temporary navigation/reloads don't trigger abandonment because the threshold
is based on session inactivity, not page events.

## Deployment (Netlify)

The site is static — no build step. `admin/analytics.html` is served at
`/admin/analytics` automatically by Netlify's pretty-URL handling (also works
at `/admin/analytics.html`).

1. Commit and push (or drag-drop deploy) the folder — `admin/`, `tracker.js`,
   and the updated HTML files are included automatically.
2. No `netlify.toml` required. Optionally add `_headers` if you want extra
   hardening, e.g.:
   ```
   /admin/*
     X-Robots-Tag: noindex, nofollow
   ```
3. The dashboard is NOT linked anywhere in the storefront. Access it directly
   at `/admin/analytics`. All data endpoints require a valid admin JWT —
   anonymous visitors get `401 Unauthorized` from `analytics-query`, and the
   tables have no anon RLS policies.

## Security notes

- `analytics-ingest` is intentionally public (storefront visitors have no
  accounts) but is hardened: event-type whitelist, forbidden server types,
  field length caps, 64KB payload cap, 120 events/min/IP rate limit, and
  `event_id` dedupe via unique index.
- `analytics-query` verifies the Supabase Auth JWT and requires `ADMIN_EMAIL`.
- `analytics_events`/`analytics_visitors`: RLS enabled — anon key has **no**
  access; only `authenticated` (your admin user) can SELECT, and only edge
  functions (service role) can INSERT.
- Admin credentials are never in frontend code — login goes through
  `supabase.auth.signInWithPassword`.

## Verifying it works

1. Open the storefront → accept cookies → browse a product, add to cart,
   start checkout (don't finish).
2. Open `/admin/analytics` → sign in → Overview should show visitors, ATC,
   checkout starts within seconds (Realtime feed updates live).
3. Complete a test order and verify payment in `/admin.html` → revenue and
   "Payments Verified" update; "Left Checkout" does not count it.
