// ---------- Reps LV Bags database (localStorage — swap internals for Supabase later) ----------
const DB_PRODUCTS='vr_products', DB_CONTENT='vr_content', DB_DISCOUNTS='vr_discounts', DB_ADMIN='vr_admin_user';

// ---------- Shared color map + premium SVG bag art ----------
const COLORS = { Black:'#1a1a1a', Beige:'#d9c8a9', Brown:'#6B4F3A', White:'#f5f2ec', Red:'#8e2f2f' };
function shade(hex,amt){const n=parseInt(hex.slice(1),16);let r=(n>>16)+amt,g=((n>>8)&255)+amt,b=(n&255)+amt;r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b));return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');}
let _svgSeq=0;
function bagSVG(p, colorIdx=0){
  const c = COLORS[p.colors[colorIdx % p.colors.length]] || '#8a8177';
  const dark = shade(c,-28), light = shade(c,16), deep = shade(c,-45);
  const uid='b'+(++_svgSeq), gid=uid+'g', bid=uid+'b', hid=uid+'h';
  const stitch=`stroke="${light}" stroke-width="1.6" stroke-dasharray="5 4" fill="none" opacity=".55"`;
  const shapes = {
    'Tote': `
      <path d="M112 96 Q112 44 150 44 Q188 44 188 96" fill="none" stroke="${deep}" stroke-width="7" stroke-linecap="round"/>
      <rect x="70" y="92" width="160" height="146" rx="12" fill="url(#${gid})" stroke="rgba(0,0,0,.16)" stroke-width="2"/>
      <rect x="82" y="104" width="136" height="122" rx="8" ${stitch}/>
      <rect x="70" y="196" width="160" height="16" rx="6" fill="${deep}" opacity=".28"/>
      <rect x="70" y="92" width="160" height="146" rx="12" fill="none" stroke="${light}" stroke-width="1" opacity=".4"/>`,
    'Crossbody': `
      <path d="M82 122 L38 52 M218 122 L262 52" stroke="${deep}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <rect x="80" y="112" width="140" height="108" rx="14" fill="url(#${gid})" stroke="rgba(0,0,0,.16)" stroke-width="2"/>
      <rect x="95" y="128" width="110" height="76" rx="8" ${stitch}/>
      <circle cx="150" cy="166" r="10" fill="url(#${hid})" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
      <circle cx="150" cy="166" r="4" fill="${deep}"/>`,
    'Clutch': `
      <path d="M75 128 L150 168 L225 128" fill="none" stroke="${deep}" stroke-width="3"/>
      <rect x="75" y="122" width="150" height="86" rx="10" fill="url(#${gid})" stroke="rgba(0,0,0,.16)" stroke-width="2"/>
      <rect x="86" y="134" width="128" height="62" rx="6" ${stitch}/>
      <rect x="130" y="140" width="40" height="24" rx="5" fill="url(#${hid})" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`,
    'Shoulder Bag': `
      <path d="M106 106 Q106 58 150 58 Q194 58 194 106" fill="none" stroke="${deep}" stroke-width="6" stroke-linecap="round"/>
      <rect x="85" y="102" width="130" height="118" rx="14" fill="url(#${gid})" stroke="rgba(0,0,0,.16)" stroke-width="2"/>
      <path d="M85 148 Q150 130 215 148 L215 172 Q150 152 85 172 Z" fill="${deep}" opacity=".3"/>
      <rect x="97" y="114" width="106" height="94" rx="9" ${stitch}/>
      <circle cx="150" cy="192" r="9" fill="url(#${hid})" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`,
    'Mini Bag': `
      <path d="M112 128 Q112 84 150 84 Q188 84 188 128" fill="none" stroke="${deep}" stroke-width="5" stroke-linecap="round"/>
      <rect x="95" y="124" width="110" height="86" rx="12" fill="url(#${gid})" stroke="rgba(0,0,0,.16)" stroke-width="2"/>
      <rect x="107" y="136" width="86" height="62" rx="8" ${stitch}/>
      <rect x="126" y="156" width="48" height="28" rx="6" fill="url(#${hid})" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`,
  };
  return `<svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="${bid}" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="#faf7f1"/><stop offset="100%" stop-color="#e9e1d3"/>
      </radialGradient>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${light}"/><stop offset="45%" stop-color="${c}"/><stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
      <linearGradient id="${hid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#f4f1ea"/><stop offset="50%" stop-color="#c9c2b4"/><stop offset="100%" stop-color="#8f887a"/>
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#${bid})"/>
    <ellipse cx="150" cy="252" rx="105" ry="13" fill="#3a322a" opacity=".14"/>
    ${shapes[p.style]||shapes['Tote']}
  </svg>`;
}

// ---------- PRODUCTS ----------
const SEED_PRODUCTS=[
  {id:1,name:'The Vintage Classic Flap Bag',price:145,comparePrice:0,style:'Shoulder Bag',colors:['Black','Beige','Brown'],stock:12,status:'active',bestseller:5,desc:'Iconic quilted flap silhouette with gold-tone hardware. Full-grain leather that ages beautifully.',images:[]},
  {id:2,name:'The Paris Tote',price:129,comparePrice:0,style:'Tote',colors:['Beige','Black','Brown'],stock:8,status:'active',bestseller:4,desc:'Structured everyday tote with dual handles and interior zip pocket.',images:[]},
  {id:3,name:'The Milano Crossbody',price:119,comparePrice:0,style:'Crossbody',colors:['Black','Brown','Red'],stock:15,status:'active',bestseller:3,desc:'Compact crossbody with adjustable strap and signature turn-lock closure.',images:[]},
  {id:4,name:'The Noir Mini Bag',price:98,comparePrice:0,style:'Mini Bag',colors:['Black','Red'],stock:20,status:'active',bestseller:2,desc:'Mini silhouette with chain strap and top zip. Perfect for evenings out.',images:[]},
  {id:5,name:'The Beige Cloud Shoulder Bag',price:135,comparePrice:0,style:'Shoulder Bag',colors:['Beige','White','Brown'],stock:6,status:'active',bestseller:4,desc:'Soft slouchy shoulder bag in creamy tones with magnetic closure.',images:[]},
  {id:6,name:'The Gold Chain Clutch',price:89,comparePrice:0,style:'Clutch',colors:['Black','Red','Beige'],stock:18,status:'active',bestseller:1,desc:'Envelope clutch with detachable gold chain.',images:[]},
  {id:7,name:'The Chelsea Tote',price:139,comparePrice:0,style:'Tote',colors:['Black','Brown'],stock:9,status:'active',bestseller:3,desc:'Oversized tote with suede interior and protective feet.',images:[]},
  {id:8,name:'The Scarlet Crossbody',price:124,comparePrice:0,style:'Crossbody',colors:['Red','Black'],stock:11,status:'active',bestseller:2,desc:'Bold red crossbody with gold hardware and quilted detail.',images:[]},
  {id:9,name:'The Ivory Mini Bag',price:104,comparePrice:0,style:'Mini Bag',colors:['White','Beige'],stock:14,status:'active',bestseller:1,desc:'Ivory mini bag with pearl-tone hardware.',images:[]},
  {id:10,name:'The Espresso Shoulder Bag',price:142,comparePrice:0,style:'Shoulder Bag',colors:['Brown','Black'],stock:7,status:'active',bestseller:3,desc:'Rich espresso leather with braided detail and magnetic flap.',images:[]},
  {id:11,name:'The Noir Clutch',price:95,comparePrice:0,style:'Clutch',colors:['Black','Red'],stock:16,status:'active',bestseller:2,desc:'Sleek black clutch with satin lining and magnetic snap.',images:[]},
  {id:12,name:'The Sahara Crossbody',price:112,comparePrice:0,style:'Crossbody',colors:['Beige','Brown','White'],stock:13,status:'active',bestseller:1,desc:'Woven-inspired texture crossbody in warm neutrals.',images:[]},
  // test/draft products for admin demo
  {id:101,name:'TEST: The Emerald Tote',price:149,comparePrice:179,style:'Tote',colors:['Black','Beige'],stock:4,status:'draft',bestseller:0,desc:'Test product — emerald accent tote.',images:[]},
  {id:102,name:'TEST: The Rose Clutch',price:79,comparePrice:0,style:'Clutch',colors:['Red','Black'],stock:2,status:'draft',bestseller:0,desc:'Test product — rose clutch.',images:[]},
  {id:103,name:'TEST: The Onyx Mini',price:110,comparePrice:0,style:'Mini Bag',colors:['Black'],stock:0,status:'soldout',bestseller:0,desc:'Test product — sold out mini.',images:[]},
];
function getProducts(){let p=JSON.parse(localStorage.getItem(DB_PRODUCTS)||'null');if(!p){p=SEED_PRODUCTS;localStorage.setItem(DB_PRODUCTS,JSON.stringify(p));}return p;}
function saveProducts(p){localStorage.setItem(DB_PRODUCTS,JSON.stringify(p));}
function nextProductId(){return Math.max(0,...getProducts().map(p=>p.id))+1;}

// ---------- CONTENT (homepage editable bits) ----------
const SEED_CONTENT={
  announcement:'Free US Shipping Over $150  |  30-Day Easy Returns',
  heroKicker:'Luxury, Reimagined.',
  heroTitle:'Timeless Bags.<br><em>Modern Prices.</em>',
  heroSub:'Iconic silhouettes, impeccable quality, and prices that make sense. Vintage-inspired luxury — delivered to your door.',
  heroBtn:'Shop Bestsellers',
  instagram:['https://instagram.com/repslvbags','https://instagram.com/repslvbags/p/1','https://instagram.com/repslvbags/p/2']
};
function getContent(){let c=JSON.parse(localStorage.getItem(DB_CONTENT)||'null');if(!c){c=SEED_CONTENT;localStorage.setItem(DB_CONTENT,JSON.stringify(c));}return c;}
function saveContent(c){localStorage.setItem(DB_CONTENT,JSON.stringify(c));}

// ---------- DISCOUNT CODES ----------
function getDiscounts(){let d=JSON.parse(localStorage.getItem(DB_DISCOUNTS)||'null');if(!d){d=[{code:'VINTAGE10',percent:10,expiry:''}];localStorage.setItem(DB_DISCOUNTS,JSON.stringify(d));}return d;}
function saveDiscounts(d){localStorage.setItem(DB_DISCOUNTS,JSON.stringify(d));}
function validateDiscount(code){
  const d=getDiscounts().find(x=>x.code.toUpperCase()===code.trim().toUpperCase());
  if(!d) return null;
  if(d.expiry && new Date(d.expiry)<new Date()) return null;
  return d;
}

// ---------- PAYMENT CONFIG ----------
const DB_PAYMENTS='vr_payment_config';
const SEED_PAYMENTS={
  businessEmail:'supportrepslvbags@gmail.com',
  methods:{
    cashapp:{enabled:true, url:'', note:'', label:'Cash App'},
    chime:{enabled:true, details:'', label:'Chime'},
    zelle:{enabled:true, details:'', label:'Zelle'},
    applepay:{enabled:true, details:'', label:'Apple Pay'}
  }
};
function getPaymentConfig(){
  let c=JSON.parse(localStorage.getItem(DB_PAYMENTS)||'null');
  if(!c){c=JSON.parse(JSON.stringify(SEED_PAYMENTS));localStorage.setItem(DB_PAYMENTS,JSON.stringify(c));return c;}
  // Merge any missing methods/fields from seed so new options appear for existing users.
  Object.keys(SEED_PAYMENTS.methods).forEach(k=>{
    if(!c.methods)c.methods={};
    if(!c.methods[k]) c.methods[k]={...SEED_PAYMENTS.methods[k]};
    else Object.keys(SEED_PAYMENTS.methods[k]).forEach(f=>{if(c.methods[k][f]===undefined)c.methods[k][f]=SEED_PAYMENTS.methods[k][f];});
  });
  if(c.businessEmail===undefined)c.businessEmail=SEED_PAYMENTS.businessEmail;
  // Centralized inbox: always route business notifications to the main Gmail.
  c.businessEmail='supportrepslvbags@gmail.com';
  // One-time upgrade: enable all four methods for configs saved before they existed.
  if(c._v!==2){
    ['cashapp','chime','zelle','applepay'].forEach(k=>{if(c.methods[k])c.methods[k].enabled=true;});
    c._v=2; localStorage.setItem(DB_PAYMENTS,JSON.stringify(c));
  }
  return c;
}
function savePaymentConfig(c){localStorage.setItem(DB_PAYMENTS,JSON.stringify(c));}
// Show every enabled method. Cash App needs a URL to generate the pay link;
// manual methods work with or without pre-filled details (instructions are emailed).
function getActivePaymentMethods(){
  const cfg=getPaymentConfig(), out=[];
  const order=['cashapp','chime','zelle','applepay'];
  order.forEach(k=>{
    const m=cfg.methods[k]; if(!m||!m.enabled) return;
    out.push({key:k,...m});
  });
  return out;
}
function paymentMethodLabel(key){
  const cfg=getPaymentConfig();
  return (cfg.methods[key]&&cfg.methods[key].label)||key;
}

// ---------- ADMIN USER ----------
function getAdmin(){let a=JSON.parse(localStorage.getItem(DB_ADMIN)||'null');if(!a){a={email:'admin@repslvbags.com',pass:'admin123'};localStorage.setItem(DB_ADMIN,JSON.stringify(a));}return a;}
function checkAdmin(email,pass){const a=getAdmin();return a.email.toLowerCase()===email.trim().toLowerCase()&&a.pass===pass;}
