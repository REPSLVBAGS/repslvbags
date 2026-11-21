// Supabase Edge Function: reviews
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') || 'admin@repslvbags.com').toLowerCase();
const EMAIL_SECRET = Deno.env.get('EMAIL_SECRET') || '';

// Simple in-memory rate limit: max 5 review submissions per IP per hour.
const submitLog = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (submitLog.get(ip) || []).filter(t => now - t < 3600_000);
  if (hits.length >= 5) { submitLog.set(ip, hits); return true; }
  hits.push(now); submitLog.set(ip, hits);
  return false;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-secret',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
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

function isAdmin(req: Request): boolean {
  const secret = req.headers.get('x-email-secret') || '';
  return secret === EMAIL_SECRET && EMAIL_SECRET !== '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const status = url.searchParams.get('status') || 'approved';
      const productId = url.searchParams.get('product_id');
      const admin = isAdmin(req) || (await callerEmail(req)) === ADMIN_EMAIL;

      let query = `${SUPABASE_URL}/rest/v1/reviews?select=*&order=created_at.desc`;
      if (!admin) {
        query += `&status=eq.approved`;
      } else if (status !== 'all') {
        query += `&status=eq.${status}`;
      }
      if (productId) query += `&product_id=eq.${productId}`;

      const res = await fetch(query, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      if (!res.ok) return json({ error: await res.text() }, 502);
      const rows = await res.json();
      return json({ reviews: rows });
    }

    if (req.method === 'POST') {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
      if (rateLimited(ip)) return json({ error: 'Too many submissions. Please try again later.' }, 429);

      const body = await req.json();
      // Honeypot: bots fill the hidden "website" field — pretend success, drop it.
      if (body.website) return json({ ok: true, review: null });

      const { product_id, product_name, name, email, rating, title, body: reviewBody, photo_url } = body;

      if (!name || !reviewBody || !rating) return json({ error: 'Missing required fields' }, 400);
      if (rating < 1 || rating > 5) return json({ error: 'Rating must be 1-5' }, 400);
      if (name.length > 100 || reviewBody.length > 2000) return json({ error: 'Content too long' }, 400);

      const spamPatterns = [/https?:\/\//i, /(.)\1{10,}/, /[A-Z]{20,}/];
      if (spamPatterns.some(p => p.test(reviewBody))) {
        return json({ error: 'Review flagged as spam' }, 400);
      }

      // Duplicate check: same email + identical body within 24h is rejected.
      if (email) {
        const since = new Date(Date.now() - 86400_000).toISOString();
        const dupRes = await fetch(
          `${SUPABASE_URL}/rest/v1/reviews?email=eq.${encodeURIComponent(email)}&created_at=gte.${since}&select=id,body&limit=20`,
          { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
        );
        if (dupRes.ok) {
          const dups = await dupRes.json();
          const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
          if ((dups || []).some((d: { body: string }) => norm(d.body) === norm(reviewBody))) {
            return json({ error: 'This review has already been submitted.' }, 409);
          }
        }
      }

      const row = {
        product_id: product_id || null,
        product_name: product_name || '',
        name: name.trim(),
        email: email || '',
        rating: parseInt(rating),
        title: title || '',
        body: reviewBody.trim(),
        photo_url: photo_url || '',
        verified_purchase: false,
        status: 'pending'
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(row)
      });
      if (!res.ok) return json({ error: await res.text() }, 502);
      const data = await res.json();
      return json({ ok: true, review: data[0] });
    }

    if (req.method === 'PATCH') {
      const admin = isAdmin(req) || (await callerEmail(req)) === ADMIN_EMAIL;
      if (!admin) return json({ error: 'Unauthorized' }, 401);

      const { id, ...patch } = await req.json();
      if (!id) return json({ error: 'Missing review id' }, 400);

      const allowed = ['status', 'admin_reply', 'verified_purchase', 'featured'];
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowed) {
        if (patch[k] !== undefined) row[k] = patch[k];
      }

      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify(row)
      });
      if (!res.ok) return json({ error: await res.text() }, 502);
      const data = await res.json();
      return json({ ok: true, review: data[0] });
    }

    if (req.method === 'DELETE') {
      const admin = isAdmin(req) || (await callerEmail(req)) === ADMIN_EMAIL;
      if (!admin) return json({ error: 'Unauthorized' }, 401);

      const url = new URL(req.url);
      const id = url.searchParams.get('id');
      if (!id) return json({ error: 'Missing id' }, 400);

      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${id}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      if (!res.ok) return json({ error: await res.text() }, 502);
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
