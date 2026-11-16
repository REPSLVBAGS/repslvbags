// ---------- Product data (from db.js) ----------
// COLORS, shade() and bagSVG() are shared via db.js
let PRODUCTS = getProducts().filter(p=>p.status==='active');

// ---------- State ----------
let cart = JSON.parse(localStorage.getItem('vr_cart')||'[]');
let wishlist = JSON.parse(localStorage.getItem('vr_wish')||'[]');
let selColor={};
const FREE_SHIP=150, STD_SHIP=9.99, EXPRESS_SHIP=19.99;
function saveCart(){localStorage.setItem('vr_cart',JSON.stringify(cart));}

// ---------- Render products ----------
function productImg(p,ci=0){
  if(p.images&&p.images.length) return `<img src="${p.images[0]}" alt="${p.name}">`;
  return bagSVG(p,ci);
}
function badgeFor(p){
  if(p.bestseller>0) return '<span class="card-badge">Best Seller</span>';
  if(p.id>=PRODUCTS[PRODUCTS.length-1].id-2) return '<span class="card-badge new">New</span>';
  return '';
}
function renderProducts(){
  const q=(document.getElementById('searchInput').value||'').toLowerCase();
  const fp=document.getElementById('filterPrice').value, fc=document.getElementById('filterColor').value,
        fs=document.getElementById('filterStyle').value, sort=document.getElementById('sortBy').value;
  let list=PRODUCTS.filter(p=>{
    if(q && !(p.name+p.style+p.desc).toLowerCase().includes(q)) return false;
    if(fc && !p.colors.includes(fc)) return false;
    if(fs && p.style!==fs) return false;
    if(fp){const [a,b]=fp.split('-').map(Number); if(p.price<a||p.price>b) return false;}
    return true;
  });
  if(sort==='low') list.sort((a,b)=>a.price-b.price);
  else if(sort==='high') list.sort((a,b)=>b.price-a.price);
  else if(sort==='new') list.sort((a,b)=>b.id-a.id);
  else list.sort((a,b)=>b.bestseller-a.bestseller);

  const grid=document.getElementById('productGrid');
  grid.innerHTML=list.map(p=>{
    const ci=selColor[p.id]||0;
    const wished=wishlist.includes(p.id);
    return `<div class="card" data-id="${p.id}">
      <div class="card-img">
        ${badgeFor(p)}
        <button class="wish-heart ${wished?'active':''}" data-wish="${p.id}" aria-label="Wishlist">${wished?'♥':'♡'}</button>
        ${productImg(p,ci)}
        <button class="quick-view" data-qv="${p.id}">Quick View</button>
      </div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <div class="price">$${p.price}</div>
        <p class="desc">${p.desc}</p>
        <div class="swatches">${p.colors.map((c,i)=>`<div class="swatch ${i===ci?'sel':''}" style="background:${COLORS[c]}" data-swatch="${p.id}:${i}" title="${c}"></div>`).join('')}</div>
        <button class="add-cart" data-add="${p.id}">Add to Cart</button>
      </div></div>`;
  }).join('');
  document.getElementById('noResults').classList.toggle('hidden',list.length>0);
  if(window.trackEvent) trackEvent('Search',{search_string:document.getElementById('searchInput').value||undefined});
}

// ---------- Campaign photography ----------
const CAMPAIGN=[
  'photo_2026-11-14_01-27-09.jpg',
  'photo_2026-11-14_01-27-37.jpg',
  'photo_2026-11-14_01-27-50.jpg',
  'photo_2026-11-14_01-27-59.jpg',
  'photo_2026-11-14_01-28-06.jpg',
  'photo_2026-11-14_01-28-21.jpg'
];
const CAMPAIGN_ALT='Reps LV Bags campaign — luxury handbag editorial';

// ---------- Collections ----------
const COLLECTIONS=[
  {name:'Everyday Elegance',style:'Tote',desc:'Room for everything, styled for nothing'},
  {name:'Timeless Classics',style:'Shoulder Bag',desc:'Icons, reimagined for today'},
  {name:'Modern Shoulder Bags',style:'Crossbody',desc:'Hands-free, head-turning'},
  {name:'Statement Pieces',style:'Clutch',desc:'For the moments that matter'},
];
function renderCollections(){
  const box=document.getElementById('collectionGrid');
  if(!box)return;
  box.innerHTML=COLLECTIONS.map((c,i)=>{
    const sample=PRODUCTS.find(p=>p.style===c.style)||PRODUCTS[i%PRODUCTS.length];
    return `<div class="collection" data-style="${c.style}">
      <div class="col-img">${productImg(sample,i)}</div>
      <div class="col-label"><h3>${c.name}</h3><span>${c.desc}</span><span class="col-count">${PRODUCTS.filter(p=>p.style===c.style).length} pieces</span></div>
    </div>`;
  }).join('');
}

// ---------- Cart ----------
function cartTotal(){return cart.reduce((s,i)=>s+i.price*i.qty,0);}
function cartCount(){return cart.reduce((s,i)=>s+i.qty,0);}
function renderCart(){
  document.getElementById('cartCount').textContent=cartCount();
  document.getElementById('wishCount').textContent=wishlist.length;
  const box=document.getElementById('cartItems');
  if(!cart.length){box.innerHTML='<p class="empty-msg">Your bag is empty.</p>';}
  else box.innerHTML=cart.map(i=>`<div class="cart-item">
    <div class="ci-img">${productImg(i,0)}</div>
    <div class="ci-info"><h4>${i.name}</h4><div class="price">$${i.price}</div>
    <div class="qty"><button data-dec="${i.id}">−</button><span>${i.qty}</span><button data-inc="${i.id}">+</button><button class="remove" data-rm="${i.id}">Remove</button></div></div></div>`).join('');
  const t=cartTotal();
  document.getElementById('cartSubtotal').textContent='$'+t.toFixed(2);
  const rem=FREE_SHIP-t;
  document.getElementById('shipMsg').textContent=rem>0?`Add $${rem.toFixed(2)} more for complimentary shipping`:'🎉 You\'ve unlocked complimentary shipping!';
  document.getElementById('shipBar').style.width=Math.min(100,t/FREE_SHIP*100)+'%';
  renderSummary();
}
function renderSummary(){
  const t=cartTotal();
  document.getElementById('summaryItems').innerHTML=cart.map(i=>`<div class="sum-item"><div class="si-img">${productImg(i,0)}</div><span>${i.qty}× ${i.name}</span></div>`).join('')||'<p class="empty-msg">No items</p>';
  document.getElementById('sumSub').textContent='$'+t.toFixed(2);
  const ship=shipMethod();
  document.getElementById('sumShip').textContent=ship==='express'?`$${EXPRESS_SHIP.toFixed(2)}`:(t>=FREE_SHIP?'FREE':'$'+STD_SHIP.toFixed(2));
  document.getElementById('sumDisc').innerHTML=appliedDiscount?`<span style="color:#2e7d32">${appliedDiscount.code} (−$${discountAmt().toFixed(2)})</span>`:'<span style="display:flex;gap:6px"><input id="discInput" placeholder="Code" style="width:80px;padding:6px;border:1px solid #d8cfc0;font-size:12px"><button class="btn-ghost" style="padding:6px 10px;font-size:11px" onclick="applyDisc()">Apply</button></span>';
  document.getElementById('sumTotal').textContent='$'+grandTotal().toFixed(2);
}
function applyDisc(){
  const inp=document.getElementById('discInput');if(!inp)return;
  const d=validateDiscount(inp.value);
  if(d){appliedDiscount=d;renderSummary();}else alert('Invalid or expired discount code.');
}
function shipMethod(){const r=document.querySelector('input[name=ship]:checked');return r?r.value:'standard';}
function shipCost(){const t=cartTotal();return shipMethod()==='express'?EXPRESS_SHIP:(t>=FREE_SHIP?0:STD_SHIP);}
let appliedDiscount=null;
function discountAmt(){return appliedDiscount?cartTotal()*appliedDiscount.percent/100:0;}
function grandTotal(){return cartTotal()+shipCost()-discountAmt();}

// ---------- Wishlist ----------
function renderWish(){
  const box=document.getElementById('wishItems');
  const items=wishlist.map(id=>PRODUCTS.find(p=>p.id===id)).filter(Boolean);
  box.innerHTML=items.length?items.map(p=>`<div class="cart-item"><div class="ci-img">${bagSVG(p,0)}</div><div class="ci-info"><h4>${p.name}</h4><div class="price">$${p.price}</div><button class="add-cart" style="margin-top:8px;padding:8px" data-add="${p.id}">Add to Cart</button></div></div>`).join(''):'<p class="empty-msg">No saved bags yet. Tap ♡ on any bag.</p>';
}

// ---------- Modal ----------
function openModal(id){document.getElementById(id).classList.remove('hidden');document.getElementById('overlay').classList.add('show');}
function closeAll(){document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));document.getElementById('overlay').classList.remove('show');}
function openProduct(id){
  const p=PRODUCTS.find(x=>x.id===id);if(!p)return;const ci=selColor[id]||0;
  document.getElementById('modalBody').innerHTML=`
    <div class="modal-img">${productImg(p,ci)}</div>
    <div class="modal-info"><h2>${p.name}</h2><div class="price">$${p.price}</div>
    <p>${p.desc}</p><p style="font-size:12px;color:var(--muted)">Style: ${p.style} · ${p.stock} in stock</p>
    <div class="swatches">${p.colors.map((c,i)=>`<div class="swatch ${i===ci?'sel':''}" style="background:${COLORS[c]}" data-mswatch="${id}:${i}"></div>`).join('')}</div>
    <button class="add-cart" data-add="${id}">Add to Cart — $${p.price}</button>
    <a href="product.html?id=${id}" class="btn-ghost full" style="margin-top:10px;text-align:center;display:block">View Full Details</a></div>`;
  openModal('productModal');
  if(window.trackEvent) trackEvent('ViewContent',{content_ids:[String(id)],content_name:p.name,content_type:'product',value:p.price});
}

// ---------- Checkout ----------
let step=1, selectedPayMethod=null, checkoutOrderNo=null, orderCreated=false;
function showStep(n){
  step=n;
  document.querySelectorAll('.step').forEach(s=>s.classList.add('hidden'));
  document.getElementById('step'+n).classList.remove('hidden');
  document.querySelectorAll('.step-dot').forEach(d=>d.classList.toggle('active',+d.dataset.step<=n));
  if(n===3) renderPayMethods();
  renderSummary();
}
function openCheckout(){
  if(!cart.length)return alert('Your bag is empty.');
  closeAll();openModal('checkoutModal');showStep(1);
  document.getElementById('checkoutSteps').classList.remove('hidden');
  document.getElementById('confirmation').classList.add('hidden');
  selectedPayMethod=null;checkoutOrderNo=null;orderCreated=false;
  appliedDiscount=null;
  if(window.trackEvent) trackEvent('InitiateCheckout',{value:grandTotal(),num_items:cartCount()});
}

// ---------- Payment methods ----------
function renderPayMethods(){
  const methods=getActivePaymentMethods();
  const box=document.getElementById('payMethods');
  if(!methods.length){
    box.innerHTML='<p class="empty-msg">No payment methods are currently configured. Please contact support@repslvbags.com.</p>';
    document.getElementById('toStep4').classList.add('hidden');return;
  }
  document.getElementById('toStep4').classList.remove('hidden');
  box.innerHTML=methods.map(m=>`
    <label class="pay-method ${m.key==='cashapp'?'primary':''}">
      <input type="radio" name="paymethod" value="${m.key}" ${m.key==='cashapp'?'checked':''}>
      <span class="pm-name">${m.label}${m.key==='cashapp'?' <em class="pm-badge">Recommended</em>':''}</span>
      <span class="pm-desc">${m.key==='cashapp'?'Pay instantly via secure Cash App link':'Instructions emailed to you — pay & submit screenshot'}</span>
    </label>`).join('');
  box.querySelectorAll('input[name=paymethod]').forEach(r=>r.onchange=()=>{selectedPayMethod=r.value;});
  selectedPayMethod=box.querySelector('input[name=paymethod]:checked')?.value||methods[0].key;
}

// Generate a unique order number (checked against existing orders)
function genOrderNo(){
  let no; do{ no='ORD-'+Math.floor(1000+Math.random()*9000); }while(orderExists(no));
  return no;
}
function buildOrderData(methodKey,paymentStatus){
  const cfg=getPaymentConfig();
  const label=paymentMethodLabel(methodKey);
  return {
    orderNo:checkoutOrderNo, email:document.getElementById('fEmail').value.trim(),
    name:document.getElementById('fName').value.trim(),
    phone:document.getElementById('fPhone').value.trim(),
    address:document.getElementById('fAddr').value.trim(),
    city:document.getElementById('fCity').value.trim(), state:document.getElementById('fState').value.trim(),
    zip:document.getElementById('fZip').value.trim(),
    items:cart.map(i=>({name:i.name,price:i.price,qty:i.qty})),
    total:grandTotal(), discount:appliedDiscount?appliedDiscount.code:'',
    ship:(document.querySelector('input[name=ship]:checked')||{}).value||'standard',
    paymentMethod:label, paymentStatus
  };
}
// Create the order exactly once — safe against double-clicks/retries.
function ensureOrder(methodKey,paymentStatus){
  if(orderCreated&&checkoutOrderNo){
    const existing=findOrderByNo(checkoutOrderNo);
    // If the customer switched payment method, update the pending order.
    if(existing&&existing.paymentMethod!==paymentMethodLabel(methodKey)&&!['Paid','Evidence Submitted','Pending Verification'].includes(existing.paymentStatus)){
      return updateOrder(checkoutOrderNo,{paymentMethod:paymentMethodLabel(methodKey),paymentStatus});
    }
    return existing;
  }
  if(!checkoutOrderNo) checkoutOrderNo=genOrderNo();
  const order=createPendingOrder(buildOrderData(methodKey,paymentStatus));
  orderCreated=true;
  notifyNewOrderToBusiness(order);
  notifyOrderConfirmation(order);
  return order;
}

// Cash App deep link: append amount + order reference where supported.
function cashAppPayUrl(order){
  const cfg=getPaymentConfig(), base=(cfg.methods.cashapp&&cfg.methods.cashapp.url)||'';
  try{
    const u=new URL(base);
    if(!u.searchParams.has('amount')) u.searchParams.set('amount',order.total.toFixed(2));
    if(!u.searchParams.has('note')&&!u.searchParams.has('ref')) u.searchParams.set('note',order.orderNo);
    return u.toString();
  }catch(e){return base;}
}

function renderPayAction(){
  const box=document.getElementById('payAction');
  const methods=getActivePaymentMethods();
  const m=methods.find(x=>x.key===selectedPayMethod)||methods[0];
  if(!m){box.innerHTML='<p class="empty-msg">No payment methods configured.</p>';return;}
  selectedPayMethod=m.key;
  const total=grandTotal();

  if(m.key==='cashapp'){
    // Create order now so the reference exists before payment.
    const order=ensureOrder('cashapp','Awaiting Payment');
    const payUrl=cashAppPayUrl(order);
    const hasLink=/^https?:\/\//.test(payUrl);
    box.innerHTML=`
      <h3>Pay with Cash App</h3>
      <div class="cashapp-box">
        <p>Order Number: <b>${order.orderNo}</b></p>
        <p>Amount Due: <b>$${total.toFixed(2)}</b></p>
        ${hasLink
          ?`<p style="font-size:13px;color:var(--muted)">Click below to open Cash App and pay securely. <b>Include "${order.orderNo}" in the payment note</b> so we can match your payment instantly.</p>`
          :`<p style="font-size:13px;color:#8a5a00"><b>Our Cash App payment link is being configured.</b> Please use another method below, or email support@repslvbags.com and we'll send you payment details for order ${order.orderNo}.</p>`}
      </div>
      ${hasLink?`<a class="btn-gold full" style="display:block;text-align:center;margin-bottom:12px" href="${payUrl}" target="_blank" rel="noopener" id="cashAppPayBtn">PAY WITH CASH APP</a>`:''}
      <div class="step-nav">
        <button class="btn-ghost" id="backTo3">Back</button>
        <button class="btn-ghost" id="paidDoneBtn">I've Completed Payment</button>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:14px">After paying, click "I've Completed Payment". You can also submit your payment screenshot later via the confirmation link in your email. Payment stays <b>pending</b> until our team verifies it.</p>`;
    const payBtn=document.getElementById('cashAppPayBtn');if(payBtn)payBtn.onclick=()=>{if(window.trackEvent)trackEvent('InitiateCheckout',{value:total,order_id:order.orderNo});};
    document.getElementById('paidDoneBtn').onclick=()=>showConfirmation(order,'cashapp');
  } else {
    // Chime / Zelle / Apple Pay (manual arrangement): create order + email instructions.
    const order=ensureOrder(m.key,'Payment Instructions Sent');
    notifyPaymentInstructions(order);
    const cfg=getPaymentConfig();
    box.innerHTML=`
      <h3>Pay with ${m.label}</h3>
      <div class="cashapp-box">
        <p>Order Number: <b>${order.orderNo}</b></p>
        <p>Amount Due: <b>$${total.toFixed(2)}</b></p>
        <p style="font-size:13px">Payment instructions for <b>${m.label}</b> have been emailed to <b>${order.email}</b>.</p>
        ${m.details?`<p style="font-size:13px;margin-top:8px"><b>Details:</b> ${m.details}</p>`:''}
        <p style="font-size:13px;margin-top:8px">After sending payment, submit your screenshot on the confirmation page — the link is in your email, or use the button below.</p>
      </div>
      <a class="btn-gold full" style="display:block;text-align:center;margin-bottom:12px" href="payment-confirm.html?order=${order.orderNo}&email=${encodeURIComponent(order.email)}">Submit Payment Confirmation</a>
      <div class="step-nav">
        <button class="btn-ghost" id="backTo3">Back</button>
        <button class="btn-gold" id="manualDoneBtn">Done — I'll Pay via Email Instructions</button>
      </div>`;
    document.getElementById('manualDoneBtn').onclick=()=>showConfirmation(order,m.key);
  }
  document.getElementById('backTo3').onclick=()=>showStep(3);
}

function showConfirmation(order,methodKey){
  document.getElementById('checkoutSteps').classList.add('hidden');
  document.getElementById('confirmation').classList.remove('hidden');
  document.getElementById('confOrderNo').textContent=order.orderNo;
  const d=new Date(Date.now()+5*864e5);
  document.getElementById('confDelivery').textContent=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const isCash=methodKey==='cashapp';
  document.getElementById('confPayMsg').innerHTML=isCash
    ?'Thank you! Complete your Cash App payment using the link — your order is <b>awaiting payment verification</b>.'
    :'Your order has been received and is awaiting payment verification. Payment instructions were sent to your email.';
  document.getElementById('confPayLink').innerHTML=`<a href="payment-confirm.html?order=${order.orderNo}&email=${encodeURIComponent(order.email)}" style="color:var(--espresso);text-decoration:underline;font-weight:600">Submit Payment Screenshot →</a>`;
  if(window.trackEvent) trackEvent('Purchase',{value:order.total,num_items:cartCount(),order_id:order.orderNo});
  cart=[];saveCart();renderCart();
}

// ---------- Events ----------
document.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('[data-add]')){const id=+t.closest('[data-add]').dataset.add;const p=PRODUCTS.find(x=>x.id===id);const ex=cart.find(i=>i.id===id);if(ex)ex.qty++;else cart.push({...p,qty:1});saveCart();renderCart();if(window.trackEvent)trackEvent('AddToCart',{content_ids:[String(id)],content_name:p.name,value:p.price});}
  if(t.closest('[data-wish]')){e.stopPropagation();const id=+t.closest('[data-wish]').dataset.wish;const i=wishlist.indexOf(id);if(i>-1)wishlist.splice(i,1);else wishlist.push(id);localStorage.setItem('vr_wish',JSON.stringify(wishlist));renderProducts();renderCart();}
  if(t.closest('[data-swatch]')){const [id,i]=t.closest('[data-swatch]').dataset.swatch.split(':').map(Number);selColor[id]=i;renderProducts();}
  if(t.closest('[data-mswatch]')){const [id,i]=t.closest('[data-mswatch]').dataset.mswap.split(':').map(Number);selColor[id]=i;openProduct(id);}
  if(t.closest('[data-qv]')){e.stopPropagation();openProduct(+t.closest('[data-qv]').dataset.qv);}
  if(t.closest('[data-inc]')){const i=cart.find(x=>x.id===+t.closest('[data-inc]').dataset.inc);i.qty++;saveCart();renderCart();}
  if(t.closest('[data-dec]')){const i=cart.find(x=>x.id===+t.closest('[data-dec]').dataset.dec);if(i.qty>1)i.qty--;else cart=cart.filter(x=>x.id!==i.id);saveCart();renderCart();}
  if(t.closest('[data-rm]')){cart=cart.filter(x=>x.id!==+t.closest('[data-rm]').dataset.rm);saveCart();renderCart();}
  if(t.closest('.card')&&!t.closest('button')&&!t.closest('.swatch')){location.href='product.html?id='+t.closest('.card').dataset.id;}
  if(t.closest('[data-close]')||t===document.getElementById('overlay')){closeAll();document.getElementById('cartDrawer').classList.remove('open');document.getElementById('wishDrawer').classList.remove('open');document.getElementById('overlay').classList.remove('show');}
});

// Collection cards → filter shop
document.getElementById('collectionGrid').addEventListener('click',e=>{
  const c=e.target.closest('.collection');if(!c)return;
  document.getElementById('filterStyle').value=c.dataset.style;
  renderProducts();
  document.getElementById('shop').scrollIntoView({behavior:'smooth'});
});

// Editorial cards → campaign photography
document.querySelectorAll('.ed-img').forEach((el,i)=>{
  const src=CAMPAIGN[(i+2)%CAMPAIGN.length];
  el.innerHTML=`<img src="${src}" alt="${CAMPAIGN_ALT}" loading="lazy">`;
});

// ---------- Header / menu ----------
document.getElementById('cartBtn').onclick=()=>{renderCart();document.getElementById('cartDrawer').classList.add('open');document.getElementById('overlay').classList.add('show');};
document.getElementById('wishlistBtn').onclick=()=>{renderWish();document.getElementById('wishDrawer').classList.add('open');document.getElementById('overlay').classList.add('show');};
document.getElementById('searchBtn').onclick=()=>document.getElementById('searchBar').classList.toggle('hidden');
document.getElementById('hamburger').onclick=()=>document.getElementById('mobileMenu').classList.add('open');
document.getElementById('menuClose').onclick=()=>document.getElementById('mobileMenu').classList.remove('open');
document.querySelectorAll('#mobileMenu a').forEach(a=>a.onclick=()=>document.getElementById('mobileMenu').classList.remove('open'));
window.addEventListener('scroll',()=>document.getElementById('siteHeader').classList.toggle('scrolled',scrollY>10),{passive:true});
document.getElementById('checkoutBtn').onclick=openCheckout;
document.getElementById('doneBtn').onclick=()=>{closeAll();cart=[];saveCart();renderCart();};

// Hash deep-links: #cart opens drawer
if(location.hash==='#cart'){document.getElementById('cartBtn').click();}

['filterPrice','filterColor','filterStyle','sortBy'].forEach(id=>document.getElementById(id).onchange=renderProducts);
document.getElementById('searchInput').oninput=renderProducts;
document.querySelectorAll('input[name=ship]').forEach(r=>r.onchange=renderSummary);

document.getElementById('form1').onsubmit=e=>{e.preventDefault();showStep(2);};
document.getElementById('backTo1').onclick=()=>showStep(1);
document.getElementById('toStep3').onclick=()=>showStep(3);
document.getElementById('backTo2').onclick=()=>showStep(2);
document.getElementById('toStep4').onclick=()=>{showStep(4);renderPayAction();};
document.getElementById('newsForm').onsubmit=async e=>{
  e.preventDefault();
  const email=document.getElementById('newsEmail').value.trim();
  if(typeof notifyCustomerMessage==='function'){
    try{ await notifyCustomerMessage({name:'',email,orderNo:'',message:'Newsletter signup — subscribed via website footer.',type:'newsletter'}); }catch(err){console.warn('Newsletter notify failed:',err);}
  }
  document.getElementById('newsForm').classList.add('hidden');document.getElementById('newsDone').classList.remove('hidden');
};

// ---------- Scroll reveal ----------
const io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

// ---------- Init ----------
const _content=getContent();
document.querySelector('.announce').textContent=_content.announcement||'Complimentary US shipping on qualifying orders · Secure checkout · 30-day returns';
document.getElementById('heroImg').innerHTML=`<img src="${CAMPAIGN[0]}" alt="${CAMPAIGN_ALT} — hero" fetchpriority="high">`;
document.getElementById('storyImg').innerHTML=`<img src="${CAMPAIGN[1]}" alt="${CAMPAIGN_ALT} — brand story" loading="lazy">`;
document.getElementById('instaGrid').innerHTML=CAMPAIGN.map((src,i)=>{
  const url=(_content.instagram&&_content.instagram[i])||'#';
  return `<a href="${url}" target="${url==='#'?'_self':'_blank'}" rel="noopener" aria-label="Campaign photo ${i+1}"><img src="${src}" alt="${CAMPAIGN_ALT} ${i+1}" loading="lazy"></a>`;
}).join('');
document.getElementById('year').textContent=new Date().getFullYear();
renderCollections();
renderProducts();renderCart();renderWish();
