// ---------- Reps LV Bags first-party analytics tracker ----------
// Lightweight, privacy-conscious event collection. Sends batched events to the
// 'analytics-ingest' Supabase Edge Function. No cookies, no fingerprinting —
// anonymous visitor/session IDs only. Fails silently so the storefront is
// never affected if analytics is unreachable.
(function(){
  'use strict';

  // Public Supabase project credentials (same anon key already shipped in supabase.js).
  var SUPABASE_URL = 'https://wetxlhacaeakstqwqtdh.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndldHhsaGFjYWVha3N0cXdxdGRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3ODUzNjUsImV4cCI6MjExMDM2MTM2NX0.kd1s2dKHfN3HCl5cT09hoyyLjk5-pbJy42p9BJjqD3g';
  var ENDPOINT = SUPABASE_URL + '/functions/v1/analytics-ingest';

  // Respect the existing analytics consent banner (GA4/Meta). First-party
  // aggregate analytics still runs when declined? No — respect 'no'.
  // Consent 'yes' or unset-but-banner-accepted both allow tracking; explicit
  // 'no' disables it entirely.
  if (localStorage.getItem('vr_analytics_consent') === 'no') return;

  function uuid(){
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
      var r=Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16);
    });
  }

  var visitorId = localStorage.getItem('vr_vid');
  if(!visitorId){ visitorId = uuid(); localStorage.setItem('vr_vid', visitorId); }
  var sessionId = sessionStorage.getItem('vr_sid');
  if(!sessionId){ sessionId = uuid(); sessionStorage.setItem('vr_sid', sessionId); }

  // ---- context ----
  var path = location.pathname;
  var referrer = document.referrer || '';
  var refHost = '';
  try{ if(referrer) refHost = new URL(referrer).hostname; }catch(e){}
  var ownHost = location.hostname;
  var utm = {};
  try{
    var sp = new URLSearchParams(location.search);
    ['utm_source','utm_medium','utm_campaign'].forEach(function(k){ var v=sp.get(k); if(v) utm[k]=v.slice(0,100); });
  }catch(e){}

  var ua = navigator.userAgent || '';
  var device = /Mobi|Android|iPhone|iPad/i.test(ua) ? (/iPad|Tablet/i.test(ua)?'tablet':'mobile') : 'desktop';
  var source = 'direct';
  if(refHost && refHost !== ownHost && !/google|bing|yahoo|duckduckgo|baidu/i.test(refHost)){
    if(/facebook|instagram|tiktok|pinterest|twitter|x\.com/i.test(refHost)) source='social';
    else if(/google|bing|yahoo|duckduckgo/i.test(refHost)) source='search';
    else source='referral';
  } else if(/google|bing|yahoo|duckduckgo/i.test(refHost)) source='search';
  if(utm.utm_source){
    if(/facebook|instagram|tiktok|pinterest|twitter|x/i.test(utm.utm_source)) source='social';
    else source=utm.utm_source.toLowerCase().slice(0,40);
  }

  var queue = [];
  var FLUSH_MS = 5000, MAX_QUEUE = 100;

  function baseCtx(){
    return {
      visitor_id: visitorId,
      session_id: sessionId,
      page: path,
      referrer: refHost || '',
      source: source,
      device: device,
      utm: Object.keys(utm).length ? utm : undefined
    };
  }

  function push(type, extra){
    if(queue.length >= MAX_QUEUE) queue.shift();
    var ev = baseCtx();
    ev.type = type;
    ev.event_id = uuid();
    ev.ts = Date.now();
    if(extra) for(var k in extra){ if(extra[k]!==undefined && extra[k]!==null) ev[k]=extra[k]; }
    queue.push(ev);
    if(queue.length >= 10) flush();
  }

  function flush(){
    if(!queue.length) return;
    var batch = queue.splice(0, queue.length);
    var body = JSON.stringify({ events: batch });
    try{
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY },
        body: body,
        keepalive: true,
        credentials: 'omit'
      }).catch(function(){});
    }catch(e){}
  }

  setInterval(flush, FLUSH_MS);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden') flush(); });

  // ---- automatic events ----
  // One 'visit' per browser session (sessionStorage flag survives reloads,
  // resets when the tab/session ends — page refreshes do NOT inflate visitors).
  if(!sessionStorage.getItem('vr_visit_sent')){
    sessionStorage.setItem('vr_visit_sent','1');
    push('visit');
  }
  push('page_view');

  // Cart removals aren't covered by trackEvent — observe clicks on remove buttons.
  document.addEventListener('click', function(e){
    var rm = e.target.closest && e.target.closest('[data-rm]');
    if(rm){ push('cart_remove', { meta: { product_key: rm.getAttribute('data-rm') } }); }
  }, true);

  // ---- bridge existing trackEvent() calls into first-party analytics ----
  var MAP = {
    ViewContent:      { type:'product_view',    product:true },
    AddToCart:        { type:'add_to_cart',     product:true },
    InitiateCheckout: { type:'checkout_start' },
    Purchase:         { type:'checkout_complete' }, // order created client-side; revenue is server-verified only
    Search:           { type:'search' }
  };
  function dispatch(event, params){
    var m = MAP[event]; if(!m) return;
    var extra = {};
    if(m.product && params){
      if(params.content_ids && params.content_ids[0]) extra.product_id = String(params.content_ids[0]).slice(0,40);
      if(params.content_name) extra.product_name = String(params.content_name).slice(0,200);
      if(typeof params.value === 'number') extra.value = params.value;
    }
    if(params && typeof params.value === 'number' && !m.product) extra.value = params.value;
    if(params && params.order_id) extra.order_no = String(params.order_id).slice(0,40);
    if(params) extra.meta = { num_items: params.num_items, search_string: params.search_string };
    push(m.type, extra);
  }

  // Wrap window.trackEvent if it already exists (analytics.js loads first).
  if(typeof window.trackEvent === 'function'){
    var prev = window.trackEvent;
    window.trackEvent = function(event, params){
      try{ dispatch(event, params); }catch(e){}
      try{ return prev.apply(this, arguments); }catch(e){}
    };
  } else {
    // Pages without analytics.js: provide a safe dispatcher so app.js calls still record.
    window.trackEvent = function(event, params){ try{ dispatch(event, params); }catch(e){} };
  }
  // Expose for any future direct use.
  window.vrTrack = function(type, extra){ push(type, extra); };
})();
