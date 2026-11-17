// Supabase Edge Function: invoices
// Invoice generation, secure customer access, admin management, email delivery.
// Deploy: supabase functions deploy invoices --no-verify-jwt
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const EMAIL_SECRET = Deno.env.get('EMAIL_SECRET') || '';
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') || 'admin@repslvbags.com').toLowerCase();
const SITE_URL = Deno.env.get('SITE_URL') || 'https://repslvbags.com';
const REPLY_TO = 'supportrepslvbags@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-secret',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function isAdmin(req: Request): boolean {
  const secret = req.headers.get('x-email-secret') || '';
  return secret === EMAIL_SECRET && EMAIL_SECRET !== '';
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

async function isAdminRequest(req: Request): Promise<boolean> {
  if (isAdmin(req)) return true;
  return (await callerEmail(req)) === ADMIN_EMAIL;
}

// ---------- Helpers ----------
function genInvoiceNo(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `INV-${n}`;
}
function genToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function dbGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function dbInsert(table: string, row: unknown, prefer = 'return=representation') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: prefer
    },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}
async function dbPatch(table: string, query: string, row: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Send email via the existing send-email edge function (Resend).
async function sendMail(to: string, subject: string, body: string, html?: string, replyTo?: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-email-secret': EMAIL_SECRET
      },
      body: JSON.stringify({ to, subject, body, html, reply_to: replyTo || REPLY_TO })
    });
    return res.ok;
  } catch (e) {
    console.error('sendMail failed:', e);
    return false;
  }
}

// ---------- Email templates ----------
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function money(n: number): string { return '$' + Number(n).toFixed(2); }

function invoiceUrl(token: string): string {
  return `${SITE_URL}/invoice.html?token=${token}`;
}

function itemsRowsHtml(items: any[]): string {
  return items.map((i: any) => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #ece4d6">${esc(i.qty)}× ${esc(i.name)}${i.color ? ` <span style="color:#8a8177">(${esc(i.color)})</span>` : ''}</td>
    <td style="padding:8px 0;border-bottom:1px solid #ece4d6;text-align:right;white-space:nowrap">${money(i.price * i.qty)}</td></tr>`).join('');
}

function invoiceEmailHtml(inv: any): string {
  const addr = inv.shipping_address || {};
  const statusColor = inv.payment_status === 'PAID' ? '#2e7d32' : '#8a5a00';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #e4ddd1">
    <div style="background:#252525;color:#F8F6F2;padding:26px 30px;text-align:center">
      <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:4px">REPS <span style="font-style:italic;color:#c9b48a">LV</span> BAGS</div>
      <div style="margin-top:8px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#b8b0a2">Invoice ${esc(inv.invoice_no)}</div>
    </div>
    <div style="padding:30px">
      <p style="margin:0 0 6px;font-size:15px"><b style="font-size:17px">Hi ${esc(inv.customer_name)},</b></p>
      <p style="margin:0 0 20px;font-size:14px;color:#4a443c">Thank you for your order! Your invoice is ready below.</p>
      <div style="display:inline-block;padding:6px 14px;border:1px solid ${statusColor};color:${statusColor};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:bold">${esc(inv.payment_status)}</div>
      <h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8177;border-bottom:1px solid #e4ddd1;padding-bottom:8px">Order Summary</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemsRowsHtml(inv.items || [])}
        <tr><td style="padding:10px 0 0;font-size:13px;color:#8a8177">Subtotal</td><td style="padding:10px 0 0;text-align:right;font-size:13px">${money(inv.subtotal)}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#8a8177">Shipping</td><td style="padding:4px 0;text-align:right;font-size:13px">${Number(inv.shipping) === 0 ? 'FREE' : money(inv.shipping)}</td></tr>
        ${Number(inv.discount) > 0 ? `<tr><td style="padding:4px 0;font-size:13px;color:#8a8177">Discount${inv.discount_code ? ` (${esc(inv.discount_code)})` : ''}</td><td style="padding:4px 0;text-align:right;font-size:13px">−${money(inv.discount)}</td></tr>` : ''}
        <tr><td style="padding:10px 0 0;font-size:16px;font-weight:bold;border-top:2px solid #252525">Total Due</td><td style="padding:10px 0 0;text-align:right;font-size:16px;font-weight:bold;border-top:2px solid #252525">${money(inv.total)}</td></tr>
      </table>
      <h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8177;border-bottom:1px solid #e4ddd1;padding-bottom:8px">Delivery Address</h3>
      <p style="margin:0;font-size:14px;line-height:1.7">${esc(addr.address || '')}<br>${esc(addr.city || '')}, ${esc(addr.state || '')} ${esc(addr.zip || '')}</p>
      <h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8177;border-bottom:1px solid #e4ddd1;padding-bottom:8px">Payment</h3>
      <p style="margin:0;font-size:14px"><b>${esc(inv.payment_method_label || inv.payment_method)}</b> — ${money(inv.total)}</p>
      ${inv.payment_details ? `<div style="margin-top:10px;padding:14px;background:#f8f6f2;border-left:3px solid #c9b48a;font-size:13px;line-height:1.6;white-space:pre-line">${esc(inv.payment_details)}</div>` : ''}
      <div style="margin-top:26px;text-align:center">
        <a href="${invoiceUrl(inv.access_token)}" style="display:inline-block;background:#252525;color:#F8F6F2;padding:14px 34px;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase">View &amp; Download Invoice</a>
      </div>
      <p style="margin-top:20px;font-size:12px;color:#8a8177">This link is private to you — please do not share it. Questions? Reply to this email or contact ${REPLY_TO}.</p>
    </div>
    <div style="background:#f8f6f2;padding:18px 30px;text-align:center;font-size:11px;color:#8a8177;letter-spacing:1px">
      Reps LV Bags · ${REPLY_TO} · repslvbags.com
    </div>
  </div></body></html>`;
}

function invoiceEmailText(inv: any): string {
  const addr = inv.shipping_address || {};
  const lines = [
    `Hi ${inv.customer_name},`,
    ``,
    `Thank you for your order! Your invoice ${inv.invoice_no} is ready.`,
    `Status: ${inv.payment_status}`,
    ``,
    `Items:`,
    ...(inv.items || []).map((i: any) => `  • ${i.qty}× ${i.name}${i.color ? ` (${i.color})` : ''} — $${(i.price * i.qty).toFixed(2)}`),
    ``,
    `Subtotal: $${Number(inv.subtotal).toFixed(2)}`,
    `Shipping: ${Number(inv.shipping) === 0 ? 'FREE' : '$' + Number(inv.shipping).toFixed(2)}`,
    ...(Number(inv.discount) > 0 ? [`Discount${inv.discount_code ? ` (${inv.discount_code})` : ''}: -$${Number(inv.discount).toFixed(2)}`] : []),
    `TOTAL DUE: $${Number(inv.total).toFixed(2)}`,
    ``,
    `Delivery: ${addr.address || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip || ''}`,
    `Payment: ${inv.payment_method_label || inv.payment_method} — $${Number(inv.total).toFixed(2)}`,
    inv.payment_details ? `\nPayment instructions:\n${inv.payment_details}` : '',
    ``,
    `View & download your invoice: ${invoiceUrl(inv.access_token)}`,
    ``,
    `— Reps LV Bags`,
    REPLY_TO
  ];
  return lines.filter(l => l !== undefined).join('\n');
}

function paidReceiptHtml(inv: any): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #e4ddd1">
    <div style="background:#252525;color:#F8F6F2;padding:26px 30px;text-align:center">
      <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:4px">REPS <span style="font-style:italic;color:#c9b48a">LV</span> BAGS</div>
      <div style="margin-top:8px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#b8b0a2">Payment Receipt</div>
    </div>
    <div style="padding:30px;text-align:center">
      <div style="display:inline-block;padding:8px 18px;border:2px solid #2e7d32;color:#2e7d32;font-size:13px;letter-spacing:3px;text-transform:uppercase;font-weight:bold">PAID</div>
      <h2 style="margin:20px 0 6px;font-family:Georgia,serif">Thank you, ${esc(inv.customer_name)}!</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#4a443c">Your payment for invoice <b>${esc(inv.invoice_no)}</b> has been verified.</p>
      <p style="font-size:26px;font-weight:bold;margin:10px 0">${money(inv.total)}</p>
      <p style="font-size:13px;color:#8a8177">Paid on ${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</p>
      <div style="margin-top:26px">
        <a href="${invoiceUrl(inv.access_token)}" style="display:inline-block;background:#252525;color:#F8F6F2;padding:14px 34px;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase">View Receipt / Invoice</a>
      </div>
    </div>
    <div style="background:#f8f6f2;padding:18px 30px;text-align:center;font-size:11px;color:#8a8177;letter-spacing:1px">
      Reps LV Bags · ${REPLY_TO} · repslvbags.com
    </div>
  </div></body></html>`;
}

// ---------- Main handler ----------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url = new URL(req.url);

    // ===== GET: public invoice by token OR admin list/detail =====
    if (req.method === 'GET') {
      const token = url.searchParams.get('token');
      const id = url.searchParams.get('id');
      const admin = await isAdminRequest(req);

      // Public: fetch by secure token (customer invoice page)
      if (token) {
        const rows = await dbGet(`invoices?access_token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
        if (!rows.length) return json({ error: 'Invoice not found' }, 404);
        const inv = rows[0];
        // Public view strips nothing sensitive — token IS the auth. But hide internal notes.
        const { notes, ...safe } = inv;
        return json({ invoice: safe });
      }

      // Admin: list or single
      if (!admin) return json({ error: 'Unauthorized' }, 401);

      if (id) {
        const rows = await dbGet(`invoices?id=eq.${id}&select=*,invoice_items(*),payment_status_history(*)`);
        if (!rows.length) return json({ error: 'Not found' }, 404);
        return json({ invoice: rows[0] });
      }

      // List with filters
      const status = url.searchParams.get('status');
      const q = url.searchParams.get('q');
      let query = 'invoices?select=*&order=created_at.desc&limit=500';
      if (status && status !== 'all') query += `&payment_status=eq.${status}`;
      if (q) query += `&or=(invoice_no.ilike.*${encodeURIComponent(q)}*,customer_name.ilike.*${encodeURIComponent(q)}*,customer_email.ilike.*${encodeURIComponent(q)}*,order_no.ilike.*${encodeURIComponent(q)}*)`;
      const rows = await dbGet(query);
      return json({ invoices: rows });
    }

    // ===== POST: create invoice (public, idempotent by order_no) =====
    if (req.method === 'POST') {
      const body = await req.json();
      const { action } = body;

      // Admin action: resend invoice email
      if (action === 'resend') {
        if (!await isAdminRequest(req)) return json({ error: 'Unauthorized' }, 401);
        const invId = body.invoice_id;
        const rows = await dbGet(`invoices?id=eq.${invId}&select=*`);
        if (!rows.length) return json({ error: 'Not found' }, 404);
        const inv = rows[0];
        const ok = await sendMail(inv.customer_email,
          `Invoice ${inv.invoice_no} — Reps LV Bags`,
          invoiceEmailText(inv), invoiceEmailHtml(inv), REPLY_TO);
        if (ok) await dbPatch('invoices', `id=eq.${invId}`, { email_sent_at: new Date().toISOString() });
        return json({ ok, sent: ok });
      }

      // Create invoice from order data
      const {
        order_no, customer_name, customer_email, customer_phone,
        shipping_address, items, subtotal, shipping, discount, discount_code,
        total, payment_method, payment_method_label, payment_details
      } = body;

      if (!order_no || !customer_email || !customer_name || !items || !items.length) {
        return json({ error: 'Missing required fields' }, 400);
      }

      // Idempotency: return existing invoice for this order
      const existing = await dbGet(`invoices?order_no=eq.${encodeURIComponent(order_no)}&select=*&limit=1`);
      if (existing.length) {
        return json({ ok: true, invoice: existing[0], existing: true });
      }

      // Generate unique invoice number (retry on conflict)
      let invoiceNo = '';
      for (let i = 0; i < 10; i++) {
        const candidate = genInvoiceNo();
        const dup = await dbGet(`invoices?invoice_no=eq.${candidate}&select=id&limit=1`);
        if (!dup.length) { invoiceNo = candidate; break; }
      }
      if (!invoiceNo) return json({ error: 'Could not generate invoice number' }, 500);

      const accessToken = genToken();
      const invRow = {
        invoice_no: invoiceNo,
        order_no,
        customer_name,
        customer_email,
        customer_phone: customer_phone || '',
        shipping_address: shipping_address || {},
        items,
        subtotal: Number(subtotal) || 0,
        shipping: Number(shipping) || 0,
        discount: Number(discount) || 0,
        discount_code: discount_code || '',
        total: Number(total) || 0,
        payment_method: payment_method || '',
        payment_method_label: payment_method_label || payment_method || '',
        payment_details: payment_details || '',
        payment_status: 'PENDING',
        access_token: accessToken
      };

      const created = await dbInsert('invoices', invRow);
      const inv = created[0];

      // Insert normalized line items
      const lineItems = (items || []).map((i: any) => ({
        invoice_id: inv.id,
        product_name: i.name || '',
        unit_price: Number(i.price) || 0,
        quantity: Number(i.qty) || 1,
        line_total: (Number(i.price) || 0) * (Number(i.qty) || 1),
        color: i.color || ''
      }));
      if (lineItems.length) await dbInsert('invoice_items', lineItems, 'return=minimal');

      // Record initial status in history
      await dbInsert('payment_status_history', {
        invoice_id: inv.id,
        from_status: null,
        to_status: 'PENDING',
        changed_by: 'system',
        note: 'Invoice created'
      }, 'return=minimal');

      // Send invoice email (non-blocking failure is OK — admin can resend)
      const emailOk = await sendMail(
        inv.customer_email,
        `Invoice ${inv.invoice_no} — Reps LV Bags`,
        invoiceEmailText(inv),
        invoiceEmailHtml(inv),
        REPLY_TO
      );
      if (emailOk) {
        await dbPatch('invoices', `id=eq.${inv.id}`, { email_sent_at: new Date().toISOString() });
        inv.email_sent_at = new Date().toISOString();
      }

      return json({ ok: true, invoice: inv, email_sent: emailOk });
    }

    // ===== PATCH: admin status change =====
    if (req.method === 'PATCH') {
      if (!await isAdminRequest(req)) return json({ error: 'Unauthorized' }, 401);
      const body = await req.json();
      const { id, status, note } = body;
      if (!id || !status) return json({ error: 'Missing id or status' }, 400);
      if (!['PENDING', 'PAID', 'CANCELLED', 'REFUNDED'].includes(status)) {
        return json({ error: 'Invalid status' }, 400);
      }

      const rows = await dbGet(`invoices?id=eq.${id}&select=*`);
      if (!rows.length) return json({ error: 'Not found' }, 404);
      const inv = rows[0];
      const fromStatus = inv.payment_status;
      if (fromStatus === status) return json({ ok: true, invoice: inv, unchanged: true });

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        payment_status: status,
        updated_at: now
      };
      const adminEmail = (await callerEmail(req)) || 'admin';

      if (status === 'PAID') { patch.paid_at = now; patch.paid_by = adminEmail; }
      if (status === 'CANCELLED') { patch.cancelled_at = now; patch.cancelled_by = adminEmail; }
      if (status === 'REFUNDED') { patch.refunded_at = now; patch.refunded_by = adminEmail; }
      if (note) patch.notes = note;

      const updated = await dbPatch('invoices', `id=eq.${id}`, patch);
      const newInv = updated[0] || { ...inv, ...patch };

      // History record
      await dbInsert('payment_status_history', {
        invoice_id: id,
        from_status: fromStatus,
        to_status: status,
        changed_by: adminEmail,
        note: note || ''
      }, 'return=minimal');

      // Sync order payment status in orders table (service role)
      const orderPaymentMap: Record<string, string> = {
        PAID: 'Paid',
        CANCELLED: 'Cancelled',
        REFUNDED: 'Refunded',
        PENDING: 'Awaiting Payment'
      };
      if (orderPaymentMap[status]) {
        await dbPatch('orders', `order_no=eq.${encodeURIComponent(inv.order_no)}`, {
          payment_status: orderPaymentMap[status],
          updated_at: now
        }).catch(() => {});
      }

      // Send paid receipt email (once only)
      let paidEmailSent = false;
      if (status === 'PAID' && !inv.paid_email_sent_at) {
        const ok = await sendMail(
          inv.customer_email,
          `Payment Received — Invoice ${inv.invoice_no} — Reps LV Bags`,
          `Hi ${inv.customer_name},\n\nGreat news — your payment of $${Number(inv.total).toFixed(2)} for invoice ${inv.invoice_no} has been verified.\n\nView your receipt: ${invoiceUrl(inv.access_token)}\n\n— Reps LV Bags`,
          paidReceiptHtml(newInv),
          REPLY_TO
        );
        if (ok) {
          paidEmailSent = true;
          await dbPatch('invoices', `id=eq.${id}`, { paid_email_sent_at: now });
        }
      }

      return json({ ok: true, invoice: newInv, paid_email_sent: paidEmailSent });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (e) {
    console.error('invoices error:', e);
    return json({ error: String(e) }, 500);
  }
});
