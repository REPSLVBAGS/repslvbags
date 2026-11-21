// ---------- Reps LV Bags Analytics Dashboard ----------
// Private admin analytics. All data comes from the 'analytics-query'
// Edge Function (admin-JWT protected). Live feed via Supabase Realtime.
(function(){
'use strict';

var SUPABASE_URL = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : 'https://wetxlhacaeakstqwqtdh.supabase.co';
var DAY = 864e5;
var state = {
  events: [], orders: [], visitors: [],
  selFrom: null, selTo: null,          // selected filter range
  fetchFrom: null, fetchTo: null,      // actually fetched window (>= last 7 days)
  metric: 'visitors',
  abandonMins: +(localStorage.getItem('vr_an_abandon') || 30),
  autoRefresh: localStorage.getItem('vr_an_refresh') !== 'no',
  refreshTimer: null,
  channel: null
};

// ---------- helpers ----------
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function fmt$(n){ return '$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtN(n){ return (Number(n)||0).toLocaleString('en-US'); }
function pct(a,b){ return b? Math.round(a/b*1000)/10 : 0; }
function dayKey(t){ var d=new Date(t); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dayStart(t){ var d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); }
function isClient(e){ return e.visitor_id !== 'system'; }
function inRange(ts, from, to){ return ts >= from && ts < to; }
function timeAgo(ts){
  var s=(Date.now()-ts)/1000;
  if(s<60) return 'just now';
  if(s<3600) return Math.floor(s/60)+'m ago';
  if(s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
function fmtDateTime(ts){
  var d=new Date(ts);
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}
function toast(msg){ var t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show');},2600); }

var EVENT_META = {
  visit:{label:'Visitor',icon:'👤',cls:'visit'},
  page_view:{label:'Page view',icon:'📄',cls:'page_view'},
  product_view:{label:'Viewed product',icon:'👁',cls:'product_view'},
  add_to_cart:{label:'Added to cart',icon:'🛍',cls:'add_to_cart'},
  cart_remove:{label:'Removed from cart',icon:'↩',cls:'cart_remove'},
  checkout_start:{label:'Started checkout',icon:'💳',cls:'checkout_start'},
  checkout_complete:{label:'Completed checkout',icon:'✅',cls:'checkout_complete'},
  search:{label:'Searched',icon:'🔍',cls:'search'},
  order_created:{label:'Order created',icon:'📦',cls:'order_created'},
  payment_submitted:{label:'Payment submitted',icon:'🧾',cls:'payment_submitted'},
  payment_verified:{label:'Payment verified',icon:'💰',cls:'payment_verified'},
  payment_rejected:{label:'Payment rejected',icon:'⛔',cls:'payment_rejected'}
};

// ---------- range ----------
function computeRange(){
  var sel=$('rangeSelect').value, now=Date.now(), from, to=now+DAY;
  if(sel==='today'){ from=dayStart(now); }
  else if(sel==='yesterday'){ from=dayStart(now)-DAY; to=dayStart(now); }
  else if(sel==='7d'){ from=dayStart(now)-6*DAY; }
  else if(sel==='30d'){ from=dayStart(now)-29*DAY; }
  else if(sel==='90d'){ from=dayStart(now)-89*DAY; }
  else { // custom
    var f=$('fromDate').value, t=$('toDate').value;
    from=f?new Date(f+'T00:00:00').getTime():dayStart(now)-29*DAY;
    to=t?new Date(t+'T23:59:59').getTime()+1000:now+DAY;
  }
  state.selFrom=from; state.selTo=to;
  // Always fetch at least the last 7 days for the hero stats.
  var min7=dayStart(now)-6*DAY;
  state.fetchFrom=Math.min(from,min7); state.fetchTo=Math.max(to,now+DAY);
}

// ---------- data ----------
async function sbSession(){
  var sb=(typeof getSb==='function')?getSb():null;
  if(!sb) return null;
  var {data}=await sb.auth.getSession();
  return data.session;
}

async function fetchData(silent){
  var session=await sbSession();
  if(!session){ showLogin('Session expired. Please sign in again.'); return false; }
  try{
    var url=SUPABASE_URL+'/functions/v1/analytics-query?from='+encodeURIComponent(new Date(state.fetchFrom).toISOString())+'&to='+encodeURIComponent(new Date(state.fetchTo).toISOString());
    var anonKey=(typeof SUPABASE_ANON_KEY!=='undefined')?SUPABASE_ANON_KEY:'';
    var res=await fetch(url,{headers:{apikey:anonKey,Authorization:'Bearer '+session.access_token}});
    if(res.status===401){ showLogin('Not authorized.'); return false; }
    if(!res.ok) throw new Error('HTTP '+res.status);
    var data=await res.json();
    state.events=data.events||[]; state.orders=data.orders||[]; state.visitors=data.visitors||[];
    computeMetrics(); renderAll();
    if(!silent) toast('Data refreshed');
    return true;
  }catch(e){
    console.warn('analytics-query failed',e);
    if(!silent) toast('Failed to load analytics data');
    return false;
  }
}

// ---------- metrics ----------
var M={};
function computeMetrics(){
  var ev=state.events.filter(function(e){return inRange(new Date(e.created_at).getTime(),state.fetchFrom,state.fetchTo);});
  var cli=ev.filter(isClient);
  var ord=state.orders.filter(function(o){var t=new Date(o.order_date).getTime();return inRange(t,state.selFrom,state.selTo);});
  var cliSel=cli.filter(function(e){return inRange(new Date(e.created_at).getTime(),state.selFrom,state.selTo);});
  var ordAll=state.orders; // orders already fetched within fetch window
  var last7From=Math.max(state.selFrom, dayStart(Date.now())-6*DAY);

  function count(list,type){return list.filter(function(e){return e.type===type;}).length;}
  function inSel(e){return inRange(new Date(e.created_at).getTime(),state.selFrom,state.selTo);}
  function inLast7(e){return inRange(new Date(e.created_at).getTime(),last7From,Date.now()+DAY);}

  var cliLast7=cli.filter(inLast7);
  var paidOrders=ordAll.filter(function(o){return o.payment_status==='Paid'&&inRange(new Date(o.order_date).getTime(),state.selFrom,state.selTo);});
  var revenue=paidOrders.reduce(function(s,o){return s+(+o.total||0);},0);

  // sessions for abandonment (client events in fetched window)
  var sessions={};
  cli.forEach(function(e){
    var s=sessions[e.session_id]||(sessions[e.session_id]={last:0,atc:false,co:false,cc:false,vid:e.visitor_id});
    var t=new Date(e.created_at).getTime();
    if(t>s.last)s.last=t;
    if(e.type==='add_to_cart')s.atc=true;
    if(e.type==='checkout_start')s.co=true;
    if(e.type==='checkout_complete'||e.type==='order_created')s.cc=true;
  });
  var staleCut=Date.now()-state.abandonMins*60000;
  var sessList=Object.keys(sessions).map(function(k){return sessions[k];});
  var abandonedCO=sessList.filter(function(s){return s.co&&!s.cc&&s.last<staleCut;}).length;
  var abandonedCart=sessList.filter(function(s){return s.atc&&!s.co&&s.last<staleCut;}).length;
  var abandonedCO7=0, sessions7={};
  cliLast7.forEach(function(e){
    var s=sessions7[e.session_id]||(sessions7[e.session_id]={last:0,atc:false,co:false,cc:false});
    var t=new Date(e.created_at).getTime();
    if(t>s.last)s.last=t;
    if(e.type==='add_to_cart')s.atc=true;
    if(e.type==='checkout_start')s.co=true;
    if(e.type==='checkout_complete')s.cc=true;
  });
  Object.keys(sessions7).forEach(function(k){var s=sessions7[k];if(s.co&&!s.cc)s.last<staleCut&&abandonedCO7++;});

  M.counts={
    pageViews:count(cliSel,'page_view'),
    productViews:count(cliSel,'product_view'),
    addToCart:count(cliSel,'add_to_cart'),
    cartRemove:count(cliSel,'cart_remove'),
    checkoutStart:count(cliSel,'checkout_start'),
    checkoutComplete:count(cliSel,'checkout_complete'),
    search:count(cliSel,'search'),
    orderCreated:count(ev.filter(function(e){return e.type==='order_created'&&inSel(e);}),'order_created'),
    paymentSubmitted:count(ev.filter(function(e){return e.type==='payment_submitted'&&inSel(e);}),'payment_submitted'),
    paymentVerified:count(ev.filter(function(e){return e.type==='payment_verified'&&inSel(e);}),'payment_verified'),
    paymentRejected:count(ev.filter(function(e){return e.type==='payment_rejected'&&inSel(e);}),'payment_rejected')
  };
  M.visitors=new Set(cliSel.map(function(e){return e.visitor_id;})).size;
  M.visitorsLast7=new Set(cliLast7.map(function(e){return e.visitor_id;})).size;
  M.orders=ord.length;
  M.paidCount=paidOrders.length;
  M.revenue=revenue;
  M.aov=M.paidCount?revenue/M.paidCount:0;
  M.conversion=M.visitors?M.orders/M.visitors*100:0;
  M.abandonedCO=abandonedCO; M.abandonedCart=abandonedCart; M.abandonedCO7=abandonedCO7;
  M.atcLast7=count(cliLast7,'add_to_cart');
  M.sessions=sessList; M.sessions7=sessions7;
  M.cliSel=cliSel; M.ordSel=ord; M.paidOrders=paidOrders; M.evSel=ev.filter(inSel);

  // per-day series (selected range, client events)
  M.byDay={};
  cliSel.forEach(function(e){
    var k=dayKey(e.created_at);
    var d=M.byDay[k]||(M.byDay[k]={visitors:new Set(),page_view:0,product_view:0,add_to_cart:0,checkout_start:0,checkout_complete:0,order_created:0});
    d.visitors.add(e.visitor_id);
    if(d[e.type]!==undefined)d[e.type]++;
  });
  ev.forEach(function(e){
    if(e.type!=='order_created'&&e.type!=='payment_verified'&&e.type!=='payment_submitted'&&e.type!=='payment_rejected')return;
    var k=dayKey(e.created_at); if(!inSel(e))return;
    var d=M.byDay[k]||(M.byDay[k]={visitors:new Set(),page_view:0,product_view:0,add_to_cart:0,checkout_start:0,checkout_complete:0,order_created:0});
    if(e.type==='order_created')d.order_created++;
  });
  // revenue per day (paid orders)
  M.revByDay={};
  paidOrders.forEach(function(o){var k=dayKey(o.order_date);M.revByDay[k]=(M.revByDay[k]||0)+(+o.total||0);});
  // visitors per day (unique)
  M.visitorsByDay={};
  cliSel.forEach(function(e){var k=dayKey(e.created_at);(M.visitorsByDay[k]=M.visitorsByDay[k]||new Set()).add(e.visitor_id);});
  Object.keys(M.visitorsByDay).forEach(function(k){M.visitorsByDay[k]=M.visitorsByDay[k].size;});
}

// ---------- chart ----------
function barChart(el, days, getVal, opts){
  opts=opts||{};
  var max=1, vals=days.map(function(d){var v=getVal(d);if(v>max)max=v;return v;});
  var peakIdx=vals.indexOf(Math.max.apply(null,vals));
  el.innerHTML=days.map(function(d,i){
    var v=vals[i], h=max>0?Math.max(3,v/max*100):3;
    var label=opts.label?opts.label(d):d.label;
    return '<div class="chart-col'+(i===peakIdx&&v>0?' peak':'')+'" data-i="'+i+'">'+
      '<span class="chart-val">'+(v||'')+'</span>'+
      '<div class="chart-bar" style="height:'+h+'%"></div>'+
      '<span class="chart-lbl">'+esc(label)+'</span></div>';
  }).join('');
  var tip=$('chartTip');
  el.onmousemove=function(ev){
    var col=ev.target.closest('.chart-col'); if(!col){tip.classList.remove('show');return;}
    var i=+col.dataset.i, d=days[i];
    tip.innerHTML='<b>'+esc(opts.tip?opts.tip(d,vals[i]):d.label)+'</b> — '+fmtN(vals[i])+' '+esc(opts.unit||'');
    tip.style.left=(ev.clientX+14)+'px'; tip.style.top=(ev.clientY-10)+'px'; tip.classList.add('show');
  };
  el.onmouseleave=function(){tip.classList.remove('show');};
}
function lastNDays(n){
  var out=[], today=dayStart(Date.now());
  for(var i=n-1;i>=0;i--){var t=today-i*DAY;out.push({t:t,key:dayKey(t),label:new Date(t).toLocaleDateString('en-US',{weekday:'short'}),full:new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'})});}
  return out;
}
// All calendar days intersecting the selected range, never past today.
function rangeDays(){
  var out=[], end=Math.min(state.selTo-1, Date.now());
  for(var t=dayStart(state.selFrom); t<=dayStart(end); t+=DAY){
    var d=new Date(t);
    out.push({t:t,key:dayKey(t),label:d.toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'})});
  }
  return out;
}

// ---------- renderers ----------
function statCard(num,lbl,sub,delta){
  return '<div class="stat-card"><div class="stat-num">'+num+'</div><div class="stat-lbl">'+esc(lbl)+'</div>'+(sub?'<div class="stat-delta flat">'+esc(sub)+'</div>':'')+'</div>';
}

function renderOverview(){
  $('ovVisitors').textContent=fmtN(M.visitorsLast7);
  $('ovVisitorsSub').textContent='unique visitors · last 7 days';
  $('ovATC').textContent=fmtN(M.atcLast7);
  $('ovAbandon').textContent=fmtN(M.abandonedCO7);
  $('ovStatGrid').innerHTML=
    statCard(fmtN(M.counts.pageViews),'Page Views')+
    statCard(fmtN(M.counts.productViews),'Product Views')+
    statCard(fmtN(M.orders),'Total Orders')+
    statCard(fmt$(M.revenue),'Total Revenue')+
    statCard(M.conversion.toFixed(1)+'%','Conversion Rate')+
    statCard(fmt$(M.aov),'Avg Order Value');

  // Order the 7-day window Saturday → Friday as specified.
  var days=lastNDays(7).sort(function(a,b){return ((new Date(a.t).getDay()+1)%7)-((new Date(b.t).getDay()+1)%7);});
  var metricFns={
    visitors:function(d){return M.visitorsByDay[d.key]||0;},
    product_views:function(d){return (M.byDay[d.key]||{}).product_view||0;},
    add_to_cart:function(d){return (M.byDay[d.key]||{}).add_to_cart||0;},
    checkout_start:function(d){return (M.byDay[d.key]||{}).checkout_start||0;},
    orders:function(d){return (M.byDay[d.key]||{}).order_created||0;}
  };
  var m=metricFns[state.metric]||metricFns.visitors;
  barChart($('weeklyChart'),days,function(d){return m(d);},{
    label:function(d){return d.label;},
    tip:function(d,v){return d.full;},
    unit:state.metric==='visitors'?'visitors':state.metric.replace(/_/g,' ')
  });
}

function renderFeed(){
  var feed=$('activityFeed');
  var list=state.events.slice(0,60);
  $('feedCount').textContent=list.length+' events';
  if(!list.length){feed.innerHTML='<div class="feed-empty">No activity recorded yet in this range.</div>';return;}
  feed.innerHTML=list.map(function(e){
    var m=EVENT_META[e.type]||{label:e.type,icon:'•',cls:'page_view'};
    var title=m.label, sub='';
    if(e.product_name) sub+=e.product_name;
    if(e.order_no) sub+=(sub?' · ':'')+'#'+e.order_no;
    if(e.value) sub+=(sub?' · ':'')+fmt$(e.value);
    if(!sub) sub=e.page&&e.page!=='/'?e.page:'/';
    var t=new Date(e.created_at).getTime();
    return '<div class="feed-item"><div class="feed-badge b-'+m.cls+'">'+m.icon+'</div>'+
      '<div class="feed-main"><div class="feed-title">'+esc(title)+'</div><div class="feed-sub">'+esc(sub)+'</div></div>'+
      '<div class="feed-time"><span class="d">'+timeAgo(t)+'</span><span>'+fmtDateTime(t)+'</span></div></div>';
  }).join('');
}

function breakdownHTML(map, colorCls){
  var entries=Object.keys(map).map(function(k){return [k,map[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  if(!entries.length)return '<div class="feed-empty">No data</div>';
  var max=entries[0][1]||1;
  return '<div class="breakdown">'+entries.map(function(en){
    return '<div class="bd-row"><span class="bd-name" title="'+esc(en[0])+'">'+esc(en[0])+'</span>'+
      '<div class="bd-track"><div class="bd-fill '+(colorCls||'')+'" style="width:'+Math.max(2,en[1]/max*100)+'%"></div></div>'+
      '<span class="bd-val">'+fmtN(en[1])+'</span></div>';
  }).join('')+'</div>';
}

function renderSales(){
  var rev=M.revenue, orders=M.orders, aov=M.aov;
  var prevRev=0; // placeholder for delta (single range)
  $('salesStatGrid').innerHTML=
    statCard(fmt$(rev),'Total Revenue')+
    statCard(fmtN(orders),'Successful Orders')+
    statCard(fmt$(aov),'Avg Order Value')+
    statCard(fmt$(rev/Math.max(1,Math.ceil((state.selTo-state.selFrom)/DAY))),'Revenue / Day')+
    statCard(fmtN(M.counts.paymentSubmitted),'Payments Submitted')+
    statCard(fmtN(M.counts.paymentVerified),'Payments Verified');
  // daily revenue
  var days=rangeDays();
  if(days.length>60)days=days.filter(function(_,i){return i%Math.ceil(days.length/60)===0;});
  barChart($('salesChart'),days,function(d){return M.revByDay[d.key]||0;},{label:function(d){return d.label;},tip:function(d){return d.label;},unit:'revenue'});
  // weekly revenue
  var weeks={},wkLabels=[];
  days.forEach(function(d){
    var dt=new Date(d.t), wk=new Date(dt); wk.setDate(dt.getDate()-((dt.getDay()+1)%7)); // Monday start
    var k=dayKey(wk.getTime());
    if(!weeks[k]){weeks[k]={rev:0,label:wk.toLocaleDateString('en-US',{month:'short',day:'numeric'})};wkLabels.push(k);}
    weeks[k].rev+=M.revByDay[d.key]||0;
  });
  var wdays=wkLabels.map(function(k){return {key:k,label:weeks[k].label,rev:weeks[k].rev};});
  barChart($('salesWeekChart'),wdays,function(d){return d.rev;},{label:function(d){return d.label;},tip:function(d){return 'Week of '+d.label;},unit:'revenue'});
}

function renderVisitors(){
  // new vs returning via visitors table first_seen
  var firstSeen={}; state.visitors.forEach(function(v){firstSeen[v.visitor_id]=new Date(v.first_seen).getTime();});
  var activeIds=new Set(M.cliSel.map(function(e){return e.visitor_id;}));
  var neu=0,ret=0;
  activeIds.forEach(function(id){ (firstSeen[id]&&firstSeen[id]<state.selFrom)?ret++:neu++; });
  var devices={},sources={};
  M.cliSel.forEach(function(e){devices[e.device]=(devices[e.device]||0)+1;sources[e.source||'direct']=(sources[e.source||'direct']||0)+1;});
  // unique visitors per source/device: count distinct visitors
  var vsrc={},vdev={};
  M.cliSel.forEach(function(e){
    (vsrc[e.source||'direct']=vsrc[e.source||'direct']||new Set()).add(e.visitor_id);
    (vdev[e.device]=vdev[e.device]||new Set()).add(e.visitor_id);
  });
  var srcMap={},devMap={};
  Object.keys(vsrc).forEach(function(k){srcMap[k]=vsrc[k].size;});
  Object.keys(vdev).forEach(function(k){devMap[k]=vdev[k].size;});

  $('visStatGrid').innerHTML=
    statCard(fmtN(activeIds.size),'Unique Visitors')+
    statCard(fmtN(neu),'New Visitors')+
    statCard(fmtN(ret),'Returning Visitors')+
    statCard(M.conversion.toFixed(1)+'%','Visit → Order Rate')+
    statCard(fmtN(M.counts.pageViews),'Page Views')+
    statCard((M.counts.pageViews/Math.max(1,activeIds.size)).toFixed(1),'Pages / Visitor');

  var tot=neu+ret||1;
  $('visSplit').innerHTML=
    '<div class="split-bar">'+
      '<div class="split-seg" style="width:'+(neu/tot*100)+'%;background:var(--blue)">'+neu+'</div>'+
      '<div class="split-seg" style="width:'+(ret/tot*100)+'%;background:var(--green)">'+ret+'</div>'+
    '</div>'+
    '<div class="split-legend"><span><i style="background:var(--blue)"></i>New visitors</span><span><i style="background:var(--green)"></i>Returning visitors</span></div>';
  $('visDevices').innerHTML=breakdownHTML(devMap,'green');
  var days=rangeDays();
  if(days.length>60)days=days.filter(function(_,i){return i%Math.ceil(days.length/60)===0;});
  barChart($('visChart'),days,function(d){return M.visitorsByDay[d.key]||0;},{label:function(d){return d.label;},tip:function(d){return d.label;},unit:'visitors'});
}

function renderProducts(){
  var views={},atc={},sold={},ordersWith={};
  M.cliSel.forEach(function(e){
    if(e.type==='product_view'||e.type==='add_to_cart'){
      var name=e.product_name||('Product #'+(e.product_id||'?'));
      if(e.type==='product_view')views[name]=(views[name]||0)+1;
      else atc[name]=(atc[name]||0)+1;
    }
  });
  M.ordSel.forEach(function(o){
    (o.items||[]).forEach(function(it){
      var n=it.name||'Unknown';
      sold[n]=(sold[n]||0)+(+it.qty||1);
      ordersWith[n]=(ordersWith[n]||new Set()).add(o.order_no);
    });
  });
  function topList(map,unit){
    var arr=Object.keys(map).map(function(k){return{k:k,v:map[k]};}).sort(function(a,b){return b.v-a.v;}).slice(0,8);
    if(!arr.length)return '<div class="feed-empty">No data</div>';
    return '<div class="rank-list">'+arr.map(function(x,i){
      return '<div class="rank-item"><span class="rank-num">'+(i+1)+'</span><span class="rank-name">'+esc(x.k)+'</span><span class="rank-val">'+fmtN(x.v)+' '+unit+'</span></div>';
    }).join('')+'</div>';
  }
  $('prodViewed').innerHTML=topList(views,'views');
  $('prodATC').innerHTML=topList(atc,'adds');
  $('prodSold').innerHTML=topList(sold,'units');
  // conversion: orders containing product / product views
  var conv=Object.keys(views).map(function(name){
    var v=views[name]||1, oc=(ordersWith[name]||new Set()).size;
    return {name:name,c:pct(oc,v)};
  }).filter(function(x){return x.c>0;}).sort(function(a,b){return b.c-a.c;}).slice(0,8);
  $('prodConv').innerHTML=conv.length?
    '<div class="rank-list">'+conv.map(function(x,i){
      return '<div class="rank-item"><span class="rank-num">'+(i+1)+'</span><span class="rank-name">'+esc(x.name)+'</span><span class="rank-val">'+x.c+'%</span></div>';
    }).join('')+'</div>':'<div class="feed-empty">No conversions yet</div>';
}

function renderCart(){
  var adds=M.counts.addToCart, removes=M.counts.cartRemove;
  var sessionsWithATC=M.sessions.filter(function(s){return s.atc;}).length;
  var abandonRate=pct(M.abandonedCart,sessionsWithATC);
  var checkoutRate=pct(M.counts.checkoutStart,Math.max(1,adds));
  $('cartStatGrid').innerHTML=
    statCard(fmtN(adds),'Add to Cart Events')+
    statCard(fmtN(removes),'Cart Removals')+
    statCard(fmtN(sessionsWithATC),'Sessions with Cart')+
    statCard(fmtN(M.abandonedCart),'Abandoned Carts')+
    statCard(abandonRate+'%','Cart Abandonment')+
    statCard(checkoutRate+'%','Cart → Checkout');
  var max=Math.max(1,adds);
  var atcMap={}; M.cliSel.forEach(function(e){if(e.type==='add_to_cart'){var n=e.product_name||('Product #'+(e.product_id||'?'));atcMap[n]=(atcMap[n]||0)+1;}});
  var arr=Object.keys(atcMap).map(function(k){return{k:k,v:atcMap[k]};}).sort(function(a,b){return b.v-a.v;}).slice(0,8);
  $('cartProducts').innerHTML=arr.length?'<div class="rank-list">'+arr.map(function(x,i){
    return '<div class="rank-item"><span class="rank-num">'+(i+1)+'</span><span class="rank-name">'+esc(x.k)+'</span><span class="rank-val">'+fmtN(x.v)+'</span></div>';
  }).join('')+'</div>':'<div class="feed-empty">No cart activity</div>';
  // funnel
  var steps=[
    ['Added to cart',adds,'var(--orange)'],
    ['Started checkout',M.counts.checkoutStart,'var(--red)'],
    ['Completed order',M.orders,'var(--green)']
  ];
  var top=Math.max(1,steps[0][1]);
  $('cartFunnel').innerHTML='<div class="funnel">'+steps.map(function(s){
    return '<div class="funnel-step"><span>'+s[0]+'</span><div class="bd-track" style="height:26px"><div class="bd-fill" style="width:'+Math.max(2,s[1]/top*100)+'%;background:'+s[2]+'"></div></div><span class="funnel-pct">'+pct(s[1],adds)+'%</span></div>';
  }).join('')+'</div>';
}

function renderCheckout(){
  var co=M.counts.checkoutStart, cc=M.counts.checkoutComplete, ps=M.counts.paymentSubmitted, pv=M.counts.paymentVerified;
  var abandonRate=pct(M.abandonedCO,M.sessions.filter(function(s){return s.co;}).length||co);
  $('coStatGrid').innerHTML=
    statCard(fmtN(co),'Checkout Started')+
    statCard(fmtN(cc),'Checkout Completed')+
    statCard(fmtN(ps),'Payments Submitted')+
    statCard(fmtN(pv),'Payments Verified')+
    statCard(abandonRate+'%','Checkout Abandonment')+
    statCard(pct(pv,co)+'%','Verify Rate');
  var steps=[
    ['Checkout started',co,'#3b82f6'],
    ['Order completed',M.orders,'#60a5fa'],
    ['Payment submitted',ps,'#facc15'],
    ['Payment verified',pv,'#22c55e']
  ];
  var top=Math.max(1,co);
  $('coFunnel').innerHTML='<div class="funnel">'+steps.map(function(s){
    return '<div class="funnel-step"><span>'+s[0]+'</span><div class="bd-track" style="height:26px"><div class="bd-fill" style="width:'+Math.max(2,s[1]/top*100)+'%;background:'+s[2]+'"></div></div><span class="funnel-pct">'+pct(s[1],co)+'%</span></div>';
  }).join('')+'</div>';
}

function payPill(ps){
  var map={'Paid':'pill-green','Awaiting Payment':'pill-gray','Payment Instructions Sent':'pill-blue','Evidence Submitted':'pill-yellow','Pending Verification':'pill-yellow','Rejected':'pill-red','Cancelled':'pill-gray','Refunded':'pill-purple'};
  return '<span class="pill '+(map[ps]||'pill-gray')+'">'+esc(ps||'—')+'</span>';
}
function statusPill(st){
  var map={'Delivered':'pill-green','Shipped':'pill-blue','Processing':'pill-yellow','Order Received':'pill-gray','Payment Confirmed':'pill-blue','Out for Delivery':'pill-purple','Cancelled':'pill-red'};
  return '<span class="pill '+(map[st]||'pill-gray')+'">'+esc(st||'—')+'</span>';
}

function renderOrders(){
  var list=M.ordSel.slice().sort(function(a,b){return new Date(b.order_date)-new Date(a.order_date);}).slice(0,200);
  $('ordersCount').textContent=list.length+' orders';
  $('ordersTable').querySelector('tbody').innerHTML=list.length?list.map(function(o){
    var items=(o.items||[]).map(function(i){return (i.qty||1)+'× '+(i.name||'');}).join(', ');
    return '<tr><td><b>'+esc(o.order_no)+'</b></td><td>'+fmtDateTime(new Date(o.order_date).getTime())+'</td>'+
      '<td>'+esc(o.name||'')+'<br><span class="muted" style="font-size:11px">'+esc(o.email||'')+'</span></td>'+
      '<td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(items)+'">'+esc(items)+'</td>'+
      '<td>'+fmt$(o.total)+'</td><td>'+payPill(o.payment_status)+'</td><td>'+statusPill(o.status)+'</td></tr>';
  }).join(''):'<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No orders in this range</td></tr>';
}

function renderTraffic(){
  var src={},ref={},utm={},pages={},vsrc={};
  M.cliSel.forEach(function(e){
    var s=e.source||'direct'; src[s]=(src[s]||0)+1;
    if(e.referrer){ref[e.referrer]=(ref[e.referrer]||0)+1;}
    if(e.utm&&e.utm.utm_source){var u=e.utm.utm_source+'/'+(e.utm.utm_campaign||'');utm[u]=(utm[u]||0)+1;}
    pages[e.page||'/']=(pages[e.page||'/']||0)+1;
    (vsrc[s]=vsrc[s]||new Set()).add(e.visitor_id);
  });
  var srcVisitors={};Object.keys(vsrc).forEach(function(k){srcVisitors[k]=vsrc[k].size;});
  $('srcBreakdown').innerHTML=breakdownHTML(srcVisitors,'cyan');
  $('refBreakdown').innerHTML=breakdownHTML(ref,'');
  $('utmBreakdown').innerHTML=breakdownHTML(utm,'gold');
  $('pageBreakdown').innerHTML=breakdownHTML(pages,'');
}

function renderSettings(){
  $('abandonMins').value=state.abandonMins;
  $('autoRefresh').checked=state.autoRefresh;
}

function renderAll(){
  renderOverview(); renderFeed(); renderSales(); renderVisitors();
  renderProducts(); renderCart(); renderCheckout(); renderOrders(); renderTraffic();
}

// ---------- realtime ----------
function setupRealtime(){
  var sb=(typeof getSb==='function')?getSb():null;
  if(!sb||!sb.realtime){ setLive(false,'Realtime unavailable'); return; }
  // Ensure Realtime uses the admin JWT so RLS allows the subscription.
  sbSession().then(function(s){ if(s&&s.access_token&&sb.realtime.setAuth) sb.realtime.setAuth(s.access_token); });
  if(state.channel) return;
  try{
    state.channel=sb.channel('analytics-feed')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'analytics_events'},function(payload){
        var e=payload.new;
        if(!e)return;
        state.events.unshift(e);
        // insert into feed DOM immediately (top of list)
        var feed=$('activityFeed');
        if(feed&&state.events.length<=200){
          var m=EVENT_META[e.type]||{label:e.type,icon:'•',cls:'page_view'};
          var t=new Date(e.created_at).getTime();
          var sub=e.product_name||e.order_no?((e.product_name||'')+(e.order_no?' · #'+e.order_no:'')):(e.page||'/');
          var html='<div class="feed-item"><div class="feed-badge b-'+m.cls+'">'+m.icon+'</div>'+
            '<div class="feed-main"><div class="feed-title">'+esc(m.label)+'</div><div class="feed-sub">'+esc(sub)+'</div></div>'+
            '<div class="feed-time"><span class="d">just now</span><span>'+fmtDateTime(t)+'</span></div></div>';
          var empty=feed.querySelector('.feed-empty'); if(empty)empty.remove();
          feed.insertAdjacentHTML('afterbegin',html);
          while(feed.children.length>60)feed.lastElementChild.remove();
        }
        // throttled metric refresh
        if(state.autoRefresh){ clearTimeout(state._rt); state._rt=setTimeout(function(){fetchData(true);},4000); }
      })
      .subscribe(function(status){ setLive(status==='SUBSCRIBED', status==='SUBSCRIBED'?'Live':'Reconnecting…'); });
  }catch(e){ console.warn('realtime failed',e); setLive(false,'Realtime error'); }
}
function setLive(on,text){
  var p=$('livePill'); if(!p)return;
  p.classList.toggle('off',!on);
  $('livePillText').textContent=text||'';
}

// ---------- auth / routing ----------
function showLogin(msg){
  $('loginScreen').classList.remove('hidden');
  $('appShell').classList.add('hidden');
  if(msg){$('loginErr').textContent=msg;$('loginErr').classList.remove('hidden');}
  if(typeof sbAdminSignOut==='function')sbAdminSignOut();
}
function enterApp(){
  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
  sbSession().then(function(s){var u=s&&s.user;if(u&&u.email)$('acctEmail').textContent='Signed in as '+u.email;});
  computeRange(); fetchData(true); setupRealtime(); startAutoRefresh();
  route();
}
function logout(){
  if(typeof sbAdminSignOut==='function')sbAdminSignOut();
  sessionStorage.removeItem('vr_admin');
  location.reload();
}

var PAGES={overview:'Overview','live':'Live Activity',sales:'Sales Analytics',visitors:'Visitors',products:'Products',cart:'Cart Analytics',checkout:'Checkout Analytics',orders:'Orders',traffic:'Traffic Sources',settings:'Settings'};
function route(){
  var h=(location.hash||'#/overview').replace('#/','');
  if(!PAGES[h])h='overview';
  document.querySelectorAll('.page').forEach(function(p){p.classList.toggle('active',p.id==='page-'+h);});
  document.querySelectorAll('[data-nav]').forEach(function(a){a.classList.toggle('active',a.dataset.nav===h);});
  $('pageTitle').textContent=PAGES[h];
  $('sidebar').classList.remove('open');
  if(h==='settings')renderSettings();
}
window.addEventListener('hashchange',route);

function startAutoRefresh(){
  clearInterval(state.refreshTimer);
  if(state.autoRefresh)state.refreshTimer=setInterval(function(){fetchData(true);},60000);
}

// ---------- events ----------
$('loginForm').addEventListener('submit',async function(e){
  e.preventDefault();
  var btn=$('loginBtn'); btn.disabled=true; btn.textContent='Signing in…';
  $('loginErr').classList.add('hidden');
  try{
    var email=$('loginEmail').value.trim(), pass=$('loginPass').value;
    if(typeof sbAdminSignIn==='function'){
      var r=await sbAdminSignIn(email,pass);
      if(!r.error&&r.data&&r.data.session){ enterApp(); return; }
      $('loginErr').textContent=(r.error&&r.error.message)||'Login failed';
    } else {
      $('loginErr').textContent='Backend not configured.';
    }
  }catch(err){ $('loginErr').textContent=String(err.message||err); }
  $('loginErr').classList.remove('hidden');
  btn.disabled=false; btn.textContent='Sign In';
});

$('logoutBtn').addEventListener('click',logout);
$('logoutBtn2').addEventListener('click',logout);
$('burger').addEventListener('click',function(){$('sidebar').classList.toggle('open');});

$('rangeSelect').addEventListener('change',function(){
  $('customRange').classList.toggle('hidden',$('rangeSelect').value!=='custom');
  if($('rangeSelect').value!=='custom'){computeRange();fetchData(true);}
});
$('applyRange').addEventListener('click',function(){computeRange();fetchData(true);});

$('chartMetrics').addEventListener('click',function(e){
  var b=e.target.closest('button[data-m]'); if(!b)return;
  state.metric=b.dataset.m;
  this.querySelectorAll('button').forEach(function(x){x.classList.toggle('active',x===b);});
  renderOverview();
});

$('saveSettings').addEventListener('click',function(){
  state.abandonMins=Math.max(5,Math.min(720,+$('abandonMins').value||30));
  state.autoRefresh=$('autoRefresh').checked;
  localStorage.setItem('vr_an_abandon',state.abandonMins);
  localStorage.setItem('vr_an_refresh',state.autoRefresh?'yes':'no');
  startAutoRefresh();
  fetchData(true);
  toast('Settings saved');
});

// ---------- init ----------
(async function init(){
  if(typeof getSb!=='function'||!getSb()){ showLogin('Analytics backend is not configured.'); return; }
  var session=await sbAdminSession();
  if(session){
    var u=session.user; if(u&&u.email)$('acctEmail').textContent='Signed in as '+u.email;
    enterApp();
  } else {
    showLogin('');
  }
})();
})();
