-- ============================================================
-- Reps LV Bags — First-party analytics schema
-- Run in Supabase Dashboard → SQL Editor (after supabase-schema.sql)
-- ============================================================

-- Raw analytics events (append-only). Written ONLY by the
-- 'analytics-ingest' Edge Function using the service role key.
create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  event_id text unique,                    -- client-generated uuid, dedupes retries
  type text not null,                      -- visit, page_view, product_view, add_to_cart,
                                           -- cart_remove, checkout_start, checkout_complete,
                                           -- search, order_created, payment_submitted,
                                           -- payment_verified, payment_rejected
  visitor_id text not null,                -- anonymous persistent id (localStorage uuid)
  session_id text not null,                -- anonymous per-tab-session id
  page text default '',
  product_id text default '',
  product_name text default '',
  value numeric,                           -- order/event value in USD (verified events only carry real revenue)
  order_no text default '',
  referrer text default '',
  source text default 'direct',
  device text default 'desktop',
  utm jsonb default '{}',
  meta jsonb default '{}',                 -- non-sensitive context only (counts, search term)
  created_at timestamptz default now()
);
create index if not exists idx_ae_type_created on analytics_events(type, created_at);
create index if not exists idx_ae_created on analytics_events(created_at);
create index if not exists idx_ae_visitor on analytics_events(visitor_id, created_at);
create index if not exists idx_ae_session on analytics_events(session_id);
create index if not exists idx_ae_product on analytics_events(product_name);
alter table analytics_events enable row level security;
-- NO anon insert/select — all writes via service role (edge functions).
-- Admin dashboard reads via 'authenticated' role (Supabase Auth admin user only).
create policy "authenticated reads analytics events" on analytics_events
  for select to authenticated using (true);

-- Visitor rollup: first/last seen + visit counts per anonymous visitor.
create table if not exists analytics_visitors (
  visitor_id text primary key,
  first_seen timestamptz default now(),
  last_seen timestamptz default now(),
  visit_count int default 0,
  source text default 'direct',
  device text default 'desktop'
);
alter table analytics_visitors enable row level security;
create policy "authenticated reads analytics visitors" on analytics_visitors
  for select to authenticated using (true);

-- Live dashboard feed: broadcast inserts to authenticated subscribers.
alter publication supabase_realtime add table analytics_events;
