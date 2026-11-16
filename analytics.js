// ---------- Analytics: GA4 + Meta Pixel (consent-gated) ----------
// Replace the placeholder IDs below with your real IDs, then the tags activate.
const GA4_ID = 'G-XXXXXXXXXX';      // TODO: paste your GA4 Measurement ID
const META_PIXEL_ID = 'XXXXXXXXXXXXXXX'; // TODO: paste your Meta Pixel ID

window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

let analyticsOn = localStorage.getItem('vr_analytics_consent') === 'yes';

function loadAnalytics(){
  if(analyticsOn) return;
  analyticsOn = true;
  localStorage.setItem('vr_analytics_consent','yes');
  // GA4
  if(GA4_ID && !GA4_ID.startsWith('G-XXX')){
    const s=document.createElement('script');s.async=true;
    s.src='https://www.googletagmanager.com/gtag/js?id='+GA4_ID;document.head.appendChild(s);
    gtag('js',new Date());gtag('config',GA4_ID);
  }
  // Meta Pixel
  if(META_PIXEL_ID && !META_PIXEL_ID.startsWith('XXX')){
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init',META_PIXEL_ID);fbq('track','PageView');
  }
}

// Consent banner
(function(){
  if(localStorage.getItem('vr_analytics_consent')) return;
  const bar=document.createElement('div');
  bar.className='cookie-bar';
  bar.innerHTML=`<span class="cookie-text">We use analytics cookies to improve your experience.</span>
    <span class="cookie-actions">
      <button id="ckYes" class="cookie-btn cookie-yes">Accept</button>
      <button id="ckNo" class="cookie-btn cookie-no">Decline</button>
    </span>`;
  document.body.appendChild(bar);
  bar.querySelector('#ckYes').onclick=()=>{loadAnalytics();bar.remove();};
  bar.querySelector('#ckNo').onclick=()=>{localStorage.setItem('vr_analytics_consent','no');bar.remove();};
})();

// Auto-load if consent already given
if(analyticsOn) loadAnalytics();

// Unified event helper — safe no-op until analytics loads
window.trackEvent = function(event, params){
  if(!analyticsOn) return;
  const map={ViewContent:'view_item',AddToCart:'add_to_cart',InitiateCheckout:'begin_checkout',Purchase:'purchase',Search:'search'};
  const ga=map[event]||event.toLowerCase();
  if(window.gtag) gtag('event',ga,params||{});
  if(window.fbq){
    const fb={view_item:'ViewContent',add_to_cart:'AddToCart',begin_checkout:'InitiateCheckout',purchase:'Purchase',search:'Search'}[ga]||'CustomEvent';
    fbq('track',fb,params||{});
  }
};
