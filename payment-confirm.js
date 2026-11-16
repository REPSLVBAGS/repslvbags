// ---------- Payment confirmation page ----------
const params=new URLSearchParams(location.search);
let currentOrder=null, evidenceDataURL=null;
const MAX_SIZE=5*1024*1024; // 5MB
const ALLOWED=['image/jpeg','image/png','image/webp'];

// Simple rate limit: one submission per order per 30 seconds
function rateLimited(no){
  const key='vr_submit_'+no, last=+localStorage.getItem(key)||0;
  if(Date.now()-last<30000) return true;
  localStorage.setItem(key,Date.now()); return false;
}

function showOrder(order){
  currentOrder=order;
  document.getElementById('lookupBox').classList.add('hidden');
  document.getElementById('payFormWrap').classList.remove('hidden');
  document.getElementById('orderSummary').innerHTML=`
    <p><b>Order:</b> ${order.orderNo}</p>
    <p><b>Name:</b> ${order.name}</p>
    <p><b>Email:</b> ${order.email}</p>
    <p><b>Payment Method:</b> ${order.paymentMethod||'—'}</p>
    <p><b>Amount Expected:</b> <b>$${order.total.toFixed(2)}</b></p>
    <p><b>Payment Status:</b> ${order.paymentStatus||'Awaiting Payment'}</p>
    ${order.items.map(i=>`<p style="font-size:13px;color:var(--muted)">${i.qty}× ${i.name}</p>`).join('')}`;
  if(['Paid','Evidence Submitted','Pending Verification'].includes(order.paymentStatus)){
    document.getElementById('evidenceForm').innerHTML=`<p style="font-size:14px;color:var(--muted)">This order's payment is currently <b>${order.paymentStatus}</b>. No further action is needed unless our team contacts you.</p>`;
  }
}

function loadFromParams(){
  const no=params.get('order'), email=params.get('email');
  if(no&&email){
    const o=findOrder(no,email);
    if(o){showOrder(o);return;}
  }
  document.getElementById('lookupBox').style.display='block';
}

document.getElementById('lkBtn').onclick=()=>{
  const no=document.getElementById('lkOrder').value, email=document.getElementById('lkEmail').value;
  const err=document.getElementById('lkErr');err.classList.add('hidden');
  const o=findOrder(no,email);
  if(o) showOrder(o);
  else{err.textContent='Order not found. Check your order number and email.';err.classList.remove('hidden');}
};

// Compress image to a small JPEG dataURL so it fits localStorage (~300KB max).
function compressImage(dataURL,maxW=1600,quality=0.82){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1,maxW/img.width);
      const c=document.createElement('canvas');
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      resolve(c.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>resolve(dataURL); // fallback: original
    img.src=dataURL;
  });
}

// File validation: type + size + readable image
document.getElementById('evFile').onchange=async e=>{
  const f=e.target.files[0];
  evidenceDataURL=null;
  document.getElementById('evPreview').innerHTML='';
  if(!f)return;
  if(!ALLOWED.includes(f.type)){alert('Please upload a JPG, PNG or WebP image.');e.target.value='';return;}
  if(f.size>MAX_SIZE){alert('File too large — maximum 5MB.');e.target.value='';return;}
  const r=new FileReader();
  r.onload=async ev=>{
    evidenceDataURL=await compressImage(ev.target.result);
    document.getElementById('evPreview').innerHTML=`<img src="${evidenceDataURL}" style="max-width:220px;border:1px solid #d8cfc0">`;
    document.getElementById('evFileName').textContent='✓ '+f.name+' ('+(f.size/1024).toFixed(0)+' KB)';
  };
  r.readAsDataURL(f);
};

document.getElementById('evidenceForm').onsubmit=async e=>{
  e.preventDefault();
  if(!currentOrder)return;
  if(!evidenceDataURL){alert('Please upload your payment screenshot first.');return;}
  if(rateLimited(currentOrder.orderNo)){alert('Please wait 30 seconds before submitting again.');return;}

  const btn=document.getElementById('evSubmit');btn.disabled=true;btn.textContent='Submitting…';

  // Upload screenshot to private Supabase storage when configured
  let evidencePath='';
  if(typeof sbUploadEvidence==='function'){
    evidencePath=await sbUploadEvidence(currentOrder.orderNo,evidenceDataURL)||'';
  }

  const res=submitPaymentEvidence(currentOrder.orderNo,currentOrder.email,{
    transactionRef:document.getElementById('evTxn').value.trim(),
    evidence:evidenceDataURL,
    evidencePath,
    notes:document.getElementById('evNotes').value.trim()
  });

  if(res.ok){
    notifyEvidenceToBusiness(res.order);
    document.getElementById('payFormWrap').classList.add('hidden');
    document.getElementById('payDone').classList.remove('hidden');
  } else {
    alert(res.error);
    btn.disabled=false;btn.textContent='Submit Payment Confirmation';
  }
};

loadFromParams();
