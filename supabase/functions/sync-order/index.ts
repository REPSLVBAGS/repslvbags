// Supabase Edge Function: sync-order
// Secure order mirror — uses the SERVICE ROLE key (server-side only) to
// upsert orders. The anon key has NO access to the orders table, so all
// order writes must come through this function with the shared secret.
// Deploy: supabase functions deploy sync-order
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMAIL_SECRET = Deno.env.get('EMAIL_SECRET') || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (EMAIL_SECRET) {
      const provided = req.headers.get('x-email-secret') || '';
      if (provided !== EMAIL_SECRET) return json({ error: 'Unauthorized' }, 401);
    }

    const row = await req.json();
    if (!row || !row.order_no) return json({ error: 'missing order_no' }, 400);

    // Fetch previous state so we can emit authoritative analytics events
    // only on real transitions (order created / payment status changes).
    const prevRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(row.order_no)}&select=payment_status,total&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    const prevRows = prevRes.ok ? await prevRes.json() : [];
    const prev = prevRows[0] || null;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    });
    if (!res.ok) {
      const err = await res.text();
      return json({ error: err }, 502);
    }

    // ---- Analytics events (service-authoritative; clients cannot forge these) ----
    const svcHeaders = {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal'
    };
    const analyticsEvents: Record<string, unknown>[] = [];
    const base = {
      visitor_id: 'system', session_id: 'system',
      page: '', order_no: String(row.order_no).slice(0, 40),
      product_name: '', referrer: '', source: 'system', device: 'server',
      utm: {}, meta: {}
    };
    if (!prev) {
      analyticsEvents.push({ ...base, type: 'order_created', value: Number(row.total) || null });
    } else if (prev.payment_status !== row.payment_status) {
      const ps = String(row.payment_status || '');
      if (ps === 'Evidence Submitted' || ps === 'Pending Verification') {
        analyticsEvents.push({ ...base, type: 'payment_submitted', value: Number(row.total) || null });
      } else if (ps === 'Paid') {
        analyticsEvents.push({ ...base, type: 'payment_verified', value: Number(row.total) || null });
      } else if (ps === 'Rejected') {
        analyticsEvents.push({ ...base, type: 'payment_rejected' });
      }
    }
    if (analyticsEvents.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
        method: 'POST', headers: svcHeaders, body: JSON.stringify(analyticsEvents)
      }).catch(() => {});
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
