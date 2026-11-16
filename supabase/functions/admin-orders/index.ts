// Supabase Edge Function: admin-orders
// Authenticated admin backend for the orders table.
// - Verifies the caller's Supabase Auth JWT and requires ADMIN_EMAIL.
// - GET  → returns all orders (service role, bypasses RLS)
// - PATCH {order_no, patch} → updates an order (service role)
// Deploy: supabase functions deploy admin-orders
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') || 'admin@repslvbags.com').toLowerCase();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS'
};

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

  const email = await callerEmail(req);
  if (email !== ADMIN_EMAIL) return json({ error: 'Unauthorized' }, 401);

  try {
    if (req.method === 'GET') {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=*&order=order_date.desc`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      if (!res.ok) return json({ error: await res.text() }, 502);
      const rows = await res.json();
      // Map snake_case DB rows back to the camelCase shape the admin UI expects.
      const orders = rows.map((r: any) => ({
        orderNo: r.order_no, email: r.email, name: r.name, phone: r.phone || '',
        address: r.address || '', city: r.city || '', state: r.state || '', zip: r.zip || '',
        items: r.items || [], total: r.total, discount: r.discount || '',
        status: r.status || 'Order Received', carrier: r.carrier || '', tracking: r.tracking || '',
        paymentMethod: r.payment_method || '', paymentStatus: r.payment_status || 'Awaiting Payment',
        transactionRef: r.transaction_ref || '', evidencePath: r.evidence_path || '',
        evidenceSubmittedAt: r.evidence_submitted_at, verifiedAt: r.verified_at,
        verifiedBy: r.verified_by || '', paymentNotes: r.payment_notes || '', notes: r.notes || '',
        emailsSent: r.emails_sent || [], orderDate: r.order_date, estDelivery: r.est_delivery
      }));
      return json({ orders });
    }

    if (req.method === 'PATCH') {
      const { order_no, patch } = await req.json();
      if (!order_no || !patch) return json({ error: 'missing order_no or patch' }, 400);
      // Map camelCase patch keys to snake_case columns (allowlist).
      const map: Record<string, string> = {
        status: 'status', carrier: 'carrier', tracking: 'tracking',
        paymentStatus: 'payment_status', transactionRef: 'transaction_ref',
        evidencePath: 'evidence_path', evidenceSubmittedAt: 'evidence_submitted_at',
        verifiedAt: 'verified_at', verifiedBy: 'verified_by',
        paymentNotes: 'payment_notes', notes: 'notes', emailsSent: 'emails_sent',
        estDelivery: 'est_delivery'
      };
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (map[k]) row[map[k]] = v;
      }
      if (Object.keys(row).length === 0) return json({ error: 'no valid fields' }, 400);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?order_no=eq.${encodeURIComponent(order_no)}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
      });
      if (!res.ok) return json({ error: await res.text() }, 502);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
