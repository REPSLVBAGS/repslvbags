// Supabase Edge Function: analytics-ingest
// Public event collector for first-party analytics.
// - Strict event-type whitelist + field validation + size caps
// - Per-IP rate limiting (best-effort, in-memory)
// - Writes via SERVICE ROLE key; anon key has no table access
// Deploy: supabase functions deploy analytics-ingest
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const ALLOWED_TYPES = new Set([
  'visit','page_view','product_view','add_to_cart','cart_remove',
  'checkout_start','checkout_complete','search'
]);
// Server-authoritative types are NEVER accepted from clients.
const FORBIDDEN = new Set(['order_created','payment_submitted','payment_verified','payment_rejected']);

const MAX_EVENTS = 50;
const MAX_STRING = 300;
const MAX_BATCH_BYTES = 64 * 1024;
const RATE_LIMIT = 120;          // events per IP per minute
const RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear(); // crude memory bound
  return false;
}

function s(v: unknown, max = MAX_STRING): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (rateLimited(ip)) return json({ error: 'rate_limited' }, 429);

    const raw = await req.text();
    if (raw.length > MAX_BATCH_BYTES) return json({ error: 'payload_too_large' }, 413);
    const body = JSON.parse(raw);
    const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : null;
    if (!events || !events.length) return json({ error: 'no_events' }, 400);

    const now = Date.now();
    const rows: Record<string, unknown>[] = [];
    const visitors = new Map<string, Record<string, unknown>>();

    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const type = s(e.type, 40);
      if (!ALLOWED_TYPES.has(type) || FORBIDDEN.has(type)) continue;

      const ts = Number(e.ts);
      const created = Number.isFinite(ts) && ts > now - 7 * 864e5 && ts <= now + 5 * 60e3
        ? new Date(ts).toISOString() : new Date().toISOString();

      const visitorId = s(e.visitor_id, 64);
      const sessionId = s(e.session_id, 64);
      if (!visitorId || !sessionId) continue;

      rows.push({
        event_id: s(e.event_id, 64) || null,
        type,
        visitor_id: visitorId,
        session_id: sessionId,
        page: s(e.page, 300),
        product_id: s(e.product_id, 60),
        product_name: s(e.product_name, 300),
        value: num(e.value),
        order_no: s(e.order_no, 40),
        referrer: s(e.referrer, 200),
        source: s(e.source, 60) || 'direct',
        device: ['mobile','tablet','desktop'].includes(e.device) ? e.device : 'desktop',
        utm: e.utm && typeof e.utm === 'object' ? e.utm : {},
        meta: e.meta && typeof e.meta === 'object' ? e.meta : {},
        created_at: created
      });

      if (!visitors.has(visitorId)) {
        visitors.set(visitorId, {
          visitor_id: visitorId,
          last_seen: created,
          source: s(e.source, 60) || 'direct',
          device: ['mobile','tablet','desktop'].includes(e.device) ? e.device : 'desktop'
        });
      }
    }

    if (!rows.length) return json({ ok: true, inserted: 0 });

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify(rows)
    });
    if (!ins.ok) return json({ error: await ins.text() }, 502);

    // Upsert visitor rollup rows (merge-duplicates keeps first_seen intact).
    if (visitors.size) {
      await fetch(`${SUPABASE_URL}/rest/v1/analytics_visitors?on_conflict=visitor_id`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify([...visitors.values()])
      }).catch(() => {});
    }

    return json({ ok: true, inserted: rows.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
