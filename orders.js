// ---------- Order database (localStorage — swap for Supabase later) ----------
const ORDER_STATUSES = ['Order Received','Payment Confirmed','Processing','Shipped','Out for Delivery','Delivered','Cancelled'];
// Payment lifecycle — separate from fulfillment status
const PAYMENT_STATUSES = ['Awaiting Payment','Payment Instructions Sent','Evidence Submitted','Pending Verification','Paid','Rejected','Cancelled','Refunded'];
const DB_KEY = 'vr_orders';

function seedOrders(){
  const mk=(no,name,email,total,status,daysAgo,extra={})=>({
    orderNo:no, email, name, phone:'(555) 010-2233',
    address:'123 Madison Ave', city:'New York', state:'NY', zip:'10001',
    items:[{name:'The Vintage Classic Flap Bag',price:145,qty:1},{name:'The Gold Chain Clutch',price:89,qty:1}],
    total, status, carrier:extra.carrier||'', tracking:extra.tracking||'',
    screenshot:extra.screenshot||'',
    paymentMethod:extra.paymentMethod||'Cash App',
    paymentStatus:extra.paymentStatus||'Paid',
    transactionRef:'', evidence:'', evidenceSubmittedAt:'', verifiedAt:'', verifiedBy:'', paymentNotes:'',
    emailsSent:[],
    orderDate:new Date(Date.now()-daysAgo*864e5).toISOString(),
    estDelivery:new Date(Date.now()+(5-daysAgo)*864e5).toISOString()
  });
  return [
    mk('ORD-1001','Amara Johnson','amara@example.com',234,'Delivered',12,{carrier:'USPS',tracking:'9400111899223456789012',paymentMethod:'Cash App'}),
    mk('ORD-1002','Sofia Martinez','sofia@example.com',217,'Shipped',3,{carrier:'UPS',tracking:'1Z999AA10123456784',paymentMethod:'Zelle'}),
    mk('ORD-1003','Jasmine Rivera','jasmine@example.com',187,'Processing',1,{paymentMethod:'Chime',paymentStatus:'Paid'}),
  ];
}

function getOrders(){
  let orders = JSON.parse(localStorage.getItem(DB_KEY)||'null');
  if(!orders){ orders = seedOrders(); localStorage.setItem(DB_KEY, JSON.stringify(orders)); }
  return orders;
}
function saveOrders(o){ try{localStorage.setItem(DB_KEY, JSON.stringify(o));}catch(e){console.warn('Order save failed (storage full):',e);} }
// Mirror every order write to Supabase when configured (non-blocking).
function syncOrder(no){ const o=findOrderByNo(no); if(o&&typeof sbUpsertOrder==='function') sbUpsertOrder(o); }
function findOrder(no,email){
  return getOrders().find(o=>o.orderNo.toLowerCase()===no.trim().toLowerCase() && o.email.toLowerCase()===email.trim().toLowerCase());
}
function findOrderByNo(no){
  return getOrders().find(o=>o.orderNo.toLowerCase()===no.trim().toLowerCase());
}
function orderExists(no){ return !!findOrderByNo(no); }
function saveNewOrder(order){
  const orders=getOrders();
  if(orders.some(o=>o.orderNo===order.orderNo)) return orders.find(o=>o.orderNo===order.orderNo); // idempotent
  orders.unshift(order); saveOrders(orders); syncOrder(order.orderNo); return order;
}
function updateOrder(no, patch){
  const orders=getOrders();
  const o=orders.find(x=>x.orderNo===no);
  if(o){Object.assign(o,patch);saveOrders(orders);syncOrder(no);}
  return o;
}

// ---------- Payment workflow ----------
// Create a pending order. paymentStatus starts unpaid — NEVER auto-paid.
function createPendingOrder(data){
  return saveNewOrder({
    orderNo:data.orderNo, email:data.email, name:data.name, phone:data.phone||'',
    address:data.address, city:data.city, state:data.state, zip:data.zip,
    items:data.items, total:data.total, discount:data.discount||'', ship:data.ship||'standard',
    status:'Order Received', carrier:'', tracking:'',
    paymentMethod:data.paymentMethod, paymentStatus:data.paymentStatus||'Awaiting Payment',
    transactionRef:'', evidence:'', evidenceSubmittedAt:'', verifiedAt:'', verifiedBy:'', paymentNotes:'',
    emailsSent:[], screenshot:'',
    orderDate:new Date().toISOString(),
    estDelivery:new Date(Date.now()+5*864e5).toISOString()
  });
}

// Customer submits payment evidence (screenshot). Evidence is stored privately
// on the order record — never exposed via public URL. Admin views it inside
// the authenticated admin panel only.
function submitPaymentEvidence(no, email, payload){
  const o=findOrder(no,email);
  if(!o) return {ok:false,error:'Order not found. Check your order number and email.'};
  if(o.paymentStatus==='Paid') return {ok:false,error:'This order is already verified as paid.'};
  if(o.paymentStatus==='Evidence Submitted'||o.paymentStatus==='Pending Verification')
    return {ok:false,error:'Evidence already submitted for this order. Our team is reviewing it.'};
  if(['Cancelled','Refunded'].includes(o.paymentStatus))
    return {ok:false,error:'This order is '+o.paymentStatus.toLowerCase()+'.'};
  const updated=updateOrder(no,{
    transactionRef:payload.transactionRef||'',
    evidence:payload.evidencePath?'':(payload.evidence||''), // dataURL fallback only when no cloud copy
    evidencePath:payload.evidencePath||'',  // Supabase storage path (preferred)
    evidenceSubmittedAt:new Date().toISOString(),
    paymentNotes:payload.notes||'',
    paymentStatus:'Evidence Submitted'
  });
  return {ok:true,order:updated};
}

// Admin verifies the actual incoming payment in the business account.
// This is the ONLY path to paymentStatus 'Paid'.
function verifyPayment(no, adminEmail){
  const o=findOrderByNo(no); if(!o) return null;
  const wasPaid=o.paymentStatus==='Paid';
  const updated=updateOrder(no,{
    paymentStatus:'Paid', verifiedAt:new Date().toISOString(), verifiedBy:adminEmail||'admin',
    status:o.status==='Order Received'?'Payment Confirmed':o.status
  });
  return {order:updated,alreadyPaid:wasPaid};
}
function rejectPayment(no, reason){
  return updateOrder(no,{paymentStatus:'Rejected', paymentNotes:reason||''});
}
function requestMoreInfo(no, note){
  return updateOrder(no,{paymentStatus:'Payment Instructions Sent', paymentNotes:note||''});
}

// Email hook — real sending needs a backend (Supabase Edge Function / email API).
// email.js queues + logs every notification; wire sendEmail() to your provider.
function notifyStatusChange(order, newStatus){
  console.log(`[EMAIL] To: ${order.email} — "Your House of Luxe Order #${order.orderNo} is now ${newStatus}"`);
  return {to:order.email, subject:`Your House of Luxe Order #${order.orderNo} is now ${newStatus}`,
    body:`Hi ${order.name},\n\nYour order #${order.orderNo} status has been updated to: ${newStatus}.\n\nTrack it anytime at /track-order\n\n— House of Luxe`};
}
