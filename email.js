// ---------- Email notifications ----------
// All business notifications go to ONE centralized inbox.
const BUSINESS_EMAIL='supportrepslvbags@gmail.com';
// Static-site architecture: there is no server, so emails cannot be sent
// directly from the browser. Every notification is:
//   1) rendered (subject + body),
//   2) appended to the local email log (vr_email_log) for audit,
//   3) sent server-side via the Supabase 'send-email' Edge Function when configured.
// Credentials live ONLY in Supabase Edge Function secrets — never in frontend code.

const EMAIL_LOG_KEY='vr_email_log';
function getEmailLog(){return JSON.parse(localStorage.getItem(EMAIL_LOG_KEY)||'[]');}
function logEmail(entry){
  const log=getEmailLog(); log.unshift({...entry,queuedAt:new Date().toISOString()});
  localStorage.setItem(EMAIL_LOG_KEY,JSON.stringify(log.slice(0,200)));
}

// Fallback transport for BUSINESS notifications only: FormSubmit.co AJAX.
// No account or API key needed — but the FIRST email to each recipient requires
// a one-time activation link sent to that inbox (check supportrepslvbags@gmail.com
// for an activation email from formsubmit.co and click it once).
// NOT used for customer-facing emails (each recipient would need activation).
// `fields` are rendered as labeled rows in the notification email; `_replyto`
// lets the owner reply directly to the customer from Gmail.
async function formSubmitSend(to,subject,body,fields){
  try{
    const payload={_subject:subject,_captcha:'false',_honey:'',_template:'table',message:body,...(fields||{})};
    if(fields&&fields._replyto)payload._replyto=fields._replyto;
    const res=await fetch('https://formsubmit.co/ajax/'+encodeURIComponent(to),{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await res.json().catch(()=>({}));
    if(res.ok&&data.success)return {sent:true};
    console.warn('[EMAIL] FormSubmit not accepted:',data.message||res.status);
    return {sent:false,reason:data.message||('http_'+res.status)};
  }catch(e){console.warn('[EMAIL] FormSubmit failed:',e);return {sent:false,reason:String(e)};}
}

// Core send — uses Supabase Edge Function when configured, else FormSubmit for
// business notifications, else logs locally.
// opts: {fields: {...} extra labeled fields, html: '<html>…' rich version}
async function sendEmail(to, subject, body, opts){
  opts=opts||{};
  logEmail({to,subject,body});
  if(typeof sbSendEmail==='function'){
    const r=await sbSendEmail(to,subject,body,opts.html);
    if(r.sent){
      // mark last log entry as sent
      const log=getEmailLog(); if(log[0]){log[0].status='sent';localStorage.setItem(EMAIL_LOG_KEY,JSON.stringify(log));}
      console.log(`[EMAIL SENT via Supabase] To: ${to} — "${subject}"`);
      return {to,subject,body,sent:true};
    }
  }
  // Fallback: business notifications via FormSubmit (works without Supabase).
  if(to===BUSINESS_EMAIL){
    const f=await formSubmitSend(to,subject,body,opts.fields);
    if(f.sent){
      const log=getEmailLog(); if(log[0]){log[0].status='sent_via_formsubmit';localStorage.setItem(EMAIL_LOG_KEY,JSON.stringify(log));}
      console.log(`[EMAIL SENT via FormSubmit] To: ${to} — "${subject}"`);
      return {to,subject,body,sent:true};
    }
    console.warn('[EMAIL] FormSubmit fallback failed — notification queued locally only. Reason:',f.reason);
  }
  console.log(`[EMAIL QUEUED] To: ${to} — "${subject}"`);
  console.log(body);
  return {to,subject,body,sent:false};
}

// Idempotency: each order records which notifications were already sent.
function alreadySent(order,key){return (order.emailsSent||[]).includes(key);}
function markSent(no,key){
  const o=findOrderByNo(no); if(!o)return;
  const sent=o.emailsSent||[]; if(sent.includes(key))return;
  updateOrder(no,{emailsSent:[...sent,key]});
}

function orderItemsText(order){
  return order.items.map(i=>`  • ${i.qty}× ${i.name} — $${(i.price*i.qty).toFixed(2)}${i.color?' ('+i.color+')':''}`).join('\n');
}
function orderTotalsText(order){
  const sub=order.items.reduce((s,i)=>s+i.price*i.qty,0);
  const ship=Math.max(0,order.total-sub);
  return `Subtotal: $${sub.toFixed(2)}\nShipping: ${ship===0?'FREE':'$'+ship.toFixed(2)}\n${order.discount?'Discount ('+order.discount+'): applied\n':''}TOTAL: $${order.total.toFixed(2)}`;
}
function paymentDetailsText(methodKey){
  const cfg=getPaymentConfig(), m=cfg.methods[methodKey];
  if(!m) return '';
  if(methodKey==='cashapp') return `Pay via Cash App: ${m.url}\nInclude your order number in the payment note.`;
  return `${m.label} payment details:\n${m.details}`;
}

// Professional HTML version of the new-order notification (used by the
// Supabase/Resend path; FormSubmit delivers the plain-text + fields version).
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function orderEmailHtml(order){
  const sub=order.items.reduce((s,i)=>s+i.price*i.qty,0);
  const ship=Math.max(0,order.total-sub);
  const itemRows=order.items.map(i=>`<tr>
    <td style="padding:8px 0;border-bottom:1px solid #ece4d6">${esc(i.qty)}× ${esc(i.name)}${i.color?' <span style="color:#8a8177">('+esc(i.color)+')</span>':''}</td>
    <td style="padding:8px 0;border-bottom:1px solid #ece4d6;text-align:right;white-space:nowrap">$${(i.price*i.qty).toFixed(2)}</td></tr>`).join('');
  const row=(k,v)=>`<tr><td style="padding:7px 0;color:#8a8177;font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:top">${k}</td><td style="padding:7px 0;text-align:right;font-size:14px">${v}</td></tr>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:620px;margin:24px auto;background:#ffffff;border:1px solid #e4ddd1">
    <div style="background:#252525;color:#F8F6F2;padding:26px 30px;text-align:center">
      <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:4px">REPS <span style="font-style:italic;color:#c9b48a">LV</span> BAGS</div>
      <div style="margin-top:8px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#b8b0a2">New Order Received</div>
    </div>
    <div style="padding:30px">
      <p style="margin:0 0 20px;font-size:15px"><b style="font-size:17px">Order ${esc(order.orderNo)}</b><br>
      <span style="color:#8a8177;font-size:13px">Placed ${esc(new Date(order.orderDate).toLocaleString())}</span></p>
      <h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8177;border-bottom:1px solid #e4ddd1;padding-bottom:8px">Customer</h3>
      <table style="width:100%;border-collapse:collapse">${row('Name',esc(order.name))}${row('Email','<a href="mailto:'+esc(order.email)+'" style="color:#352820">'+esc(order.email)+'</a>')}${row('Phone',esc(order.phone||'—'))}</table>
      <h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8177;border-bottom:1px solid #e4ddd1;padding-bottom:8px">Delivery Address</h3>
      <p style="margin:0;font-size:14px;line-height:1.7">${esc(order.address)}<br>${esc(order.city)}, ${esc(order.state)} ${esc(order.zip)}</p>
      <h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8177;border-bottom:1px solid #e4ddd1;padding-bottom:8px">Items</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemRows}
        <tr><td style="padding:10px 0 0;font-size:13px;color:#8a8177">Subtotal</td><td style="padding:10px 0 0;text-align:right;font-size:13px">$${sub.toFixed(2)}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#8a8177">Shipping (${esc((order.ship||'standard').toUpperCase())})</td><td style="padding:4px 0;text-align:right;font-size:13px">${ship===0?'FREE':'$'+ship.toFixed(2)}</td></tr>
        ${order.discount?`<tr><td style="padding:4px 0;font-size:13px;color:#8a8177">Discount (${esc(order.discount)})</td><td style="padding:4px 0;text-align:right;font-size:13px">applied</td></tr>`:''}
        <tr><td style="padding:10px 0 0;font-size:16px;font-weight:bold;border-top:2px solid #252525">Total</td><td style="padding:10px 0 0;text-align:right;font-size:16px;font-weight:bold;border-top:2px solid #252525">$${order.total.toFixed(2)}</td></tr>
      </table>
      <h3 style="margin:22px 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a8177;border-bottom:1px solid #e4ddd1;padding-bottom:8px">Payment</h3>
      <table style="width:100%;border-collapse:collapse">${row('Method',esc(order.paymentMethod))}${row('Status',esc(order.paymentStatus))}</table>
      ${order.notes?`<p style="margin-top:16px;font-size:13px;color:#8a8177"><b>Customer notes:</b> ${esc(order.notes)}</p>`:''}
      <p style="margin-top:24px;font-size:12px;color:#8a8177">Review &amp; verify this order in the admin dashboard → Payments.</p>
    </div>
    <div style="background:#f8f6f2;padding:18px 30px;text-align:center;font-size:11px;color:#8a8177;letter-spacing:1px">
      House of Luxe · supportrepslvbags@gmail.com · repslvbags.com
    </div>
  </div></body></html>`;
}

// A. Order confirmation → customer
async function notifyOrderConfirmation(order){
  if(alreadySent(order,'order_confirmation'))return;
  await sendEmail(order.email,
    `Order Confirmed — House of Luxe #${order.orderNo}`,
    `Hi ${order.name},\n\nThank you for your order! Your order has been received and is awaiting payment verification.\n\nOrder Number: ${order.orderNo}\nPayment Method: ${order.paymentMethod}\nTotal: $${order.total.toFixed(2)}\n\nItems:\n${orderItemsText(order)}\n\n${orderTotalsText(order)}\n\nDelivery address:\n${order.address}, ${order.city}, ${order.state} ${order.zip}\n\nWe will send payment instructions via SMS and tracking updates by email as your order progresses.\n\n— House of Luxe\nsupportrepslvbags@gmail.com`);
  markSent(order.orderNo,'order_confirmation');
}

// B. Payment instructions → customer (Chime / Zelle)
async function notifyPaymentInstructions(order){
  if(alreadySent(order,'payment_instructions'))return;
  const methodKey=(order.paymentMethod||'').toLowerCase().replace(/\s/g,'');
  const key=methodKey==='cashapp'?'cashapp':methodKey;
  await sendEmail(order.email,
    `Payment Instructions — Order #${order.orderNo}`,
    `Hi ${order.name},\n\nYour order #${order.orderNo} is awaiting payment.\n\nAmount to pay: $${order.total.toFixed(2)}\nPayment method: ${order.paymentMethod}\nRequired payment reference: ${order.orderNo}\n\n${paymentDetailsText(key)}\n\nHow to pay:\n1. Send exactly $${order.total.toFixed(2)} using ${order.paymentMethod}.\n2. Include "${order.orderNo}" as the payment reference/note.\n3. After paying, submit your payment screenshot here:\n   https://repslvbags.com/payment-confirm.html?order=${order.orderNo}&email=${encodeURIComponent(order.email)}\n\nOur team verifies every payment manually before dispatch. You will receive a confirmation email once payment is verified.\n\nQuestions? supportrepslvbags@gmail.com\n\n— House of Luxe`);
  markSent(order.orderNo,'payment_instructions');
}

// C. New order → business owner (centralized Gmail)
async function notifyNewOrderToBusiness(order){
  if(alreadySent(order,'business_new_order'))return;
  const body=`NEW ORDER – #${order.orderNo}\n\nUnique reference: ${order.orderNo}\nOrder date & time: ${new Date(order.orderDate).toLocaleString()}\n\nCUSTOMER\n  Name: ${order.name}\n  Email: ${order.email}\n  Phone: ${order.phone||'—'}\n\nDELIVERY ADDRESS\n  ${order.address}, ${order.city}, ${order.state} ${order.zip}\n\nITEMS\n${orderItemsText(order)}\n\n${orderTotalsText(order)}\n\nPAYMENT\n  Method: ${order.paymentMethod}\n  Status: ${order.paymentStatus}\n  Shipping: ${(order.ship||'standard').toUpperCase()}\n\n${order.discount?'Discount code: '+order.discount+'\n':''}${order.notes?'Customer notes: '+order.notes+'\n':''}\nReview & verify in admin → Payments.`;
  const fields={
    'Order Number':order.orderNo,'Customer Name':order.name,'Customer Email':order.email,
    'Phone':order.phone||'—','Delivery Address':`${order.address}, ${order.city}, ${order.state} ${order.zip}`,
    'Items':order.items.map(i=>`${i.qty}x ${i.name} ($${(i.price*i.qty).toFixed(2)})`).join('; '),
    'Total':'$'+order.total.toFixed(2),'Payment Method':order.paymentMethod,
    'Payment Status':order.paymentStatus,'Order Date':new Date(order.orderDate).toLocaleString(),
    _replyto:order.email
  };
  await sendEmail(BUSINESS_EMAIL,
    `NEW ORDER – #${order.orderNo}`,
    body,{fields,html:orderEmailHtml(order)});
  markSent(order.orderNo,'business_new_order');
}

// D. Payment evidence submitted → business owner (centralized Gmail)
async function notifyEvidenceToBusiness(order){
  if(alreadySent(order,'business_evidence'))return;
  const body=`PAYMENT EVIDENCE – #${order.orderNo}\n\nOrder: ${order.orderNo}\nCustomer: ${order.name} <${order.email}>\nPayment method: ${order.paymentMethod}\nTransaction reference: ${order.transactionRef||'—'}\nAmount expected: $${order.total.toFixed(2)}\nSubmitted: ${order.evidenceSubmittedAt?new Date(order.evidenceSubmittedAt).toLocaleString():'—'}\nCustomer notes: ${order.paymentNotes||'—'}\n\nReview the screenshot securely in admin → Payments (it is stored privately and is never sent by email).\n\nVerify the actual incoming payment in your ${order.paymentMethod} account, then mark the order as Paid.`;
  const fields={
    'Order Number':order.orderNo,'Customer':`${order.name} <${order.email}>`,
    'Payment Method':order.paymentMethod,'Transaction Reference':order.transactionRef||'—',
    'Amount Expected':'$'+order.total.toFixed(2),
    'Submitted':order.evidenceSubmittedAt?new Date(order.evidenceSubmittedAt).toLocaleString():'—',
    'Customer Notes':order.paymentNotes||'—',_replyto:order.email
  };
  await sendEmail(BUSINESS_EMAIL,
    `PAYMENT EVIDENCE – #${order.orderNo}`,
    body,{fields});
  markSent(order.orderNo,'business_evidence');
}

// E. Payment verified → customer
async function notifyPaymentVerified(order){
  if(alreadySent(order,'payment_verified'))return;
  await sendEmail(order.email,
    `Payment Verified — Order #${order.orderNo}`,
    `Hi ${order.name},\n\nGreat news — we've verified your payment for order #${order.orderNo}.\n\nYour order is now being prepared for shipment. We'll email you tracking details as soon as it ships.\n\nTrack your order anytime: https://repslvbags.com/track-order.html\n\n— House of Luxe\nsupportrepslvbags@gmail.com`);
  markSent(order.orderNo,'payment_verified');
}

// F. Order shipped / status update → customer
async function notifyShipping(order){
  if(alreadySent(order,'shipping_'+order.status))return;
  await sendEmail(order.email,
    `Your Order #${order.orderNo} — ${order.status}`,
    `Hi ${order.name},\n\nYour order #${order.orderNo} is now: ${order.status}.\n\n${order.carrier?'Carrier: '+order.carrier+'\n':''}${order.tracking?'Tracking: '+order.tracking+'\n\nTrack it here: '+carrierTrackUrl(order.carrier,order.tracking)+'\n':''}\nTrack your order anytime: https://repslvbags.com/track-order.html\n\n— House of Luxe\nsupportrepslvbags@gmail.com`);
  markSent(order.orderNo,'shipping_'+order.status);
}
function carrierTrackUrl(carrier,tracking){
  if(!tracking)return'';
  const t=encodeURIComponent(tracking);
  return {USPS:`https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`,UPS:`https://www.ups.com/track?tracknum=${t}`,FedEx:`https://www.fedex.com/fedextrack/?trknbr=${t}`,DHL:`https://www.dhl.com/en/express/tracking.html?AWB=${t}`}[carrier]||'#';
}

// ---------- Customer messages → centralized Gmail ----------
// Every contact-form / inquiry / support message gets a unique MSG-XXXXXX
// reference, is logged locally for audit, and emailed to BUSINESS_EMAIL.
const MSG_LOG_KEY='vr_messages';
function getMessageLog(){return JSON.parse(localStorage.getItem(MSG_LOG_KEY)||'[]');}
const MSG_PREFIX={contact:'MSG',inquiry:'INQ',support:'SUP',newsletter:'NEWS'};
function genMsgRef(type){
  const log=getMessageLog();
  const prefix=MSG_PREFIX[type]||'MSG';
  let ref; do{ ref=prefix+'-'+Math.floor(1000+Math.random()*9000); }while(log.some(m=>m.ref===ref));
  return ref;
}
// msg: {name,email,orderNo,message,type}
// type: 'contact' | 'newsletter' | 'inquiry' | 'support'
async function notifyCustomerMessage(msg){
  const ref=genMsgRef(msg.type);
  const typeLabel={contact:'CUSTOMER MESSAGE',inquiry:'CUSTOMER INQUIRY',support:'CUSTOMER SUPPORT',newsletter:'NEWSLETTER SIGNUP'}[msg.type]||'CUSTOMER MESSAGE';
  const subject=`${typeLabel} – #${ref}`;
  const body=`${subject}\n\nReference: ${ref}\nType: ${typeLabel}\nReceived: ${new Date().toLocaleString()}\n\nFROM\n  Name: ${msg.name||'—'}\n  Email: ${msg.email||'—'}\n${msg.orderNo?'  Order #: '+msg.orderNo+'\n':''}\nMESSAGE\n${msg.message||'—'}\n\n— House of Luxe website`;
  const fields={
    'Reference':ref,'Type':typeLabel,'Name':msg.name||'—','Email':msg.email||'—',
    ...(msg.orderNo?{'Order Number':msg.orderNo}:{}),
    'Customer Message':msg.message||'—',_replyto:msg.email||undefined
  };
  // Persist first so the reference is never reused, even if email fails.
  const log=getMessageLog(); log.unshift({ref,type:msg.type||'contact',name:msg.name,email:msg.email,orderNo:msg.orderNo||'',message:msg.message,at:new Date().toISOString()});
  localStorage.setItem(MSG_LOG_KEY,JSON.stringify(log.slice(0,500)));
  await sendEmail(BUSINESS_EMAIL,subject,body,{fields});
  return {ref,subject};
}
