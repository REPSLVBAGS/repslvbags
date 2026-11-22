// ---------- Product detail page ----------
// COLORS, shade() and bagSVG() are shared via db.js
const PRODUCTS = getProducts().filter(p=>p.status==='active');
const params = new URLSearchParams(location.search);
const pid = +params.get('id');
const p = PRODUCTS.find(x=>x.id===pid) || PRODUCTS[0];
let qty=1, selColorIdx=0, mainImg=0;

function imgFor(idx){
  if(p.images&&p.images.length) return `<img src="${p.images[idx%p.images.length]}" alt="${p.name}">`;
  return bagSVG(p, idx%Math.max(1,p.colors.length));
}
function thumbCount(){return (p.images&&p.images.length)?p.images.length:Math.min(4,p.colors.length);}

// ---------- Recently viewed ----------
let recent=JSON.parse(localStorage.getItem('vr_recent')||'[]');
recent=[p.id,...recent.filter(id=>id!==p.id)].slice(0,6);
localStorage.setItem('vr_recent',JSON.stringify(recent));

// ---------- Render ----------
function render(){
  const thumbs=[...Array(thumbCount())].map((_,i)=>`<button class="${i===mainImg?'sel':''}" data-thumb="${i}">${imgFor(i)}</button>`).join('');
  document.getElementById('pdRoot').innerHTML=`
  <div class="pd">
    <div class="pd-gallery">
      <div class="pd-main" id="pdMain">${imgFor(mainImg)}</div>
      <div class="pd-thumbs">${thumbs}</div>
    </div>
    <div class="pd-info">
      <p class="hero-kicker">${p.style}</p>
      <h1>${p.name}</h1>
      <div class="price">${p.comparePrice>p.price?`<span class="was">$${p.comparePrice}</span>`:''}$${p.price}</div>
      <p class="pd-desc">${p.desc}</p>
      <div class="pd-meta">
        <div><span>Color</span><span>${p.colors[selColorIdx]}</span></div>
        <div><span>Style</span><span>${p.style}</span></div>
        <div><span>Availability</span><span>${p.stock>0?'In Stock':'Sold Out'}</span></div>
        <div><span>SKU</span><span>RLV-${String(p.id).padStart(4,'0')}</span></div>
      </div>
      <div class="pd-colors">
        ${p.colors.map((c,i)=>`<div class="swatch ${i===selColorIdx?'sel':''}" style="background:${COLORS[c]};width:26px;height:26px" data-pcolor="${i}" title="${c}"></div>`).join('')}
      </div>
      <div class="pd-qty">
        <button data-q="-1" aria-label="Decrease">${window.I?window.I.minus():'−'}</button><span id="qtyVal">${qty}</span><button data-q="1" aria-label="Increase">${window.I?window.I.plus():'+'}</button>
      </div>
      <div class="pd-actions">
        <button class="btn-gold" id="pdAdd" ${p.stock<=0?'disabled style="opacity:.5"':''}>Add to Cart — $${(p.price*qty).toFixed(2)}</button>
        <button class="btn-ghost" id="pdBuy" ${p.stock<=0?'disabled style="opacity:.5"':''}>Buy Now</button>
      </div>
      <p class="pd-ship-note">Complimentary US shipping over $150 · <a href="shipping-policy.html">Shipping info</a> · <a href="returns.html">30-day returns</a></p>
      <div class="pd-acc">
        <details open><summary>Product Details</summary><p>${p.desc} Crafted for the modern wardrobe — a silhouette that moves effortlessly from day to evening.</p></details>
        <details><summary>Materials & Dimensions</summary><p>Premium textured finish with coordinated hardware. Approx. 11" W × 8" H × 4" D. Interior pocket and magnetic closure.</p></details>
        <details><summary>Shipping Information</summary><p>Orders ship within 1–2 business days via USPS, UPS, FedEx or DHL. Free US shipping on orders over $150; otherwise $9.99 standard or $19.99 express. Track your order any time at <a href="track-order.html">Track Order</a>.</p></details>
        <details><summary>Returns Information</summary><p>30-day returns on unworn items in original condition. Start a return by emailing <a href="mailto:supportrepslvbags@gmail.com">supportrepslvbags@gmail.com</a> with your order number.</p></details>
      </div>
    </div>
  </div>`;

  // JSON-LD structured data
  let ld=document.getElementById('ld-product');
  if(!ld){ld=document.createElement('script');ld.type='application/ld+json';ld.id='ld-product';document.head.appendChild(ld);}
  ld.textContent=JSON.stringify({
    '@context':'https://schema.org','@type':'Product',
    name:p.name,description:p.desc,image:p.images&&p.images.length?p.images[0]:'logo.svg',
    sku:'RLV-'+String(p.id).padStart(4,'0'),brand:{'@type':'Brand',name:'House of Luxe'},
    offers:{'@type':'Offer',priceCurrency:'USD',price:p.price,availability:p.stock>0?'https://schema.org/InStock':'https://schema.org/OutOfStock',url:location.href}
  });

  // Related products (same style first, then others)
  const related=PRODUCTS.filter(x=>x.id!==p.id).sort((a,b)=>(b.style===p.style)-(a.style===p.style)).slice(0,4);
  document.getElementById('relatedGrid').innerHTML=related.map(cardHTML).join('');
  document.getElementById('relatedWrap').style.display='block';

  // Recently viewed
  const rec=recent.filter(id=>id!==p.id).map(id=>PRODUCTS.find(x=>x.id===id)).filter(Boolean).slice(0,4);
  if(rec.length){document.getElementById('recentGrid').innerHTML=rec.map(cardHTML).join('');document.getElementById('recentWrap').style.display='block';}

  if(window.trackEvent) trackEvent('ViewContent',{content_ids:[String(p.id)],content_name:p.name,content_type:'product',value:p.price});
}

function cardHTML(x){
  return `<div class="card" data-pid="${x.id}">
    <div class="card-img">${x.bestseller>0?'<span class="card-badge">Best Seller</span>':''}${x.images&&x.images.length?`<img src="${x.images[0]}" alt="${x.name}">`:bagSVG(x,0)}</div>
    <div class="card-body"><h3>${x.name}</h3><div class="price">${x.comparePrice>x.price?`<span class="was">$${x.comparePrice}</span>`:''}$${x.price}</div>
    <button class="add-cart" data-add="${x.id}">Add to Cart</button></div></div>`;
}

// ---------- Cart (shared vr_cart with index) ----------
function getCart(){return JSON.parse(localStorage.getItem('vr_cart')||'[]');}
function saveCart(c){localStorage.setItem('vr_cart',JSON.stringify(c));}
function addToCart(q){
  let cart=getCart();
  const ex=cart.find(i=>i.id===p.id);
  if(ex)ex.qty+=q;else cart.push({...p,qty:q});
  saveCart(cart);
  const badge=document.getElementById('cartCount');
  if(badge)badge.textContent=cart.reduce((s,i)=>s+i.qty,0);
  return cart;
}

// ---------- Events ----------
document.addEventListener('click',e=>{
  const t=e.target;
  if(t.closest('[data-thumb]')){mainImg=+t.closest('[data-thumb]').dataset.thumb;render();}
  if(t.closest('[data-pcolor]')){selColorIdx=+t.closest('[data-pcolor]').dataset.pcolor;mainImg=0;render();}
  if(t.closest('[data-q]')){qty=Math.max(1,qty+ +t.closest('[data-q]').dataset.q);document.getElementById('qtyVal').textContent=qty;document.getElementById('pdAdd').textContent=`Add to Cart — $${(p.price*qty).toFixed(2)}`;}
  if(t.closest('#pdAdd')){addToCart(qty);if(window.trackEvent)trackEvent('AddToCart',{content_ids:[String(p.id)],content_name:p.name,value:p.price*qty});const b=document.getElementById('pdAdd');b.textContent='Added ✓';setTimeout(()=>b.textContent=`Add to Cart — $${(p.price*qty).toFixed(2)}`,1500);}
  if(t.closest('#pdBuy')){addToCart(qty);location.href='index.html#checkout';}
  if(t.closest('[data-add]')){e.stopPropagation();const id=+t.closest('[data-add]').dataset.add;const prod=PRODUCTS.find(x=>x.id===id);let cart=getCart();const ex=cart.find(i=>i.id===id);if(ex)ex.qty++;else cart.push({...prod,qty:1});saveCart(cart);const b=document.getElementById('cartCount');if(b)b.textContent=cart.reduce((s,i)=>s+i.qty,0);}
  if(t.closest('.card')&&!t.closest('button')){location.href='product.html?id='+t.closest('.card').dataset.pid;}
});

// ---------- Header ----------
document.getElementById('cartBtn').onclick=()=>location.href='index.html#cart';
document.getElementById('hamburger').onclick=()=>document.getElementById('mobileMenu').classList.add('open');
document.getElementById('menuClose').onclick=()=>document.getElementById('mobileMenu').classList.remove('open');
document.querySelectorAll('#mobileMenu a').forEach(a=>a.onclick=()=>document.getElementById('mobileMenu').classList.remove('open'));
window.addEventListener('scroll',()=>document.getElementById('siteHeader').classList.toggle('scrolled',scrollY>10),{passive:true});
document.getElementById('cartCount').textContent=getCart().reduce((s,i)=>s+i.qty,0);
document.getElementById('year').textContent=new Date().getFullYear();

render();
