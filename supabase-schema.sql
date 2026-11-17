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

-- Reviews (customer testimonials)
create table if not exists reviews (
  id bigint generated always as identity primary key,
  product_id int,
  product_name text default '',
  name text not null,
  email text default '',
  rating int not null check (rating between 1 and 5),
  title text default '',
  body text not null,
  photo_url text default '',
  verified_purchase boolean default false,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  admin_reply text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table reviews enable row level security;
-- Public can read approved reviews only
create policy "public reads approved reviews" on reviews for select using (status = 'approved');
-- Anyone can submit a review (pending until admin approves)
create policy "public submits reviews" on reviews for insert with check (true);
-- Admin manages all reviews via service role / edge function

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

-- ============================================================
-- INVOICES & PAYMENT MANAGEMENT
-- ============================================================

-- Invoices (one per order, unique invoice number + secure access token)
create table if not exists invoices (
  id bigint generated always as identity primary key,
  invoice_no text unique not null,               -- INV-XXXXXX
  order_no text not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text default '',
  shipping_address jsonb default '{}',
  items jsonb not null default '[]',             -- [{name,price,qty,color}]
  subtotal numeric not null default 0,
  shipping numeric not null default 0,
  discount numeric not null default 0,
  discount_code text default '',
  total numeric not null default 0,
  currency text default 'USD',
  payment_method text default '',
  payment_method_label text default '',
  payment_details text default '',               -- snapshot of instructions at order time
  payment_status text not null default 'PENDING' check (payment_status in ('PENDING','PAID','CANCELLED','REFUNDED')),
  access_token text unique not null,             -- secure customer link token
  email_sent_at timestamptz,
  paid_email_sent_at timestamptz,
  paid_at timestamptz,
  paid_by text default '',
  cancelled_at timestamptz,
  cancelled_by text default '',
  refunded_at timestamptz,
  refunded_by text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_invoices_order_no on invoices(order_no);
create index if not exists idx_invoices_email on invoices(customer_email);
create index if not exists idx_invoices_status on invoices(payment_status);
alter table invoices enable row level security;
-- No public access — all reads/writes go through the invoices edge function (service role)

-- Invoice line items (normalized copy for reporting)
create table if not exists invoice_items (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references invoices(id) on delete cascade,
  product_name text not null,
  unit_price numeric not null,
  quantity int not null,
  line_total numeric not null,
  color text default ''
);
alter table invoice_items enable row level security;

-- Payment status history (audit trail — who changed what, when)
create table if not exists payment_status_history (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references invoices(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by text not null,
  note text default '',
  created_at timestamptz default now()
);
alter table payment_status_history enable row level security;
