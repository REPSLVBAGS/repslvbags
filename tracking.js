// ---------- Shared order rendering (used by track-order page) ----------
const TL_STEPS = ['Order Received','Payment Confirmed','Shipped','Delivered'];
function statusIndex(s){ return ORDER_STATUSES.indexOf(s); }
// map order status -> how many of the 4 visual steps are complete
function tlProgress(status){
  if(status==='Cancelled') return -1;
  if(status==='Delivered') return 4;
  if(status==='Out for Delivery') return 3;
  if(status==='Shipped') return 3; // shipped step done, delivered pending
  if(status==='Processing') return 2;
  if(status==='Payment Confirmed') return 2;
  return 1; // Order Received
}
function carrierLink(carrier, tracking){
  const t=encodeURIComponent(tracking);
  const links={USPS:`https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`,UPS:`https://www.ups.com/track?tracknum=${t}`,FedEx:`https://www.fedex.com/fedextrack/?trknbr=${t}`,DHL:`https://www.dhl.com/en/express/tracking.html?AWB=${t}`};
  return links[carrier]||'#';
}
function fmtDate(iso){return new Date(iso).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});}

function renderTracking(order){
  const prog=tlProgress(order.status);
  const cancelled=order.status==='Cancelled';
  const steps=TL_STEPS.map((label,i)=>{
    let cls='';
    if(cancelled) cls='';
    else if(i<prog) cls='done';
    else if(i===prog) cls='current';
    const icons=['✓','✓','🚚','✓'];
    let extra='';
    if(label==='Shipped' && order.tracking){
      extra=`<p>${order.carrier||'Carrier'} · ${order.tracking}</p><a href="${carrierLink(order.carrier,order.tracking)}" target="_blank" rel="noopener">Track on ${order.carrier||'carrier site'} →</a>`;
    }
    if(label==='Payment Confirmed') extra=`<p>${order.paymentMethod||'Payment'} Verified</p>`;
    return `<div class="tl-step ${cls}">
      <div class="tl-dot">${cls==='done'||cls==='current'?'✓':icons[i]}</div>
      <div class="tl-info"><h4>${label}</h4>${extra||'<p>'+(cls==='done'?'Completed':'Pending')+'</p>'}</div>
      ${i<TL_STEPS.length-1?'<div class="tl-line"></div>':''}
    </div>`;
  }).join('');

  const items=order.items.map(i=>`<div class="order-item">
    <div class="oi-img"><svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"><rect x="80" y="110" width="140" height="110" rx="14" fill="#6B4F3A"/><circle cx="150" cy="165" r="10" fill="#3d2c1e"/></svg></div>
    <span class="oi-name">${i.qty}× ${i.name}</span><span class="oi-price">$${(i.price*i.qty).toFixed(2)}</span>
  </div>`).join('');

  const cls=order.status==='Delivered'?'delivered':(order.status==='Shipped'||order.status==='Out for Delivery')?'shipped':order.status==='Cancelled'?'cancelled':'';
  return `<div class="result-card">
    <div class="result-head">
      <div><h2>Order #${order.orderNo}</h2><div class="meta">Placed ${fmtDate(order.orderDate)}</div></div>
      <div class="meta">${order.name}<br>${order.email}</div>
    </div>
    <div class="status-big ${cls}">${order.status==='Cancelled'?'ORDER CANCELLED':order.status.toUpperCase()}</div>
    <div class="timeline">${steps}</div>
    <div class="result-grid">
      <div class="result-block"><h4>Items Ordered</h4>${items}<p style="margin-top:10px"><b>Total: $${order.total.toFixed(2)}</b></p></div>
      <div>
        <div class="result-block"><h4>Estimated Delivery</h4><p>${order.status==='Delivered'?'Delivered':fmtDate(order.estDelivery)}</p></div>
        <div class="result-block" style="margin-top:18px"><h4>Shipping Address</h4><p>${order.address}<br>${order.city}, ${order.state} ${order.zip}</p></div>
      </div>
    </div>
  </div>`;
}

// track page wiring
document.getElementById('trackForm').onsubmit=e=>{
  e.preventDefault();
  const order=findOrder(document.getElementById('tOrder').value, document.getElementById('tEmail').value);
  document.getElementById('trackError').classList.add('hidden');
  const box=document.getElementById('trackResult');
  if(!order){box.classList.add('hidden');box.innerHTML='';document.getElementById('trackError').classList.remove('hidden');return;}
  box.innerHTML=renderTracking(order);box.classList.remove('hidden');
  box.scrollIntoView({behavior:'smooth',block:'start'});
};
