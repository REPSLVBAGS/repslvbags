// ---------- Customer invoice page ----------
// Reads ?token= from URL, fetches invoice, renders branded view.
(function(){
  const params=new URLSearchParams(location.search);
  const token=params.get('token');
  const loading=document.getElementById('invLoading');
  const error=document.getElementById('invError');
  const content=document.getElementById('invContent');

  function money(n){return '$'+Number(n||0).toFixed(2);}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  async function init(){
    if(!token){showError();return;}
    const inv=await fetchInvoiceByToken(token);
    if(!inv){showError();return;}
    render(inv);
  }
  function showError(){
    loading.classList.add('hidden');
    error.classList.remove('hidden');
  }
  function render(inv){
    loading.classList.add('hidden');
    content.classList.remove('hidden');

    // Status badge
    const badge=document.getElementById('invStatusBadge');
    badge.innerHTML=`<span class="inv-status ${inv.payment_status}">${inv.payment_status}</span>`;

    // Meta
    const addr=inv.shipping_address||{};
    document.getElementById('invMeta').innerHTML=`
      <div><span>Invoice No</span><b>${esc(inv.invoice_no)}</b></div>
      <div><span>Order No</span><b>${esc(inv.order_no)}</b></div>
      <div><span>Date</span><b>${new Date(inv.created_at).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</b></div>
      <div><span>Bill To</span><b>${esc(inv.customer_name)}<br>${esc(inv.customer_email)}${inv.customer_phone?' · '+esc(inv.customer_phone):''}</b></div>`;

    // Items
    const items=inv.items||[];
    document.getElementById('invItems').innerHTML=items.map(i=>`
      <tr>
        <td>${esc(i.name)}${i.color?' <span style="color:#8a8177;font-size:12px">('+esc(i.color)+')</span>':''}</td>
        <td style="text-align:center">${i.qty}</td>
        <td style="text-align:right">${money(i.price)}</td>
        <td style="text-align:right">${money(i.price*i.qty)}</td>
      </tr>`).join('');

    // Totals
    const sub=Number(inv.subtotal)||0, ship=Number(inv.shipping)||0, disc=Number(inv.discount)||0, total=Number(inv.total)||0;
    document.getElementById('invTotals').innerHTML=`
      <div class="row"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="row"><span>Shipping</span><span>${ship===0?'FREE':money(ship)}</span></div>
      ${disc>0?`<div class="row"><span>Discount${inv.discount_code?' ('+esc(inv.discount_code)+')':''}</span><span>−${money(disc)}</span></div>`:''}
      <div class="row grand"><span>Total ${inv.payment_status==='PAID'?'Paid':'Due'}</span><span>${money(total)}</span></div>`;

    // Address
    document.getElementById('invAddress').innerHTML=`${esc(addr.address||'')}<br>${esc(addr.city||'')}, ${esc(addr.state||'')} ${esc(addr.zip||'')}`;

    // Payment
    document.getElementById('invPayMethod').innerHTML=`<b>${esc(inv.payment_method_label||inv.payment_method)}</b> — ${money(total)}`;
    const payBox=document.getElementById('invPayDetails');
    if(inv.payment_status==='PAID'){
      payBox.innerHTML='Payment verified. Thank you!';
      payBox.style.borderLeftColor='#2e7d32';
    } else if(inv.payment_details){
      payBox.textContent=inv.payment_details;
    } else {
      payBox.textContent='Payment instructions were sent to you via SMS. Contact supportrepslvbags@gmail.com if you need assistance.';
    }

    // Print button
    document.getElementById('invPrintBtn').onclick=()=>window.print();

    // Payment confirm link carries order+email
    const link=document.getElementById('invPayConfirmLink');
    if(link&&inv.order_no&&inv.customer_email){
      link.href='payment-confirm.html?order='+encodeURIComponent(inv.order_no)+'&email='+encodeURIComponent(inv.customer_email);
    }

    document.title='Invoice '+inv.invoice_no+' — Reps LV Bags';
  }
  init();
})();
