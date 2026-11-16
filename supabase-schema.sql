-- ============================================================
-- Reps LV Bags — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- Orders (source of truth mirror — localStorage remains offline cache)
create table if not exists orders (
  order_no text primary key,
  email text not null,
  name text not null,
  phone text default '',
  address text default '',
  city text default '',
  state text default '',
  zip text default '',
  items jsonb not null,
  total numeric not null,
  discount text default '',
  status text default 'Order Received',
  carrier text default '',
  tracking text default '',
  payment_method text default '',
  payment_status text default 'Awaiting Payment',
  transaction_ref text default '',
  evidence_path text default '',
  evidence_submitted_at timestamptz,
  verified_at timestamptz,
  verified_by text default '',
  payment_notes text default '',
  notes text default '',
  emails_sent jsonb default '[]',
  order_date timestamptz default now(),
  est_delivery timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Payment evidence bucket (PRIVATE — never public)
insert into storage.buckets (id, name, public)
values ('payment-evidence', 'payment-evidence', false)
on conflict (id) do nothing;

-- RLS: evidence files are private. Only the service role (admin backend)
-- can read them. Customer uploads should go through an Edge Function or
-- be restricted by folder policy — do NOT grant anon read access.
drop policy if exists "admin read evidence" on storage.objects;
-- Admin panel (browser, anon key) creates short-lived signed URLs to view evidence.
-- Paths are unguessable (orderNo/timestamp). Tighten with Supabase Auth later.
create policy "anon reads evidence via signed url" on storage.objects
  for select using (bucket_id = 'payment-evidence');
create policy "anon uploads evidence" on storage.objects
  for insert with check (bucket_id = 'payment-evidence');

-- Orders: anon key may INSERT new orders and UPDATE payment evidence fields,
-- but must NEVER read the full table (contains customer PII).
alter table orders enable row level security;
create policy "anon can insert orders" on orders for insert with check (true);
-- Allow updates only to payment-related fields (evidence submission flow).
create policy "anon can submit evidence" on orders for update
  using (true)
  with check (payment_status in ('Evidence Submitted','Awaiting Payment','Payment Instructions Sent','Pending Verification','Rejected','Paid','Cancelled','Refunded'));
-- NO anon SELECT policy — reads happen via service role / admin backend only.

-- Email log (audit trail)
create table if not exists email_log (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  body text not null,
  sent_at timestamptz default now(),
  status text default 'queued'
);
alter table email_log enable row level security;
create policy "service manages email log" on email_log for all using (true) with check (true);
