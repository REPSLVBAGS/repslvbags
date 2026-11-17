// ---------- Admin CMS ----------
const ALL_COLORS=['Black','Beige','Brown','White','Red'];
let pendingImages=[]; // dataURLs for product form

// ---------- ORDER SOURCE (Supabase mirror with localStorage fallback) ----------
let adminOrdersCache=null; // null = not loaded yet
const _ordersLocal=getOrders;
function adminGetOrders(){
  const local=_ordersLocal();
  if(!adminOrdersCache) return local;
  // Merge: Supabase orders take priority, but include localStorage-only orders
  const remoteNos=new Set(adminOrdersCache.map(o=>o.orderNo));
  const localOnly=local.filter(o=>!remoteNos.has(o.orderNo));
  return [...adminOrdersCache, ...localOnly];
}
async function refreshAdminOrders(){
  if(typeof sbAdminListOrders!=='function') return;
  const remote=await sbAdminListOrders();
  if(remote) adminOrdersCache=remote;
}
// Push a localStorage order's mutable fields to Supabase after admin edits.
function adminPushOrder(no){
  if(typeof sbAdminUpdateOrder!=='function') return;
  // Try localStorage first, then merged view (Supabase orders)
  let o=_ordersLocal().find(x=>x.orderNo===no);
  if(!o && adminOrdersCache) o=adminOrdersCache.find(x=>x.orderNo===no);
  if(!o) return;
  sbAdminUpdateOrder(no,{
    status:o.status, carrier:o.carrier, tracking:o.tracking,
    paymentStatus:o.paymentStatus, transactionRef:o.transactionRef,
    evidencePath:o.evidencePath, evidenceSubmittedAt:o.evidenceSubmittedAt,
    verifiedAt:o.verifiedAt, verifiedBy:o.verifiedBy,
    paymentNotes:o.paymentNotes, notes:o.notes, emailsSent:o.emailsSent,
    estDelivery:o.estDelivery
  });
}

// ---------- AUTH (Supabase Auth â€” real authentication) ----------
async function doLogin(){
  const email=document.getElementById('loginEmail').value.trim();
  const pass=document.getElementById('loginPass').value;
  const err=document.getElementById('loginErr');
  err.classList.add('hidden');
  console.log('[Admin] Login attempt for:', email);
  console.log('[Admin] sbAdminSignIn available:', typeof sbAdminSignIn);
  console.log('[Admin] window.supabase available:', typeof window.supabase);
  if(typeof sbAdminSignIn==='function'){
    try{
      const {data,error}=await sbAdminSignIn(email,pass);
      console.log('[Admin] SignIn result:', {hasData:!!data, hasError:!!error, errorMsg:error?error.message:null});
      if(!error&&data&&data.session){
        sessionStorage.setItem('vr_admin','1');
        enterAdmin();
        return;
      }
      const msg=error?(error.message||'Login failed'):'Login failed - no session returned';
      err.textContent=msg;
      err.classList.remove('hidden');
      return;
    }catch(e){
      console.error('[Admin] Login exception:', e);
      err.textContent='Login error: '+(e.message||e);
      err.classList.remove('hidden');
      return;
    }
  }
  // Fallback when Supabase isn't configured (local dev only)
  console.log('[Admin] Falling back to local checkAdmin');
  if(checkAdmin(email,pass)){
    sessionStorage.setItem('vr_admin','1');
    enterAdmin();
  } else {
    err.textContent='Supabase not configured and local auth failed';
    err.classList.remove('hidden');
  }
}
async function doLogout(){ if(typeof sbAdminSignOut==='function') await sbAdminSignOut(); sessionStorage.removeItem('vr_admin'); location.reload(); }
function enterAdmin(){
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminShell').classList.remove('hidden');
  route();
}

// ---------- ROUTER ----------
async function route(){
  const h=(location.hash||'#/dashboard').replace('#/','');
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===h));
  const view=document.getElementById('view-'+h)||document.getElementById('view-dashboard');
  view.classList.remove('hidden');
  await refreshAdminOrders();
  if(h==='dashboard') renderDashboard();
  if(h==='products') renderProductList();
  if(h==='orders') renderOrdersTable();
  if(h==='tracking') renderTrackingView();
  if(h==='payments') renderPayments();
  if(h==='invoices') loadInvoicesAdmin();
  if(h==='settings') loadPaymentSettings();
  if(h==='content') loadContentForm();
  updateNavBadges();
}
function updateNavBadges(){
  const orders=adminGetOrders();
  const set=(id,n)=>{const el=document.getElementById(id);if(el){el.textContent=n||'';el.style.display=n?'inline-flex':'none';}};
  set('badge-orders',orders.length);
  set('badge-tracking',orders.filter(needsAction).length);
  set('badge-payments',orders.filter(o=>!['Paid','Rejected','Cancelled','Refunded'].includes(o.paymentStatus||'Awaiting Payment')).length);
}
window.addEventListener('hashchange',route);

// ---------- DASHBOARD ----------
function renderDashboard(){
  const orders=adminGetOrders(), products=getProducts();
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
    return `<a href="#/tracking" class="attn-item"><span><b>${o.orderNo}</b> â€” ${o.name}<br><small>${why}</small></span><span class="attn-go">Open â†’</span></a>`;
  }).join(''):'<p class="all-good">âœ“ Nothing needs attention right now</p>';

  const low=products.filter(p=>p.stock<3&&p.status==='active');
  document.getElementById('lowStock').innerHTML=low.length?low.map(p=>`<div class="low-stock-item"><span>${p.name}</span><b>${p.stock} left</b></div>`).join(''):'<p class="all-good">âœ“ All products well stocked</p>';
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
      <div class="pc-meta">$${p.price} Â· ${p.style} Â· Stock: ${p.stock} Â· <span class="status-pill ${p.status}">${p.status}</span></div>
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
  document.getElementById('imgPreview').innerHTML=pendingImages.map((s,i)=>`<img src="${s}"><button type="button" onclick="pendingImages.splice(${i},1);renderImgPreview()" style="position:absolute">âœ•</button>`).join('');
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
  const orders=adminGetOrders().slice().sort((a,b)=>b.orderNo.localeCompare(a.orderNo));
  document.getElementById('ordersBody').innerHTML=orders.map(o=>`
    <tr>
      <td><b>${o.orderNo}</b></td><td>${o.name}</td>
      <td>${o.items.map(i=>`${i.qty}Ã— ${i.name}`).join('<br>')}</td>
      <td>$${o.total.toFixed(2)}</td>
      <td>${(o.evidence||o.evidencePath)?`<a href="#" onclick="viewEvidence('${o.orderNo}');return false" style="color:var(--gold)">ðŸ“Ž View</a>`:'â€”'}</td>
      <td><span class="status-pill ${o.status==='Delivered'?'active':o.status==='Cancelled'?'soldout':'draft'}">${o.status}</span></td>
      <td>${fmtDate(o.orderDate)}</td>
      <td><button class="btn-ghost" style="padding:6px 12px;font-size:11px" onclick="openOrder('${o.orderNo}')">Manage</button></td>
    </tr>`).join('');
}
function viewShot(no){viewEvidence(no);}
function openOrder(no){
  const o=adminGetOrders().find(x=>x.orderNo===no);if(!o)return;
  document.getElementById('orderDetail').innerHTML=`
    <h2 style="font-size:22px;margin-bottom:4px">Order ${o.orderNo}</h2>
    <p style="color:var(--gray);font-size:13px;margin-bottom:18px">${fmtDate(o.orderDate)} Â· $${o.total.toFixed(2)}${o.discount?' Â· Discount: '+o.discount:''}</p>
    <div class="panel" style="margin-bottom:14px">
      <h3>Customer</h3>
      <p style="font-size:14px">${o.name}<br>${o.email}<br>${o.phone||''}<br>${o.address}, ${o.city}, ${o.state} ${o.zip}</p>
    </div>
    <div class="panel" style="margin-bottom:14px">
      <h3>Items</h3>
      ${o.items.map(i=>`<p style="font-size:14px">${i.qty}Ã— ${i.name} â€” $${(i.price*i.qty).toFixed(2)}</p>`).join('')}
    </div>
    <div class="panel" style="margin-bottom:14px">
      <h3>Payment</h3>
      <p style="font-size:14px">Method: <b>${o.paymentMethod||'â€”'}</b><br>Status: <b>${o.paymentStatus||'Awaiting Payment'}</b>${o.transactionRef?'<br>Ref: '+o.transactionRef:''}${o.verifiedAt?'<br>Verified: '+fmtDate(o.verifiedAt):''}</p>
      ${(o.evidence||o.evidencePath)?`<button class="btn-ghost" style="margin-top:8px;padding:8px 14px;font-size:12px" onclick="viewEvidence('${o.orderNo}')">ðŸ–¼ View Screenshot</button>`:'<p style="font-size:13px;color:var(--gray);margin-top:6px">No screenshot uploaded</p>'}
      ${o.paymentStatus!=='Paid'?`<button class="btn-gold" style="margin-top:10px;padding:10px 18px;font-size:12px" onclick="adminVerifyPayment('${o.orderNo}');document.getElementById('orderModal').classList.add('hidden')">âœ“ Mark as Paid (verified in ${o.paymentMethod||'account'})</button>`:''}
    </div>
    <div class="panel">
      <h3>Shipping & Status</h3>
      <label style="font-size:12px">Status
        <select id="oStatus" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #d8cfc0">${ORDER_STATUSES.map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select>
      </label>
      <div class="two-col" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
        <label style="font-size:12px">Carrier
          <select id="oCarrier" style="display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #d8cfc0">${['','USPS','UPS','FedEx','DHL'].map(c=>`<option ${c===o.carrier?'selected':''}>${c||'â€”'}</option>`).join('')}</select>
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
  adminPushOrder(no);
  if(res&&!res.alreadyPaid){notifyPaymentVerified(res.order);notifyStatusChange(res.order,res.order.status);}
  alert('Order marked as paid.');openOrder(no);renderOrdersTable();
}
function saveOrder(no){
  const status=document.getElementById('oStatus').value;
  const carrier=document.getElementById('oCarrier').value;
  const tracking=document.getElementById('oTracking').value.trim();
  const order=updateOrder(no,{status,carrier,tracking});
  adminPushOrder(no);
  if(order){notifyStatusChange(order,status);if(['Shipped','Out for Delivery','Delivered'].includes(status))notifyShipping(order);}
  alert(`Order ${no} â†’ ${status}. Email notification queued.`);
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
  let orders=adminGetOrders().slice().sort((a,b)=>b.orderNo.localeCompare(a.orderNo));
  if(trackTab==='action') orders=orders.filter(needsAction);
  else if(trackTab==='transit') orders=orders.filter(o=>['Shipped','Out for Delivery'].includes(o.status));
  else if(trackTab==='delivered') orders=orders.filter(o=>o.status==='Delivered');
  else if(trackTab==='cancelled') orders=orders.filter(o=>o.status==='Cancelled');
  if(q) orders=orders.filter(o=>(o.orderNo+o.name+o.email+(o.tracking||'')).toLowerCase().includes(q));

  const box=document.getElementById('trackingList');
  if(!orders.length){box.innerHTML='<p class="all-good">Nothing here â€” all caught up. âœ“</p>';return;}

  box.innerHTML=orders.map(o=>{
    const idx=ORDER_STATUSES.indexOf(o.status);
    const next=ORDER_STATUSES[idx+1];
    const paid=payStatusOf(o)==='Paid'||['Payment Confirmed','Processing','Shipped','Out for Delivery','Delivered'].includes(o.status);
    const shipSteps=['Processing','Shipped','Out for Delivery','Delivered'];
    const shipIdx=['Processing','Shipped','Out for Delivery','Delivered'].indexOf(o.status);
    return `<div class="ship-card ${needsAction(o)?'needs':''}">
      <div class="ship-head">
        <div>
          <b style="font-size:16px">${o.orderNo}</b> â€” ${o.name}
          <span style="color:var(--gray);font-size:12px"> Â· ${o.email} Â· ${fmtDate(o.orderDate)}</span><br>
          <span style="font-size:12px;color:var(--gray)">${o.city}, ${o.state} ${o.zip||''} Â· $${o.total.toFixed(2)}</span>
        </div>
        <span class="status-pill ${o.status==='Delivered'?'active':o.status==='Cancelled'?'soldout':'draft'}">${o.status}</span>
      </div>

      <div class="ship-items">${o.items.map(i=>`${i.qty}Ã— ${i.name}`).join(' Â· ')}</div>

      <div class="ship-grid">
        <div class="ship-block">
          <h5>Payment</h5>
          ${paid
            ?`<span class="pay-ok">âœ“ ${o.paymentMethod||'Payment'} Confirmed</span>`
            :`<span class="pay-wait">â³ Awaiting verification</span>
              ${(o.evidence||o.evidencePath)?`<button class="btn-ghost" style="margin-top:6px;padding:6px 12px;font-size:12px" onclick="viewEvidence('${o.orderNo}')">ðŸ–¼ View screenshot</button>`:'<span style="font-size:12px;color:#b8860b">No screenshot uploaded</span>'}
              <button class="btn-gold" style="margin-top:8px;padding:8px 14px;font-size:12px" onclick="confirmPayment('${o.orderNo}')">âœ“ Confirm ${o.paymentMethod||'Payment'} Received</button>`}
        </div>
        <div class="ship-block">
          <h5>Shipping</h5>
          <div class="ship-meta">
            ${o.carrier?`<span>ðŸ“¦ ${o.carrier}</span>`:'<span class="miss">No carrier</span>'}
            ${o.tracking?`<span>ðŸ”¢ ${o.tracking}</span>`:'<span class="miss">No tracking #</span>'}
            ${o.tracking?`<a href="${carrierLink(o.carrier,o.tracking)}" target="_blank" rel="noopener" style="color:var(--gold);font-size:12px">Track parcel â†—</a>`:''}
          </div>
          <div class="ship-actions">
            <select id="tc-${o.orderNo}">${['','USPS','UPS','FedEx','DHL'].map(c=>`<option ${c===(o.carrier||'')?'selected':''}>${c||'Carrierâ€¦'}</option>`).join('')}</select>
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
          ${next&&!['Delivered','Cancelled'].includes(o.status)?`<button class="btn-ghost" style="padding:9px 14px;font-size:12px" onclick="quickAdvance('${o.orderNo}','${next}')">â†’ ${next}</button>`:''}
          <button class="btn-ghost" style="padding:9px 14px;font-size:12px" onclick="openOrder('${o.orderNo}')">Full Details</button>
        </div>
        <div class="mini-steps">${shipSteps.map((s,i)=>`<span class="mini-step ${shipIdx>=i?'done':o.status==='Cancelled'?'':'pending'}">${s}</span>`).join('<span class="mini-arrow">â†’</span>')}</div>
      </div>

      <div class="ship-block" style="margin-top:14px">
        <h5>Internal Notes</h5>
        <div class="ship-actions">
          <input id="tn-${o.orderNo}" placeholder="e.g. Customer called, prefers Saturday deliveryâ€¦" value="${o.notes||''}">
          <button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="saveNote('${o.orderNo}')">Save Note</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function confirmPayment(no){
  const o=adminGetOrders().find(x=>x.orderNo===no);if(!o)return;
  const res=verifyPayment(no,'admin');
  adminPushOrder(no);
  if(res&&!res.alreadyPaid){notifyPaymentVerified(res.order);notifyStatusChange(res.order,res.order.status);}
  renderTrackingView();
}
function saveShipInfo(no){
  const carrier=document.getElementById('tc-'+no).value;
  const tracking=document.getElementById('tt-'+no).value.trim();
  updateOrder(no,{carrier,tracking});
  adminPushOrder(no);
  renderTrackingView();
}
function saveNote(no){
  updateOrder(no,{notes:document.getElementById('tn-'+no).value});
  adminPushOrder(no);
  renderTrackingView();
}
function quickShipUpdate(no){
  const status=document.getElementById('ts-'+no).value;
  const o=updateOrder(no,{status});
  adminPushOrder(no);
  if(o){notifyStatusChange(o,status);if(['Shipped','Out for Delivery','Delivered'].includes(status))notifyShipping(o);}
  renderTrackingView();
}
function quickAdvance(no,status){
  const o=adminGetOrders().find(x=>x.orderNo===no);if(!o)return;
  updateOrder(no,{status});
  adminPushOrder(no);
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
  const methods=['all','Cash App','Chime','Zelle'];
  document.getElementById('payMethodTabs').innerHTML=methods.map(m=>`<button class="track-tab ${payMethodFilter===m?'active':''}" data-pm="${m}" onclick="setPayMethod('${m}')">${m==='all'?'All Methods':m}</button>`).join('');

  const q=(document.getElementById('paySearch').value||'').toLowerCase();
  let orders=adminGetOrders().slice().sort((a,b)=>b.orderNo.localeCompare(a.orderNo));
  if(payTab==='pending') orders=orders.filter(o=>!['Paid','Rejected','Cancelled','Refunded'].includes(payStatusOf(o)));
  else if(payTab==='paid') orders=orders.filter(o=>payStatusOf(o)==='Paid');
  else if(payTab==='rejected') orders=orders.filter(o=>['Rejected','Cancelled','Refunded'].includes(payStatusOf(o)));
  if(payMethodFilter!=='all') orders=orders.filter(o=>(o.paymentMethod||'').toLowerCase()===payMethodFilter.toLowerCase());
  if(q) orders=orders.filter(o=>(o.orderNo+o.name+o.email+(o.transactionRef||'')).toLowerCase().includes(q));

  const box=document.getElementById('paymentsList');
  if(!orders.length){box.innerHTML='<p class="all-good">Nothing here â€” all caught up. âœ“</p>';return;}

  box.innerHTML=orders.map(o=>{
    const ps=payStatusOf(o);
    const hasEvidence=!!(o.evidence||o.evidencePath);
    return `<div class="ship-card ${ps!=='Paid'?'needs':''}">
      <div class="ship-head">
        <div>
          <b style="font-size:16px">${o.orderNo}</b> â€” ${o.name}
          <span style="color:var(--gray);font-size:12px"> Â· ${o.email} Â· ${o.paymentMethod||'â€”'} Â· $${o.total.toFixed(2)}</span><br>
          <span style="font-size:12px;color:var(--gray)">${fmtDate(o.orderDate)}${o.transactionRef?' Â· Ref: '+o.transactionRef:''}</span>
        </div>
        <span class="status-pill ${ps==='Paid'?'active':ps==='Rejected'?'soldout':'draft'}">${ps}</span>
      </div>
      <div class="ship-items">${o.items.map(i=>`${i.qty}Ã— ${i.name}`).join(' Â· ')}</div>
      <div class="ship-grid">
        <div class="ship-block">
          <h5>Evidence</h5>
          ${hasEvidence
            ?`<button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="viewEvidence('${o.orderNo}')">ðŸ–¼ View Screenshot</button>
              <span style="font-size:12px;color:var(--gray);display:block;margin-top:6px">Submitted ${o.evidenceSubmittedAt?fmtDate(o.evidenceSubmittedAt):'â€”'}</span>`
            :'<span style="font-size:12px;color:#b8860b">No screenshot submitted</span>'}
          ${o.paymentNotes?`<p style="font-size:12px;color:var(--gray);margin-top:6px">Note: ${o.paymentNotes}</p>`:''}
        </div>
        <div class="ship-block">
          <h5>Actions</h5>
          <div class="ship-actions" style="flex-wrap:wrap">
            ${ps!=='Paid'?`<button class="btn-gold" style="padding:8px 14px;font-size:12px" onclick="adminVerifyPayment('${o.orderNo}')">âœ“ Mark Paid</button>`:''}
            ${['Evidence Submitted','Pending Verification','Awaiting Payment','Payment Instructions Sent'].includes(ps)?`<button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="adminRejectPayment('${o.orderNo}')">âœ• Reject</button>`:''}
            ${ps!=='Paid'?`<button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="adminRequestInfo('${o.orderNo}')">? Request Info</button>`:''}
            <button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="resendInstructions('${o.orderNo}')">â†» Resend Instructions</button>
            <button class="btn-ghost" style="padding:8px 14px;font-size:12px" onclick="resendConfirmation('${o.orderNo}')">âœ‰ Resend Confirmation</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}
async function viewEvidence(no){
  const o=adminGetOrders().find(x=>x.orderNo===no);if(!o){alert('Order not found.');return;}
  let src=o.evidence||'';
  if(o.evidencePath&&typeof sbEvidenceUrl==='function'){
    src=await sbEvidenceUrl(o.evidencePath)||src;
  }
  if(!src){alert('No evidence uploaded.');return;}
  document.getElementById('orderDetail').innerHTML=`
    <h2 style="font-size:22px;margin-bottom:14px">Payment Evidence â€” ${o.orderNo}</h2>
    <p style="font-size:13px;color:var(--gray);margin-bottom:14px">${o.paymentMethod} Â· $${o.total.toFixed(2)} Â· Ref: ${o.transactionRef||'â€”'}</p>
    <img src="${src}" style="width:100%;border:1px solid #d8cfc0;margin-bottom:14px">
    <button class="btn-gold" onclick="document.getElementById('orderModal').classList.add('hidden')">Close</button>`;
  document.getElementById('orderModal').classList.remove('hidden');
}
function adminVerifyPayment(no){
  if(!confirm('Confirm you have verified the actual incoming payment for '+no+'?'))return;
  const res=verifyPayment(no,'admin');
  adminPushOrder(no);
  if(res){if(!res.alreadyPaid){notifyPaymentVerified(res.order);notifyStatusChange(res.order,res.order.status);if(typeof syncInvoiceFromOrder==='function')syncInvoiceFromOrder(no,'PAID');}alert('Order '+no+' marked as Paid.');}
  renderPayments();
}
function adminRejectPayment(no){
  const reason=prompt('Reason for rejection (optional):')||'';
  rejectPayment(no,reason);
  adminPushOrder(no);
  renderPayments();
}
function adminRequestInfo(no){
  const note=prompt('What additional info do you need from the customer?')||'';
  requestMoreInfo(no,note);
  adminPushOrder(no);
  const o=adminGetOrders().find(x=>x.orderNo===no);
  if(o){sendEmail(o.email,`Payment Info Needed â€” Order #${o.orderNo}`,`Hi ${o.name},\n\nWe need a little more information about your payment for order #${o.orderNo}.\n\n${note||'Please reply to this email or contact supportrepslvbags@gmail.com'}\n\nâ€” Reps LV Bags`);}
  renderPayments();
}
function resendInstructions(no){
  const o=adminGetOrders().find(x=>x.orderNo===no);if(!o)return;
  // force resend by clearing the sent flag
  updateOrder(no,{emailsSent:(o.emailsSent||[]).filter(k=>k!=='payment_instructions')});
  adminPushOrder(no);
  notifyPaymentInstructions(adminGetOrders().find(x=>x.orderNo===no));
  alert('Payment instructions re-queued for '+o.email+'.');
}
function resendConfirmation(no){
  const o=adminGetOrders().find(x=>x.orderNo===no);if(!o)return;
  updateOrder(no,{emailsSent:(o.emailsSent||[]).filter(k=>k!=='order_confirmation')});
  adminPushOrder(no);
  notifyOrderConfirmation(adminGetOrders().find(x=>x.orderNo===no));
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
}
function savePaymentSettings(){
  const c=getPaymentConfig();
  c.businessEmail=document.getElementById('setBizEmail').value.trim()||'supportrepslvbags@gmail.com';
  c.methods.cashapp={enabled:document.getElementById('setCashEnabled').checked,url:document.getElementById('setCashUrl').value.trim(),note:document.getElementById('setCashNote').value.trim(),label:'Cash App'};
  c.methods.chime={enabled:document.getElementById('setChimeEnabled').checked,details:document.getElementById('setChimeDetails').value.trim(),label:'Chime'};
  c.methods.zelle={enabled:document.getElementById('setZelleEnabled').checked,details:document.getElementById('setZelleDetails').value.trim(),label:'Zelle'};
  delete c.methods.applepay;
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
  const d=document.createElement('input');d.dataset.insta='new';d.placeholder='https://instagram.com/â€¦';
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
    d.map((x,i)=>`<tr><td><b>${x.code}</b></td><td>${x.percent}%</td><td>${x.expiry||'Never'}</td><td><button onclick="delDiscount(${i})" style="color:#a33;background:none;border:none;cursor:pointer">âœ•</button></td></tr>`).join('');
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
(async()=>{
  if(sessionStorage.getItem('vr_admin')!=='1') return;
  // Verify the Supabase session is still valid before entering admin.
  if(typeof sbAdminSession==='function'){
    const s=await sbAdminSession();
    if(!s){ sessionStorage.removeItem('vr_admin'); return; }
  }
  enterAdmin();
})();

// ---------- REVIEWS MANAGEMENT ----------
let adminReviewsCache = [];

async function loadAdminReviews() {
  try {
    const res = await fetch('https://wetxlhacaeakstqwqtdh.supabase.co/functions/v1/reviews?status=all', {
      headers: { 'x-email-secret': 'vr7f2k9xQm4Lp8Rw3Ty6' }
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    adminReviewsCache = data.reviews || [];
    renderReviewsAdmin();
    updateReviewBadge();
  } catch (e) {
    console.error('Failed to load reviews:', e);
    adminReviewsCache = [];
    renderReviewsAdmin();
  }
}

function updateReviewBadge() {
  const pending = adminReviewsCache.filter(r => r.status === 'pending').length;
  const badge = document.getElementById('badge-reviews');
  if (badge) {
    badge.textContent = pending > 0 ? pending : '';
    badge.style.display = pending > 0 ? 'inline' : 'none';
  }
}

function renderReviewsAdmin() {
  const container = document.getElementById('reviewsAdminList');
  if (!container) return;
  
  const statusFilter = document.getElementById('reviewStatusFilter')?.value || 'all';
  let reviews = adminReviewsCache;
  
  if (statusFilter !== 'all') {
    reviews = reviews.filter(r => r.status === statusFilter);
  }
  
  if (reviews.length === 0) {
    container.innerHTML = '<p style="color:var(--gray);text-align:center;padding:40px">No reviews found.</p>';
    return;
  }
  
  container.innerHTML = reviews.map(r => `
    <div class="review-admin-card" style="background:var(--white);border:1px solid var(--line);padding:20px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;gap:12px">
        <div>
          <strong>${r.name}</strong>
          ${r.verified_purchase ? '<span style="background:var(--espresso);color:var(--ivory);font-size:10px;padding:2px 6px;margin-left:8px">✓ Verified</span>' : ''}
          <span style="color:var(--muted);font-size:12px;margin-left:12px">${new Date(r.created_at).toLocaleDateString()}</span>
        </div>
        <div style="color:var(--gold)">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
      </div>
      ${r.product_name ? `<p style="font-size:12px;color:var(--muted);margin-bottom:8px">Product: ${r.product_name}</p>` : ''}
      ${r.title ? `<h4 style="margin-bottom:8px">${r.title}</h4>` : ''}
      <p style="margin-bottom:12px;line-height:1.6">${r.body}</p>
      ${r.photo_url ? `<img src="${r.photo_url}" style="max-width:150px;height:auto;margin-bottom:12px;border:1px solid var(--line)">` : ''}
      ${r.admin_reply ? `<div style="background:var(--cream);padding:12px;margin-bottom:12px;border-left:3px solid var(--espresso)"><strong>Admin Reply:</strong> ${r.admin_reply}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${r.status === 'pending' ? `
          <button class="btn-gold" style="padding:8px 16px;font-size:12px" onclick="adminApproveReview(${r.id})">Approve</button>
          <button class="btn-ghost" style="padding:8px 16px;font-size:12px" onclick="adminRejectReview(${r.id})">Reject</button>
        ` : ''}
        ${r.status === 'approved' ? `
          <button class="btn-ghost" style="padding:8px 16px;font-size:12px" onclick="adminRejectReview(${r.id})">Unpublish</button>
        ` : ''}
        ${r.status === 'rejected' ? `
          <button class="btn-gold" style="padding:8px 16px;font-size:12px" onclick="adminApproveReview(${r.id})">Approve</button>
        ` : ''}
        <button class="btn-ghost" style="padding:8px 16px;font-size:12px" onclick="adminReplyReview(${r.id})">Reply</button>
        <button class="btn-ghost" style="padding:8px 16px;font-size:12px;color:red" onclick="adminDeleteReview(${r.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

async function adminApproveReview(id) {
  try {
    await fetch('https://wetxlhacaeakstqwqtdh.supabase.co/functions/v1/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-email-secret': 'vr7f2k9xQm4Lp8Rw3Ty6' },
      body: JSON.stringify({ id, status: 'approved' })
    });
    await loadAdminReviews();
  } catch (e) { alert('Failed to approve review'); }
}

async function adminRejectReview(id) {
  try {
    await fetch('https://wetxlhacaeakstqwqtdh.supabase.co/functions/v1/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-email-secret': 'vr7f2k9xQm4Lp8Rw3Ty6' },
      body: JSON.stringify({ id, status: 'rejected' })
    });
    await loadAdminReviews();
  } catch (e) { alert('Failed to reject review'); }
}

async function adminReplyReview(id) {
  const reply = prompt('Enter your reply to this review:');
  if (!reply) return;
  try {
    await fetch('https://wetxlhacaeakstqwqtdh.supabase.co/functions/v1/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-email-secret': 'vr7f2k9xQm4Lp8Rw3Ty6' },
      body: JSON.stringify({ id, admin_reply: reply })
    });
    await loadAdminReviews();
  } catch (e) { alert('Failed to reply to review'); }
}

async function adminDeleteReview(id) {
  if (!confirm('Delete this review permanently?')) return;
  try {
    await fetch(`https://wetxlhacaeakstqwqtdh.supabase.co/functions/v1/reviews?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-email-secret': 'vr7f2k9xQm4Lp8Rw3Ty6' }
    });
    await loadAdminReviews();
  } catch (e) { alert('Failed to delete review'); }
}


// ---------- INVOICES ADMIN ----------
let _adminInvoices=[];
async function loadInvoicesAdmin(){
  const box=document.getElementById('invoicesAdminList');
  if(box)box.innerHTML='<p style="color:var(--gray)">Loading invoices…</p>';
  const status=(document.getElementById('invStatusFilter')||{}).value||'all';
  const q=(document.getElementById('invSearch')||{}).value||'';
  _adminInvoices=await adminListInvoices(status,q)||[];
  renderInvoicesAdmin();
}
function invStatusBadge(s){
  const colors={PENDING:'#8a5a00',PAID:'#2e7d32',CANCELLED:'#8a8177',REFUNDED:'#8a8177'};
  return `<span style="display:inline-block;padding:4px 10px;border:1px solid ${colors[s]||'#8a8177'};color:${colors[s]||'#8a8177'};font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:600">${s}</span>`;
}
function renderInvoicesAdmin(){
  const box=document.getElementById('invoicesAdminList');if(!box)return;
  const q=((document.getElementById('invSearch')||{}).value||'').toLowerCase();
  const status=(document.getElementById('invStatusFilter')||{}).value||'all';
  let list=_adminInvoices;
  if(status!=='all')list=list.filter(i=>i.payment_status===status);
  if(q)list=list.filter(i=>(i.invoice_no+i.order_no+i.customer_name+i.customer_email).toLowerCase().includes(q));
  if(!list.length){box.innerHTML='<p style="color:var(--gray);padding:30px 0">No invoices found.</p>';return;}
  box.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="text-align:left;border-bottom:2px solid #252525">
      <th style="padding:10px 8px">Invoice</th><th style="padding:10px 8px">Order</th><th style="padding:10px 8px">Customer</th>
      <th style="padding:10px 8px">Total</th><th style="padding:10px 8px">Method</th><th style="padding:10px 8px">Status</th>
      <th style="padding:10px 8px">Date</th><th style="padding:10px 8px">Actions</th>
    </tr></thead><tbody>
    ${list.map(i=>`<tr style="border-bottom:1px solid #ece4d6">
      <td style="padding:10px 8px;font-weight:600">${i.invoice_no}</td>
      <td style="padding:10px 8px">${i.order_no}</td>
      <td style="padding:10px 8px">${i.customer_name}<br><span style="color:var(--gray);font-size:11px">${i.customer_email}</span></td>
      <td style="padding:10px 8px;font-weight:600">$${Number(i.total).toFixed(2)}</td>
      <td style="padding:10px 8px">${i.payment_method_label||i.payment_method||'—'}</td>
      <td style="padding:10px 8px">${invStatusBadge(i.payment_status)}</td>
      <td style="padding:10px 8px;font-size:11px;color:var(--gray)">${new Date(i.created_at).toLocaleDateString()}</td>
      <td style="padding:10px 8px;white-space:nowrap">
        <button class="btn-ghost" style="padding:5px 10px;font-size:11px" onclick="adminViewInvoice(${i.id})">View</button>
        ${i.payment_status==='PENDING'?`<button class="btn-gold" style="padding:5px 10px;font-size:11px;margin-left:4px" onclick="adminInvoiceMarkPaid(${i.id},'${i.invoice_no}')">Mark Paid</button>`:''}
        ${i.payment_status==='PAID'?`<button class="btn-ghost" style="padding:5px 10px;font-size:11px;margin-left:4px" onclick="adminInvoiceSetStatus(${i.id},'REFUNDED','${i.invoice_no}')">Refund</button>`:''}
        ${i.payment_status==='PENDING'?`<button class="btn-ghost" style="padding:5px 10px;font-size:11px;margin-left:4px" onclick="adminInvoiceSetStatus(${i.id},'CANCELLED','${i.invoice_no}')">Cancel</button>`:''}
        <button class="btn-ghost" style="padding:5px 10px;font-size:11px;margin-left:4px" onclick="adminInvoiceResend(${i.id},'${i.invoice_no}')">Resend</button>
      </td>
    </tr>`).join('')}
    </tbody></table>`;
  // Update badge
  const pending=_adminInvoices.filter(i=>i.payment_status==='PENDING').length;
  const badge=document.getElementById('badge-invoices');
  if(badge){badge.textContent=pending||'';badge.style.display=pending?'inline-flex':'none';}
}
async function adminViewInvoice(id){
  const inv=await adminGetInvoice(id);
  if(!inv){alert('Invoice not found');return;}
  const addr=inv.shipping_address||{};
  const items=(inv.items||[]).map(i=>`<tr><td style="padding:6px 0;border-bottom:1px solid #ece4d6">${i.qty}× ${i.name}</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #ece4d6">$${(i.price*i.qty).toFixed(2)}</td></tr>`).join('');
  const html=`<div style="text-align:left">
    <h2 style="margin:0 0 4px">${inv.invoice_no}</h2>
    <p style="color:var(--gray);font-size:13px;margin:0 0 16px">Order ${inv.order_no} · ${new Date(inv.created_at).toLocaleString()}</p>
    ${invStatusBadge(inv.payment_status)}
    <h3 style="margin:20px 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--gray)">Customer</h3>
    <p style="font-size:14px;margin:0">${inv.customer_name}<br>${inv.customer_email}${inv.customer_phone?' · '+inv.customer_phone:''}</p>
    <h3 style="margin:20px 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--gray)">Delivery</h3>
    <p style="font-size:14px;margin:0">${addr.address||''}<br>${addr.city||''}, ${addr.state||''} ${addr.zip||''}</p>
    <h3 style="margin:20px 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--gray)">Items</h3>
    <table style="width:100%;font-size:14px">${items}</table>
    <p style="font-size:14px;margin-top:10px"><b>Total: $${Number(inv.total).toFixed(2)}</b> · ${inv.payment_method_label||inv.payment_method}</p>
    ${inv.payment_details?`<h3 style="margin:20px 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--gray)">Payment Instructions</h3><div style="background:#f8f6f2;padding:12px;font-size:13px;white-space:pre-line">${inv.payment_details}</div>`:''}
    ${inv.paid_at?`<p style="font-size:12px;color:var(--gray);margin-top:14px">Paid ${new Date(inv.paid_at).toLocaleString()} by ${inv.paid_by||'admin'}</p>`:''}
    <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn-ghost" href="invoice.html?token=${inv.access_token}" target="_blank" style="padding:10px 16px;font-size:12px">View / Print Invoice</a>
      <button class="btn-ghost" onclick="adminInvoiceResend(${inv.id},'${inv.invoice_no}')" style="padding:10px 16px;font-size:12px">Resend Email</button>
    </div>
  </div>`;
  // Reuse orderModal if present, else create overlay
  let modal=document.getElementById('invModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='invModal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML='<div id="invModalBody" style="background:#fff;max-width:640px;width:92%;max-height:85vh;overflow:auto;padding:30px;position:relative"><button onclick="document.getElementById(\'invModal\').remove()" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer">&times;</button></div>';
    document.body.appendChild(modal);
  }
  document.getElementById('invModalBody').innerHTML=html;
  modal.style.display='flex';
}
async function adminInvoiceMarkPaid(id,invNo){
  if(!confirm('Mark invoice '+invNo+' as PAID? This will email the customer a receipt.'))return;
  try{
    const r=await adminSetInvoiceStatus(id,'PAID','Marked as paid by admin');
    alert('Invoice '+invNo+' marked as PAID.'+(r.paid_email_sent?' Receipt email sent.':''));
    loadInvoicesAdmin();
  }catch(e){alert('Error: '+e.message);}
}
async function adminInvoiceSetStatus(id,status,invNo){
  const labels={CANCELLED:'cancel',REFUNDED:'refund',PENDING:'reopen'};
  const note=prompt('Note for '+labels[status]+' (optional):')||'';
  if(status==='CANCELLED'&&!confirm('Cancel invoice '+invNo+'?'))return;
  if(status==='REFUNDED'&&!confirm('Mark invoice '+invNo+' as REFUNDED?'))return;
  try{
    await adminSetInvoiceStatus(id,status,note);
    alert('Invoice '+invNo+' → '+status);
    loadInvoicesAdmin();
  }catch(e){alert('Error: '+e.message);}
}
async function adminInvoiceResend(id,invNo){
  try{
    const r=await adminResendInvoice(id);
    alert(r.sent?('Invoice '+invNo+' re-sent to customer.'):('Email queued locally — provider may be offline.'));
  }catch(e){alert('Error: '+e.message);}
}

