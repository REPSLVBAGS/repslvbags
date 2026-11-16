// ---------- Admin CMS ----------
const ALL_COLORS=['Black','Beige','Brown','White','Red'];
let pendingImages=[]; // dataURLs for product form

// ---------- AUTH ----------
function doLogin(){
  if(checkAdmin(document.getElementById('loginEmail').value, document.getElementById('loginPass').value)){
    sessionStorage.setItem('vr_admin','1');
    enterAdmin();
  } else document.getElementById('loginErr').classList.remove('hidden');
}
function doLogout(){sessionStorage.removeItem('vr_admin');location.reload();}
function enterAdmin(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminShell').classList.remove('hidden');
  route();
}

// ---------- ROUTER ----------
function route(){
  const h=(location.hash||'#/dashboard').replace('#/','');
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===h));
  const view=document.getElementById('view-'+h)||document.getElementById('view-dashboard');
  view.classList.remove('hidden');
  if(h==='dashboard') renderDashboard();
  if(h==='products') renderProductList();
  if(h==='orders') renderOrdersTable();
  if(h==='tracking') renderTrackingView();
  if(h==='payments') renderPayments();
  if(h==='settings') loadPaymentSettings();
  if(h==='content') loadContentForm();
  updateNavBadges();
}
function updateNavBadges(){
  const orders=getOrders();
  const set=(id,n)=>{const el=document.getElementById(id);if(el){el.textContent=n||'';el.style.display=n?'inline-flex':'none';}};
  set('badge-orders',orders.length);
  set('badge-tracking',orders.filter(needsAction).length);
  set('badge-payments',orders.filter(o=>!['Paid','Rejected','Cancelled','Refunded'].includes(o.paymentStatus||'Awaiting Payment')).length);
}
window.addEventListener('hashchange',route);

// ---------- DASHBOARD ----------
function renderDashboard(){
  const orders=getOrders(), products=getProducts();
  const now=new Date(), monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const monthOrders=orders.filter(o=>new Date(o.orderDate)>=monthStart);
  const sales=monthOrders.reduce((s,o)=>s+o.total,0);
  const pending=orders.filter(o=>!['Delivered','Cancelled'].includes(o.status)).length;
  document.getElementById('statGrid').innerHTML=`
    <div class="stat-card"><div class="num">$${sales.toFixed(0)}</div><div class="lbl">Total Sales (This Month)</div></div>
    <div class="stat-card"><div class="num">${orders.length}</div><div class="lbl">Total Orders</div></div>
    <div class="stat-card"><div class="num">${products.filter(p=>p.status==='active').length}</div><div class="lbl">Total Products</div></div>
    <div class="stat-card ${pending?'warn':''}"><div class="num">${pending}</div><div class="lbl">Pending Orders</div></div>`;

  const recent=[...orders].sort((a,b)=>b.orderNo.localeCompare(a.orderNo)).slice(0,5);
  document.getElementById('recentOrders').innerHTML=`<tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr>`+
    recent.map(o=>`<tr><td>${o.orderNo}</td><td>${o.name}</td><td>$${o.total.toFixed(2)}</td><td>${o.status}</td></tr>`).join('')||'<tr><td colspan="4">No orders yet</td></tr>';

  const attention=orders.filter(needsAction).sort((a,b)=>a.orderDate.localeCompare(b.orderDate));
  document.getElementById('attentionList').innerHTML=attention.length?attention.map(o=>{
    const why=payStatusOf(o)!=='Paid'?'Payment not verified':!o.tracking?'Missing tracking #':'Needs update';
    return `<a href="#/tracking" class="attn-item"><span><b>${o.orderNo}</b> — ${o.name}<br><small>${why}</small></span><span class="attn-go">Open →</span></a>`;
  }).join(''):'<p class="all-good">✓ Nothing needs attention right now</p>';

  const low=products.filter(p=>p.stock<3&&p.status==='active');
  document.getElementById('lowStock').innerHTML=low.length?low.map(p=>`<div class="low-stock-item"><span>${p.name}</span><b>${p.stock} left</b></div>`).join(''):'<p class="all-good">✓ All products well stocked</p>';
}

// ---------- PRODUCTS ----------
function renderProductList(){
  const q=(document.getElementById('prodSearch').value||'').toLowerCase();
  const f=document.getElementById('prodFilter').value;
  const list=getProducts().filter(p=>(!q||p.name.toLowerCase().includes(q))&&(!f||p.style===f));
  document.getElementById('productList').innerHTML=`<div class="prod-grid">`+list.map(p=>`
    <div class="prod-card">
      <div class="pc-img">${p.images&&p.images.length?`<img src="${p.images[0]}">`:bagSVG(p,0)}</div>
      <h4>${p.name}</h4>
      <div class="pc-meta">$${p.price} · ${p.style} · Stock: ${p.stock} · <span class="status-pill ${p.status}">${p.status}</span></div>
      <div class="pc-actions">
        <button onclick="editProduct(${p.id})">Edit</button>
        <button onclick="duplicateProduct(${p.id})">Duplicate</button>
        <button onclick="toggleProduct(${p.id})">${p.status==='active'?'Hide':'Show'}</button>
        <button class="danger" onclick="deleteProduct(${p.id})">Delete</button>
      </div>
    </div>`).join('')+`</div>`;
}
function openProductForm(p){
  pendingImages=p&&p.images?p.images.slice():[];
  document.getElementById('prodFormTitle').textContent=p?'Edit Product':'Add New Product';
  document.getElementById('pfId').value=p?p.id:'';
  document.getElementById('pfName').value=p?p.name:'';
  document.getElementById('pfPrice').value=p?p.price:'';
  document.getElementById('pfCompare').value=p?p.comparePrice||'':'';
  document.getElementById('pfStyle').value=p?p.style:'Tote';
  document.getElementById('pfStock').value=p?p.stock:10;
  document.getElementById('pfDesc').value=p?p.desc:'';
  document.getElementById('pfStatus').value=p?p.status:'active';
  document.querySelectorAll('#pfColors input').forEach(c=>c.checked=p&&p.colors.includes(c.value));
  renderImgPreview();
  document.getElementById('prodModal').classList.remove('hidden');
}
function closeProductForm(){document.getElementById('prodModal').classList.add('hidden');}
function renderImgPreview(){
  document.getElementById('imgPreview').innerHTML=pendingImages.map((s,i)=>`<img src="${s}"><button type="button" onclick="pendingImages.splice(${i},1);renderImgPreview()" style="position:absolute">✕</button>`).join('');
}
// color checkboxes built once
document.getElementById('pfColors').innerHTML=ALL_COLORS.map(c=>`<label><input type="checkbox" value="${c}"> ${c}</label>`).join('');

// drag & drop + file input
const dz=document.getElementById('dropzone'), fi=document.getElementById('pfImages');
dz.onclick=()=>fi.click();
fi.onchange=()=>{[...fi.files].slice(0,5-pendingImages.length).forEach(readImg);fi.value='';};
dz.ondragover=e=>{e.preventDefault();dz.classList.add('drag');};
dz.ondragleave=()=>dz.classList.remove('drag');
dz.ondrop=e=>{e.preventDefault();dz.classList.remove('drag');[...e.dataTransfer.files].slice(0,5-pendingImages.length).forEach(readImg);};
function readImg(file){
  if(!file.type.startsWith('image/'))return;
  const r=new FileReader();
  r.onload=ev=>{if(pendingImages.length<5){pendingImages.push(ev.target.result);renderImgPreview();}};
  r.readAsDataURL(file);
}
document.getElementById('prodForm').onsubmit=e=>{
  e.preventDefault();
  const products=getProducts();
  const id=document.getElementById('pfId').value;
  const colors=[...document.querySelectorAll('#pfColors input:checked')].map(c=>c.value);
  if(!colors.length)return alert('Pick at least one color.');
  const data={
    name:document.getElementById('pfName').value.trim(),
    price:parseFloat(document.getElementById('pfPrice').value),
    comparePrice:parseFloat(document.getElementById('pfCompare').value)||0,
    style:document.getElementById('pfStyle').value,
    colors, stock:parseInt(document.getElementById('pfStock').value)||0,
    desc:document.getElementById('pfDesc').value.trim(),
    images:pendingImages.slice(0,5),
    status:document.getElementById('pfStatus').value,
    bestseller:id?products.find(p=>p.id==id).bestseller:0
  };
  if(id){const i=products.findIndex(p=>p.id==id);products[i]={...products[i],...data};}
  else products.push({id:nextProductId(),...data});
  saveProducts(products);closeProductForm();renderProductList();
  alert('Product published! It\'s live on the shop page (refresh index.html).');
};
function editProduct(id){openProductForm(getProducts().find(p=>p.id===id));}
function duplicateProduct(id){
  const p=getProducts().find(x=>x.id===id);if(!p)return;
  const copy={...p,id:nextProductId(),name:p.name+' (Copy)',status:'draft',stock:0};
  const products=getProducts();products.push(copy);saveProducts(products);renderProductList();
}
function toggleProduct(id){
  const products=getProducts();const p=products.find(x=>x.id===id);
  p.status=p.status==='active'?'draft':'active';saveProducts(products);renderProductList();
}
function deleteProduct(id){
  if(!confirm('Delete this product permanently?'))return;
  saveProducts(getProducts().filter(p=>p.id!==id));renderProductList();
}

// ---------- ORDERS ----------
function renderOrdersTable(){
  const orders=getOrders().slice().sort((a,b)=>b.orderNo.localeCompare(a.orderNo));
  document.getElementById('ordersBody').innerHTML=orders.map(o=>`
    <tr>
      <td><b>${o.orderNo}</b></td><td>${o.name}</td>
      <td>${o.items.map(i=>`${i.qty}× ${i.name}`).join('<br>')}</td>
      <td>$${o.total.toFixed(2)}</td>
      <td>${(o.evidence||o.evidencePath)?`<a href="#" onclick="viewEvidence('${o.orderNo}');return false" style="color:var(--gold)">📎 View</a>`:'—'}</td>
      <td><span class="status-pill ${o.status==='Delivered'?'active':o.status==='Cancelled'?'soldout':'draft'}">${o.status}</span></td>
      <td>${fmtDate(o.orderDate)}</td>
      <td><button class="btn-ghost" style="padding:6px 12px;font-size:11px" onclick="openOrder('${o.orderNo}')">Manage</button></td>
    </tr>`).join('');
}
function viewShot(no){viewEvidence(no);}
function openOrder(no){
  const o=getOrders().find(x=>x.orderNo===no);if(!o)return;
  document.getElementById('orderDetail').innerHTML=`
    <h2 style="font-size:22px;margin-bottom:4px">Order ${o.orderNo}</h2>
    <p style="color:var(--gray);font-size:13px;margin-bottom:18px">${fmtDate(o.orderDate)} · $${o.total.toFixed(2)}${o.discount?' · Discount: '+o.discount:''}</p>
    <div class="panel" style="margin-bottom:14px">
      <h3>Customer</h3>
      <p style="font-size:14px">${o.name}<br>${o.email}<br>${o.phone||''}<br>${o.address}, ${o.city}, ${o.state} ${o.zip}</p>
    </div>
    <div class="panel" style="margin-bottom:14px">
      <h3>Items</h3>
      ${o.items.map(i=>`<p style="font-size:14px">${i.qty}× ${i.name} — $${(i.price*i.qty).toFixed(2)}</p>`).join('')}
    </div>
    <div class="panel" style="margin-bottom:14px">
      <h3>Payment</h3>
      <p style="font-size:14px">Method: <b>${o.paymentMethod||'—'}</b><br>Status: <b>${o.paymentStatus||'Awaiting Payment'}</b>${o.transactionRef?'<br>Ref: '+o.transactionRef:''}${o.verifiedAt?'<br>Verified: '+fmtDate(o.verifiedAt):''}</p>
      ${(o.evidence||o.evidencePath)?`<button class="btn-ghost" style="margin-top:8px;padding:8px 14px;font-size:12px" onclick="viewEvidence('${o.orderNo}')">🖼 View Screenshot</button>`:'<p style="font-size:13px;color:var(--gray);margin-top:6px">No screenshot uploaded</p>'}
      ${o.paymentStatus!=='Paid'?`<button class="btn-gold" style="margin-top:10px;padding:10px 18px;font-size:12px" onclick="adminVerifyPayment('${o.orderNo}');document.getElementById('orderModal').classList.add('hidden')">✓ Mark as Paid (verified in ${o.paymentMethod||'account'})</button>`:''}
    </div>
    <div class="panel">
      <h3>Shipping & Status</h3>
      <label style="font-size:12px">Status
        <select id="oStatus" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #d8cfc0">${ORDER_STATUSES.map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select>
      </label>
      <div class="two-col" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
        <label style="font-size:12px">Carrier
          <select id="oCarrier" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #d8cfc0">${['','USPS','UPS','FedEx','DHL'].map(c=>`<option ${c===o.carrier?'selected':''}>${c||'—'}</option>`).join('')}</select>
        </label>
        <label style="font-size:12px">Tracking Number
          <input id="oTracking" value="${o.tracking||''}" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #d8cfc0">
        </label>
      </div>
      <button class="btn-gold full" style="margin-top:14px" onclick="saveOrder('${o.orderNo}')">Save Changes & Notify Customer</button>
    </div>`;
  document.getElementById('orderModal').classList.remove('hidden');
}
function markPaid(no){
  const res=verifyPayment(no,'admin');
  if(res&&!res.alreadyPaid){notifyPaymentVerified(res.order);notifyStatusChange(res.order,res.order.status);}
  alert('Order marked as paid.');openOrder(no);renderOrdersTable();
}
function saveOrder(no){
  const status=document.getElementById('oStatus').value;
  const carrier=document.getElementById('oCarrier').value;
  const tracking=document.getElementById('oTracking').value.trim();
  const order=updateOrder(no,{status,carrier,tracking});
  if(order){notifyStatusChange(order,status);if(['Shipped','Out for Delivery','Delivered'].includes(status))notifyShipping(order);}
  alert(`Order ${no} → ${status}. Email notification queued.`);
  document.getElementById('orderModal').classList.add('hidden');
  renderOrdersTable();
}

// ---------- ORDER DESK (tracking + real-time management) ----------
let trackTab='all';
function setTrackTab(t){
  trackTab=t;
  document.querySelectorAll('.track-tab').forEach(b=>b.classList.toggle('active',b.dataset.tt===t));
  renderTrackingView();
}
function needsAction(o){
  const unpaid=!['Paid'].includes(o.paymentStatus||'Paid');
  return unpaid || (['Payment Confirmed','Processing'].includes(o.status) && !o.tracking);
}
function renderTrackingView(){
  const q=(document.getElementById('trackSearch').value||'').toLowerCase();
  let orders=getOrders().slice().sort((a,b)=>b.orderNo.localeCompare(a.orderNo));
  if(trackTab==='action') orders=orders.filter(needsAction);
  else if(trackTab==='transit') orders=orders.filter(o=>['Shipped','Out for Delivery'].includes(o.status));
  else if(trackTab==='delivered') orders=orders.filter(o=>o.status==='Delivered');
  else if(trackTab==='cancelled') orders=orders.filter(o=>o.status==='Cancelled');
  if(q) orders=orders.filter(o=>(o.orderNo+o.name+o.email+(o.tracking||'')).toLowerCase().includes(q));

  const box=document.getElementById('trackingList');
  if(!orders.length){box.innerHTML='<p class="all-good">Nothing here — all caught up. ✓</p>';return;}

  box.innerHTML=orders.map(o=>{
    const idx=ORDER_STATUSES.indexOf(o.status);
    const next=ORDER_STATUSES[idx+1];
    const paid=payStatusOf(o)==='Paid'||['Payment Confirmed','Processing','Shipped','Out for Delivery','Delivered'].includes(o.status);
    const shipSteps=['Processing','Shipped','Out for Delivery','Delivered'];
    const shipIdx=['Processing','Shipped','Out for Delivery','Delivered'].indexOf(o.status);
    return `<div class="ship-card ${needsAction(o)?'needs':''}">
      <div class="ship-head">
        <div>
          <b style="font-size:16px">${o.orderNo}</b> — ${o.name}
          <span style="color:var(--gray);font-size:12px"> · ${o.email} · ${fmtDate(o.orderDate)}</span><br>
          <span style="font-size:12px;color:var(--gray)">${o.city}, ${o.state} ${o.zip||''} · $${o.total.toFixed(2)}</span>
        </div>
        <span class="status-pill ${o.status==='Delivered'?'active':o.status==='Cancelled'?'soldout':'draft'}">${o.status}</span>
      </div>

      <div class="ship-items">${o.items.map(i=>`${i.qty}× ${i.name}`).join(' · ')}</div>

      <div class="ship-grid">
        <div class="ship-block">
          <h5>Payment</h5>
          ${paid
            ?`<span class="pay-ok">✓ ${o.paymentMethod||'Payment'} Confirmed</span>`
            :`<span class="pay-wait">⏳ Awaiting verification</span>
              ${(o.evidence||o.evidencePath)?`<button class="btn-ghost" style="margin-top:6px;padding:6px 12px;font-size:12px" onclick="viewEvidence('${o.orderNo}')">🖼 View screenshot</button>`:'<span style="font-size:12px;color:#b8860b">No screenshot uploaded</span>'}
              <button class="btn-gold" style="margin-top:8px;padding:8px 14px;font-size:12px" onclick="confirmPayment('${o.orderNo}')">✓ Confirm ${o.paymentMethod||'Payment'} Received</button>`}
        </div>
        <div class="ship-block">
          <h5>Shipping</h5>
          <div class="ship-meta">
            ${o.carrier?`<span>📦 ${o.carrier}</span>`:'<span class="miss">No carrier</span>'}
            ${o.tracking?`<span>🔢 ${o.tracking}</span>`:'<span class="miss">No tracking #</span>'}
            ${o.tracking?`<a href="${carrierLink(o.carrier,o.tracking)}" target="_blank" rel="noopener" style="color:var(--gold);font-size:12px">Track parcel ↗</a>`:''}
          </div>
          <div class="ship-actions">
            <select id="tc-${o.orderNo}">${['','USPS','UPS','FedEx','DHL'].map(c=>`<option ${c===(o.carrier||'')?'selected':''}>${c||'Carrier…'}</option>`).join('')}</select>
            <input id="tt-${o.orderNo}" placeholder="Tracking number" value="${o.tracking||''}">
            <button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="saveShipInfo('${o.orderNo}')">Save</button>
          </div>
        </div>
      </div>

      <div class="ship-block" style="margin-top:14px">
        <h5>Status</h5>
        <div class="ship-actions">
          <select id="ts-${o.orderNo}">${ORDER_STATUSES.map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select>
          <button class="btn-gold" style="padding:9px 16px;font-size:12px" onclick="quickShipUpdate('${o.orderNo}')">Update Status</button>
          ${next&&!['Delivered','Cancelled'].includes(o.status)?`<button class="btn-ghost" style="padding:9px 14px;font-size:12px" onclick="quickAdvance('${o.orderNo}','${next}')">→ ${next}</button>`:''}
          <button class="btn-ghost" style="padding:9px 14px;font-size:12px" onclick="openOrder('${o.orderNo}')">Full Details</button>
        </div>
        <div class="mini-steps">${shipSteps.map((s,i)=>`<span class="mini-step ${shipIdx>=i?'done':o.status==='Cancelled'?'':'pending'}">${s}</span>`).join('<span class="mini-arrow">→</span>')}</div>
      </div>

      <div class="ship-block" style="margin-top:14px">
        <h5>Internal Notes</h5>
        <div class="ship-actions">
          <input id="tn-${o.orderNo}" placeholder="e.g. Customer called, prefers Saturday delivery…" value="${o.notes||''}">
          <button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="saveNote('${o.orderNo}')">Save Note</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function confirmPayment(no){
  const o=getOrders().find(x=>x.orderNo===no);if(!o)return;
  const res=verifyPayment(no,'admin');
  if(res&&!res.alreadyPaid){notifyPaymentVerified(res.order);notifyStatusChange(res.order,res.order.status);}
  renderTrackingView();
}
function saveShipInfo(no){
  const carrier=document.getElementById('tc-'+no).value;
  const tracking=document.getElementById('tt-'+no).value.trim();
  updateOrder(no,{carrier,tracking});
  renderTrackingView();
}
function saveNote(no){
  updateOrder(no,{notes:document.getElementById('tn-'+no).value});
  renderTrackingView();
}
function quickShipUpdate(no){
  const status=document.getElementById('ts-'+no).value;
  const o=updateOrder(no,{status});
  if(o){notifyStatusChange(o,status);if(['Shipped','Out for Delivery','Delivered'].includes(status))notifyShipping(o);}
  renderTrackingView();
}
function quickAdvance(no,status){
  const o=getOrders().find(x=>x.orderNo===no);if(!o)return;
  updateOrder(no,{status});
  notifyStatusChange(o,status);
  if(['Shipped','Out for Delivery','Delivered'].includes(status))notifyShipping(o);
  renderTrackingView();
}

// ---------- PAYMENTS (verification desk) ----------
let payTab='pending', payMethodFilter='all';
const PAY_TABS=[['pending','Awaiting / Evidence'],['paid','Paid'],['rejected','Rejected'],['all','All']];
function setPayTab(t){payTab=t;renderPayments();}
function setPayMethod(t){payMethodFilter=t;renderPayments();}
function payStatusOf(o){return o.paymentStatus||'Awaiting Payment';}
function renderPayments(){
  // status tabs
  document.getElementById('payTabs').innerHTML=PAY_TABS.map(([k,l])=>`<button class="track-tab ${payTab===k?'active':''}" data-pt="${k}" onclick="setPayTab('${k}')">${l}</button>`).join('');
  // method tabs
  const methods=['all','Cash App','Chime','Zelle','Apple Pay'];
  document.getElementById('payMethodTabs').innerHTML=methods.map(m=>`<button class="track-tab ${payMethodFilter===m?'active':''}" data-pm="${m}" onclick="setPayMethod('${m}')">${m==='all'?'All Methods':m}</button>`).join('');

  const q=(document.getElementById('paySearch').value||'').toLowerCase();
  let orders=getOrders().slice().sort((a,b)=>b.orderNo.localeCompare(a.orderNo));
  if(payTab==='pending') orders=orders.filter(o=>!['Paid','Rejected','Cancelled','Refunded'].includes(payStatusOf(o)));
  else if(payTab==='paid') orders=orders.filter(o=>payStatusOf(o)==='Paid');
  else if(payTab==='rejected') orders=orders.filter(o=>['Rejected','Cancelled','Refunded'].includes(payStatusOf(o)));
  if(payMethodFilter!=='all') orders=orders.filter(o=>(o.paymentMethod||'').toLowerCase()===payMethodFilter.toLowerCase());
  if(q) orders=orders.filter(o=>(o.orderNo+o.name+o.email+(o.transactionRef||'')).toLowerCase().includes(q));

  const box=document.getElementById('paymentsList');
  if(!orders.length){box.innerHTML='<p class="all-good">Nothing here — all caught up. ✓</p>';return;}

  box.innerHTML=orders.map(o=>{
    const ps=payStatusOf(o);
    const hasEvidence=!!(o.evidence||o.evidencePath);
    return `<div class="ship-card ${ps!=='Paid'?'needs':''}">
      <div class="ship-head">
        <div>
          <b style="font-size:16px">${o.orderNo}</b> — ${o.name}
          <span style="color:var(--gray);font-size:12px"> · ${o.email} · ${o.paymentMethod||'—'} · $${o.total.toFixed(2)}</span><br>
          <span style="font-size:12px;color:var(--gray)">${fmtDate(o.orderDate)}${o.transactionRef?' · Ref: '+o.transactionRef:''}</span>
        </div>
        <span class="status-pill ${ps==='Paid'?'active':ps==='Rejected'?'soldout':'draft'}">${ps}</span>
      </div>
      <div class="ship-items">${o.items.map(i=>`${i.qty}× ${i.name}`).join(' · ')}</div>
      <div class="ship-grid">
        <div class="ship-block">
          <h5>Evidence</h5>
          ${hasEvidence
            ?`<button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="viewEvidence('${o.orderNo}')">🖼 View Screenshot</button>
              <span style="font-size:12px;color:var(--gray);display:block;margin-top:6px">Submitted ${o.evidenceSubmittedAt?fmtDate(o.evidenceSubmittedAt):'—'}</span>`
            :'<span style="font-size:12px;color:#b8860b">No screenshot submitted</span>'}
          ${o.paymentNotes?`<p style="font-size:12px;color:var(--gray);margin-top:6px">Note: ${o.paymentNotes}</p>`:''}
        </div>
        <div class="ship-block">
          <h5>Actions</h5>
          <div class="ship-actions" style="flex-wrap:wrap">
            ${ps!=='Paid'?`<button class="btn-gold" style="padding:8px 14px;font-size:12px" onclick="adminVerifyPayment('${o.orderNo}')">✓ Mark Paid</button>`:''}
            ${['Evidence Submitted','Pending Verification','Awaiting Payment','Payment Instructions Sent'].includes(ps)?`<button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="adminRejectPayment('${o.orderNo}')">✕ Reject</button>`:''}
            ${ps!=='Paid'?`<button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="adminRequestInfo('${o.orderNo}')">? Request Info</button>`:''}
            <button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="resendInstructions('${o.orderNo}')">↻ Resend Instructions</button>
            <button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="resendConfirmation('${o.orderNo}')">✉ Resend Confirmation</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
async function viewEvidence(no){
  const o=getOrders().find(x=>x.orderNo===no);if(!o){alert('Order not found.');return;}
  let src=o.evidence||'';
  if(o.evidencePath&&typeof sbEvidenceUrl==='function'){
    src=await sbEvidenceUrl(o.evidencePath)||src;
  }
  if(!src){alert('No evidence uploaded.');return;}
  document.getElementById('orderDetail').innerHTML=`
    <h2 style="font-size:22px;margin-bottom:14px">Payment Evidence — ${o.orderNo}</h2>
    <p style="font-size:13px;color:var(--gray);margin-bottom:14px">${o.paymentMethod} · $${o.total.toFixed(2)} · Ref: ${o.transactionRef||'—'}</p>
    <img src="${src}" style="width:100%;border:1px solid #d8cfc0;margin-bottom:14px">
    <button class="btn-gold" onclick="document.getElementById('orderModal').classList.add('hidden')">Close</button>`;
  document.getElementById('orderModal').classList.remove('hidden');
}
function adminVerifyPayment(no){
  if(!confirm('Confirm you have verified the actual incoming payment for '+no+'?'))return;
  const res=verifyPayment(no,'admin');
  if(res){if(!res.alreadyPaid){notifyPaymentVerified(res.order);notifyStatusChange(res.order,res.order.status);}alert('Order '+no+' marked as Paid.');}
  renderPayments();
}
function adminRejectPayment(no){
  const reason=prompt('Reason for rejection (optional):')||'';
  rejectPayment(no,reason);
  renderPayments();
}
function adminRequestInfo(no){
  const note=prompt('What additional info do you need from the customer?')||'';
  requestMoreInfo(no,note);
  const o=getOrders().find(x=>x.orderNo===no);
  if(o){sendEmail(o.email,`Payment Info Needed — Order #${o.orderNo}`,`Hi ${o.name},\n\nWe need a little more information about your payment for order #${o.orderNo}.\n\n${note||'Please reply to this email or contact supportrepslvbags@gmail.com'}\n\n— Reps LV Bags`);}
  renderPayments();
}
function resendInstructions(no){
  const o=getOrders().find(x=>x.orderNo===no);if(!o)return;
  // force resend by clearing the sent flag
  updateOrder(no,{emailsSent:(o.emailsSent||[]).filter(k=>k!=='payment_instructions')});
  notifyPaymentInstructions(getOrders().find(x=>x.orderNo===no));
  alert('Payment instructions re-queued for '+o.email+'.');
}
function resendConfirmation(no){
  const o=getOrders().find(x=>x.orderNo===no);if(!o)return;
  updateOrder(no,{emailsSent:(o.emailsSent||[]).filter(k=>k!=='order_confirmation')});
  notifyOrderConfirmation(getOrders().find(x=>x.orderNo===no));
  alert('Order confirmation re-queued for '+o.email+'.');
}

// ---------- SETTINGS (payment config) ----------
function loadPaymentSettings(){
  const c=getPaymentConfig();
  document.getElementById('setBizEmail').value=c.businessEmail||'';
  const m=c.methods;
  document.getElementById('setCashEnabled').checked=!!m.cashapp.enabled;
  document.getElementById('setCashUrl').value=m.cashapp.url||'';
  document.getElementById('setCashNote').value=m.cashapp.note||'';
  document.getElementById('setChimeEnabled').checked=!!m.chime.enabled;
  document.getElementById('setChimeDetails').value=m.chime.details||'';
  document.getElementById('setZelleEnabled').checked=!!m.zelle.enabled;
  document.getElementById('setZelleDetails').value=m.zelle.details||'';
  document.getElementById('setAppleEnabled').checked=!!m.applepay.enabled;
  document.getElementById('setAppleDetails').value=m.applepay.details||'';
}
function savePaymentSettings(){
  const c=getPaymentConfig();
  c.businessEmail=document.getElementById('setBizEmail').value.trim()||'supportrepslvbags@gmail.com';
  c.methods.cashapp={enabled:document.getElementById('setCashEnabled').checked,url:document.getElementById('setCashUrl').value.trim(),note:document.getElementById('setCashNote').value.trim(),label:'Cash App'};
  c.methods.chime={enabled:document.getElementById('setChimeEnabled').checked,details:document.getElementById('setChimeDetails').value.trim(),label:'Chime'};
  c.methods.zelle={enabled:document.getElementById('setZelleEnabled').checked,details:document.getElementById('setZelleDetails').value.trim(),label:'Zelle'};
  c.methods.applepay={enabled:document.getElementById('setAppleEnabled').checked,details:document.getElementById('setAppleDetails').value.trim(),label:'Apple Pay'};
  savePaymentConfig(c);
  alert('Payment settings saved. Checkout now shows only configured methods.');
}

// ---------- CONTENT ----------
function loadContentForm(){
  const c=getContent();
  document.getElementById('cAnnounce').value=c.announcement;
  document.getElementById('cKicker').value=c.heroKicker;
  document.getElementById('cTitle').value=c.heroTitle;
  document.getElementById('cSub').value=c.heroSub;
  document.getElementById('cBtn').value=c.heroBtn;
  document.getElementById('cInsta').innerHTML=c.instagram.map((u,i)=>`<input value="${u}" data-insta="${i}" style="width:100%;margin-bottom:8px;padding:10px;border:1px solid #d8cfc0">`).join('');
  renderDiscTable();
}
function addInstaField(){
  const d=document.createElement('input');d.dataset.insta='new';d.placeholder='https://instagram.com/…';
  d.style.cssText='width:100%;margin-bottom:8px;padding:10px;border:1px solid #d8cfc0';
  document.getElementById('cInsta').appendChild(d);
}
function saveContent(){
  const c=getContent();
  c.announcement=document.getElementById('cAnnounce').value;
  c.heroKicker=document.getElementById('cKicker').value;
  c.heroTitle=document.getElementById('cTitle').value;
  c.heroSub=document.getElementById('cSub').value;
  c.heroBtn=document.getElementById('cBtn').value;
  c.instagram=[...document.querySelectorAll('[data-insta]')].map(i=>i.value.trim()).filter(Boolean);
  saveContent_(c);
  alert('Content saved! Refresh the store to see changes.');
}
function saveContent_(c){localStorage.setItem(DB_CONTENT,JSON.stringify(c));}
function renderDiscTable(){
  const d=getDiscounts();
  document.getElementById('discTable').innerHTML=`<tr><th>Code</th><th>Discount</th><th>Expiry</th><th></th></tr>`+
    d.map((x,i)=>`<tr><td><b>${x.code}</b></td><td>${x.percent}%</td><td>${x.expiry||'Never'}</td><td><button onclick="delDiscount(${i})" style="color:#a33;background:none;border:none;cursor:pointer">✕</button></td></tr>`).join('');
}
function addDiscount(){
  const code=document.getElementById('dCode').value.trim().toUpperCase();
  const percent=parseInt(document.getElementById('dPercent').value);
  if(!code||!percent)return alert('Enter code and percent.');
  const d=getDiscounts();d.push({code,percent,expiry:document.getElementById('dExpiry').value});
  saveDiscounts(d);renderDiscTable();
  document.getElementById('dCode').value=document.getElementById('dPercent').value=document.getElementById('dExpiry').value='';
}
function delDiscount(i){const d=getDiscounts();d.splice(i,1);saveDiscounts(d);renderDiscTable();}

// ---------- INIT ----------
if(sessionStorage.getItem('vr_admin')==='1') enterAdmin();
