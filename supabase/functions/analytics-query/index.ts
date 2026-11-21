// Supabase Edge Function: analytics-query
// Admin-only analytics read API.
// - Verifies caller's Supabase Auth JWT and requires ADMIN_EMAIL (same as admin-orders)
// - GET ?from=ISO&to=ISO → returns analytics events + order rows in range
// Deploy: supabase functions deploy analytics-query
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') || 'admin@repslvbags.com').toLowerCase();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const MAX_RANGE_DAYS = 400;
const EVENT_LIMIT = 50000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function callerEmail(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return (user?.email || '').toLowerCase();
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const email = await callerEmail(req);
  if (email !== ADMIN_EMAIL) return json({ error: 'Unauthorized' }, 401);

  try {
    const url = new URL(req.url);
    const now = Date.now();
    let from = url.searchParams.get('from');
    let to = url.searchParams.get('to');

    // Defaults: last 30 days
    if (!from) from = new Date(now - 30 * 864e5).toISOString();
    if (!to) to = new Date(now + 864e5).toISOString();
    const fromMs = Date.parse(from), toMs = Date.parse(to);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
      return json({ error: 'invalid range' }, 400);
    }
    if (toMs - fromMs > MAX_RANGE_DAYS * 864e5) return json({ error: 'range too large' }, 400);

    const evRes = await fetch(
      `${SUPABASE_URL}/rest/v1/analytics_events` +
      `?created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}` +
      `&select=id,type,visitor_id,session_id,page,product_id,product_name,value,order_no,referrer,source,device,utm,meta,created_at` +
      `&order=created_at.desc&limit=${EVENT_LIMIT}`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!evRes.ok) return json({ error: await evRes.text() }, 502);
    const events = await evRes.json();

    // Orders use order_date; include items for product-sales aggregation.
    const ordRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders` +
      `?order_date=gte.${encodeURIComponent(from)}&order_date=lt.${encodeURIComponent(to)}` +
      `&select=order_no,email,name,total,status,payment_status,payment_method,order_date,items` +
      `&order=order_date.desc&limit=10000`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!ordRes.ok) return json({ error: await ordRes.text() }, 502);
    const orders = await ordRes.json();

    const visRes = await fetch(
      `${SUPABASE_URL}/rest/v1/analytics_visitors?select=visitor_id,first_seen,last_seen,source,device&limit=100000`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const visitors = visRes.ok ? await visRes.json() : [];

    return json({ events, orders, visitors, from, to });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
