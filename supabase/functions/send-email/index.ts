// Supabase Edge Function: send-email
// Deploy: supabase functions deploy send-email
// Secrets: supabase secrets set RESEND_API_KEY=re_...  (or SMTP provider key)
//          supabase secrets set EMAIL_FROM="Reps LV Bags <orders@repslvbags.com>"
//          supabase secrets set EMAIL_SECRET=<random-string>  (shared secret for callers)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'Reps LV Bags <onboarding@resend.dev>';
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
    // Shared-secret check: callers must send x-email-secret header.
    // (Supabase anon key alone is NOT enough — prevents spam relay abuse.)
    if (EMAIL_SECRET) {
      const provided = req.headers.get('x-email-secret') || '';
      if (provided !== EMAIL_SECRET) return json({ error: 'Unauthorized' }, 401);
    }

    const { to, subject, body, html } = await req.json();
    if (!to || !subject || !body) return json({ error: 'missing fields' }, 400);
    if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'invalid recipient' }, 400);
    if (body.length > 20000 || (html && html.length > 100000)) return json({ error: 'body too large' }, 400);

    if (!RESEND_API_KEY) {
      console.log(`[send-email] To: ${to} | ${subject}`);
      return json({ sent: false, reason: 'no_provider' });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, text: body, ...(html ? { html } : {}) })
    });
    const data = await res.json();
    return json({ sent: res.ok, data }, res.ok ? 200 : 502);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
