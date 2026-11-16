// ---------- Supabase integration ----------
// Paste your project URL + anon key below (Supabase Dashboard → Project Settings → API).
// Leave blank to run in localStorage-only mode — everything keeps working.
const SUPABASE_URL = '';   // e.g. 'https://abcdefgh.supabase.co'
const SUPABASE_ANON_KEY = ''; // e.g. 'eyJhbGciOi...'
const EMAIL_SECRET = '';   // must match the EMAIL_SECRET edge function secret

let _sb = null;
function supabase(){
  if(_sb !== null) return _sb;
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase){ _sb = false; return null; }
  try{ _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }
  catch(e){ console.warn('Supabase init failed:', e); _sb = false; }
  return _sb || null;
}
function isSupabaseEnabled(){ return !!supabase(); }

// ---------- Order sync (fire-and-forget, localStorage stays source of truth) ----------
function sbUpsertOrder(order){
  const sb=supabase(); if(!sb) return;
  const row={
    order_no:order.orderNo, email:order.email, name:order.name, phone:order.phone||'',
    address:order.address, city:order.city, state:order.state, zip:order.zip,
    items:order.items, total:order.total, discount:order.discount||'',
    status:order.status, carrier:order.carrier||'', tracking:order.tracking||'',
    payment_method:order.paymentMethod||'', payment_status:order.paymentStatus||'Awaiting Payment',
    transaction_ref:order.transactionRef||'', evidence_path:order.evidencePath||'',
    evidence_submitted_at:order.evidenceSubmittedAt||null,
    verified_at:order.verifiedAt||null, verified_by:order.verifiedBy||'',
    payment_notes:order.paymentNotes||'', notes:order.notes||'',
    emails_sent:order.emailsSent||[], order_date:order.orderDate, est_delivery:order.estDelivery||null
  };
  sb.from('orders').upsert(row,{onConflict:'order_no'}).then(({error})=>{
    if(error) console.warn('Supabase order sync failed:', error.message);
  });
}

// ---------- Payment evidence → private storage bucket ----------
// Returns {path} on success, null on failure. Path is stored on the order;
// the dataURL is kept locally as fallback.
async function sbUploadEvidence(orderNo, dataURL){
  const sb=supabase(); if(!sb) return null;
  try{
    const blob=await (await fetch(dataURL)).blob();
    const ext=(blob.type.split('/')[1]||'jpg').replace('jpeg','jpg');
    const path=`${orderNo}/${Date.now()}.${ext}`;
    const {error}=await sb.storage.from('payment-evidence').upload(path, blob, {contentType:blob.type, upsert:false});
    if(error){console.warn('Evidence upload failed:',error.message);return null;}
    return path;
  }catch(e){console.warn('Evidence upload error:',e);return null;}
}
// Admin-only: create a short-lived signed URL for a stored evidence path.
async function sbEvidenceUrl(path, expiresIn=300){
  const sb=supabase(); if(!sb||!path) return null;
  const {data,error}=await sb.storage.from('payment-evidence').createSignedUrl(path, expiresIn);
  return error?null:data.signedUrl;
}

// ---------- Email via Edge Function ----------
// Calls the 'send-email' Edge Function (see supabase/functions/send-email).
// Falls back to local logging when Supabase isn't configured.
async function sbSendEmail(to, subject, body, html){
  const sb=supabase();
  if(!sb) return {sent:false,reason:'supabase_not_configured'};
  try{
    const payload={to,subject,body};
    if(html) payload.html=html;
    const {data,error}=await sb.functions.invoke('send-email',{
      body:payload,
      headers: EMAIL_SECRET ? {'x-email-secret':EMAIL_SECRET} : {}
    });
    if(error){console.warn('Email function error:',error.message);return {sent:false,reason:error.message};}
    return {sent:true,data};
  }catch(e){console.warn('Email invoke failed:',e);return {sent:false,reason:String(e)};}
}
