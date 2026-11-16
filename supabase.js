// ---------- Supabase integration ----------
// Paste your project URL + anon key below (Supabase Dashboard → Project Settings → API).
// Leave blank to run in localStorage-only mode — everything keeps working.
const SUPABASE_URL = 'https://wetxlhacaeakstqwqtdh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndldHhsaGFjYWVha3N0cXdxdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3ODUzNjUsImV4cCI6MjExMDM2MTM2NX0.kd1s2dKHfN3HCl5gT09hoyyLjk5-pbJy42p9BJjqD3g';
const EMAIL_SECRET = 'vr7f2k9xQm4Lp8Rw3Ty6';   // must match the EMAIL_SECRET edge function secret

let _sb = null;
function getSb(){
  if(_sb !== null) return _sb;
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY || !window.supabase){ _sb = false; return null; }
  try{
    // window.supabase is the UMD library global — use it directly
    if(window.supabase && typeof window.supabase.createClient === 'function'){
      _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.warn('Supabase lib not loaded properly. Type:', typeof window.supabase);
      _sb = false;
    }
  }
  catch(e){ console.warn('Supabase init failed:', e); _sb = false; }
  return _sb || null;
}
function isSupabaseEnabled(){ return !!getSb(); }

// ---------- Order sync (fire-and-forget, localStorage stays source of truth) ----------
// All order writes go through the 'sync-order' Edge Function (service role).
// The anon key has NO table access — orders are only readable/writable server-side.
function sbUpsertOrder(order){
  const sb=getSb(); if(!sb) return;
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
  sb.functions.invoke('sync-order',{
    body:row,
    headers: EMAIL_SECRET ? {'x-email-secret':EMAIL_SECRET} : {}
  }).then(({error})=>{
    if(error) console.warn('Supabase order sync failed:', error.message);
  }).catch(e=>console.warn('Supabase order sync error:', e));
}

// ---------- Payment evidence → private storage bucket ----------
// Returns {path} on success, null on failure. Path is stored on the order;
// the dataURL is kept locally as fallback.
async function sbUploadEvidence(orderNo, dataURL){
  const sb=getSb(); if(!sb) return null;
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
  const sb=getSb(); if(!sb||!path) return null;
  const {data,error}=await sb.storage.from('payment-evidence').createSignedUrl(path, expiresIn);
  return error?null:data.signedUrl;
}

// ---------- Admin (authenticated via Supabase Auth) ----------
async function sbAdminSignIn(email,password){
  const sb=getSb(); if(!sb) return {error:'supabase not configured'};
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  return {data,error};
}
async function sbAdminSignOut(){ const sb=getSb(); if(sb) await sb.auth.signOut(); }
async function sbAdminSession(){
  const sb=getSb(); if(!sb) return null;
  const {data}=await sb.auth.getSession();
  return data.session||null;
}
async function sbAdminListOrders(){
  const sb=getSb(); if(!sb) return null;
  const {data,error}=await sb.functions.invoke('admin-orders',{method:'GET'});
  if(error){console.warn('admin-orders list failed:',error.message);return null;}
  return (data&&data.orders)?data.orders:null;
}
async function sbAdminUpdateOrder(orderNo, patch){
  const sb=getSb(); if(!sb) return false;
  const {error}=await sb.functions.invoke('admin-orders',{method:'PATCH',body:{order_no:orderNo,patch}});
  if(error){console.warn('admin-orders update failed:',error.message);return false;}
  return true;
}

// ---------- Email via Edge Function ----------
// Calls the 'send-email' Edge Function (see supabase/functions/send-email).
// Falls back to local logging when Supabase isn't configured.
async function sbSendEmail(to, subject, body, html){
  const sb=getSb();
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
