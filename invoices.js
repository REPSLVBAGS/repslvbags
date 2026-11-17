// ---------- Invoice system (client) ----------
// Talks to the 'invoices' Supabase Edge Function.
// Invoice creation is idempotent server-side (one invoice per order_no).

const INVOICES_API = 'https://wetxlhacaeakstqwqtdh.supabase.co/functions/v1/invoices';

function invoiceHeaders(extra){
  return Object.assign({'Content-Type':'application/json'}, extra||{});
}

// Recompute discount amount from the stored discount code.
function orderDiscountAmt(order, subtotal){
  if(!order.discount) return 0;
  try{
    const d=validateDiscount(order.discount);
    if(d&&d.percent) return subtotal*d.percent/100;
  }catch(e){}
  return 0;
}

// Called from checkout after the order is created. Fire-and-forget.
// Stores invoice_no + access token on the local order record for later use.
async function createInvoiceForOrder(order){
  try{
    // Snapshot payment instructions at order time so the invoice always shows
    // the correct details even if admin edits settings later.
    let payDetails='', payLabel=order.paymentMethod||'';
    try{
      const cfg=getPaymentConfig();
      const key=(order.paymentMethod||'').toLowerCase().replace(/\s/g,'');
      const m=cfg.methods[key];
      if(m){ payLabel=m.label||payLabel; payDetails=m.details||''; }
      if(key==='cashapp'&&cfg.methods.cashapp&&cfg.methods.cashapp.url){
        payDetails=(payDetails?payDetails+'\n':'')+'Pay here: '+cfg.methods.cashapp.url;
      }
    }catch(e){}

    const sub=order.items.reduce((s,i)=>s+i.price*i.qty,0);
    const discAmt=orderDiscountAmt(order,sub);
    // total = subtotal + shipping - discount  =>  shipping = total - subtotal + discount
    const ship=Math.max(0,(order.total||0)-sub+discAmt);

    const res=await fetch(INVOICES_API,{
      method:'POST',
      headers:invoiceHeaders({'x-email-secret':EMAIL_SECRET}),
      body:JSON.stringify({
        order_no:order.orderNo,
        customer_name:order.name,
        customer_email:order.email,
        customer_phone:order.phone||'',
        shipping_address:{address:order.address,city:order.city,state:order.state,zip:order.zip},
        items:order.items,
        subtotal:sub,
        shipping:ship,
        discount:discAmt,
        discount_code:order.discount||'',
        total:order.total,
        payment_method:(order.paymentMethod||'').toLowerCase().replace(/\s/g,''),
        payment_method_label:payLabel,
        payment_details:payDetails
      })
    });
    if(!res.ok){console.warn('Invoice creation failed:',await res.text());return null;}
    const data=await res.json();
    const inv=data.invoice;
    if(inv){
      // Store invoice reference on the local order (non-blocking)
      try{ updateOrder(order.orderNo,{invoiceNo:inv.invoice_no,invoiceToken:inv.access_token,invoiceUrl:'invoice.html?token='+inv.access_token}); }catch(e){}
    }
    return inv;
  }catch(e){console.warn('Invoice creation error:',e);return null;}
}

// Public: fetch invoice by secure token (customer invoice page)
async function fetchInvoiceByToken(token){
  const res=await fetch(INVOICES_API+'?token='+encodeURIComponent(token));
  if(!res.ok) return null;
  const data=await res.json();
  return data.invoice||null;
}

// Admin: list invoices
async function adminListInvoices(status,q){
  const p=new URLSearchParams();
  if(status&&status!=='all')p.set('status',status);
  if(q)p.set('q',q);
  const res=await fetch(INVOICES_API+'?'+p.toString(),{headers:{'x-email-secret':EMAIL_SECRET}});
  if(!res.ok)return null;
  const data=await res.json();
  return data.invoices||[];
}

// Admin: single invoice detail
async function adminGetInvoice(id){
  const res=await fetch(INVOICES_API+'?id='+id,{headers:{'x-email-secret':EMAIL_SECRET}});
  if(!res.ok)return null;
  const data=await res.json();
  return data.invoice||null;
}

// Admin: change payment status (PENDING/PAID/CANCELLED/REFUNDED)
async function adminSetInvoiceStatus(id,status,note){
  const res=await fetch(INVOICES_API,{
    method:'PATCH',
    headers:invoiceHeaders({'x-email-secret':EMAIL_SECRET}),
    body:JSON.stringify({id,status,note:note||''})
  });
  if(!res.ok)throw new Error(await res.text());
  return await res.json();
}

// Admin: resend invoice email
async function adminResendInvoice(id){
  const res=await fetch(INVOICES_API,{
    method:'POST',
    headers:invoiceHeaders({'x-email-secret':EMAIL_SECRET}),
    body:JSON.stringify({action:'resend',invoice_id:id})
  });
  if(!res.ok)throw new Error(await res.text());
  return await res.json();
}

// Sync invoice status when admin changes ORDER payment status via existing flow
async function syncInvoiceFromOrder(orderNo,invoiceStatus){
  try{
    const invs=await adminListInvoices('all',orderNo);
    const inv=(invs||[]).find(i=>i.order_no===orderNo);
    if(inv&&inv.payment_status!==invoiceStatus){
      await adminSetInvoiceStatus(inv.id,invoiceStatus,'Synced from order payment verification');
    }
  }catch(e){console.warn('Invoice sync failed:',e);}
}
