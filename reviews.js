// ---------- Reviews System ----------
// Handles review display, submission, and admin moderation.

const REVIEWS_API = 'https://wetxlhacaeakstqwqtdh.supabase.co/functions/v1/reviews';
const REVIEW_API_SECRET = 'vr7f2k9xQm4Lp8Rw3Ty6';

// ---------- State ----------
let reviewsCache = null;
let currentProductId = null;

// ---------- API Helpers ----------
async function fetchReviews(status = 'approved', productId = null) {
  try {
    const url = new URL(REVIEWS_API);
    url.searchParams.set('status', status);
    if (productId) url.searchParams.set('product_id', productId);
    
    const headers = { 'Content-Type': 'application/json' };
    // For admin requests, include secret
    if (status !== 'approved') headers['x-email-secret'] = REVIEW_API_SECRET;
    
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.reviews || [];
  } catch (e) {
    console.error('Failed to fetch reviews:', e);
    return [];
  }
}

async function submitReview(reviewData) {
  try {
    const res = await fetch(REVIEWS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData)
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.error('Failed to submit review:', e);
    throw e;
  }
}

async function moderateReview(id, updates) {
  try {
    const res = await fetch(REVIEWS_API, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'x-email-secret': REVIEW_API_SECRET
      },
      body: JSON.stringify({ id, ...updates })
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.error('Failed to moderate review:', e);
    throw e;
  }
}

async function deleteReview(id) {
  try {
    const res = await fetch(`${REVIEWS_API}?id=${id}`, {
      method: 'DELETE',
      headers: { 'x-email-secret': REVIEW_API_SECRET }
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (e) {
    console.error('Failed to delete review:', e);
    throw e;
  }
}

// ---------- Rendering ----------
function renderStars(rating) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= rating;
    const icon = window.I ? (filled ? window.I.starFill() : window.I.star()) : '★';
    stars.push(`<span class="star ${filled ? 'filled' : ''}">${icon}</span>`);
  }
  return stars.join('');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderReviewCard(review) {
  const verifiedBadge = review.verified_purchase ? '<span class="verified-badge">✓ Verified Purchase</span>' : '';
  const featuredBadge = review.featured ? '<span class="featured-badge">Featured</span>' : '';
  const adminReply = review.admin_reply ? `<div class="admin-reply"><strong>Reps LV Bags:</strong> ${esc(review.admin_reply)}</div>` : '';
  const photo = review.photo_url ? `<img src="${esc(review.photo_url)}" alt="Review photo" class="review-photo" loading="lazy">` : '';

  return `
    <div class="review-card">
      <div class="review-header">
        <div class="review-meta">
          <span class="review-name">${esc(review.name)}</span>
          ${verifiedBadge}${featuredBadge}
          <span class="review-date">${formatDate(review.created_at)}</span>
        </div>
        <div class="review-rating">${renderStars(review.rating)}</div>
      </div>
      ${review.title ? `<h4 class="review-title">${esc(review.title)}</h4>` : ''}
      <p class="review-body">${esc(review.body)}</p>
      ${photo}
      ${adminReply}
    </div>
  `;
}

function renderReviewsSection(reviews, productId = null, limit = 0) {
  const container = document.getElementById('reviewsContainer');
  if (!container) return;

  if (!reviews || reviews.length === 0) {
    container.innerHTML = '<p class="no-reviews">No reviews yet. Be the first to share your experience!</p>';
    return;
  }

  // Stats always reflect ALL reviews; `limit` only caps the cards shown.
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const ratingDist = [5,4,3,2,1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length
  }));
  const visible = limit ? reviews.slice(0, limit) : reviews;

  container.innerHTML = `
    <div class="reviews-summary">
      <div class="avg-rating">
        <span class="avg-number">${avgRating.toFixed(1)}</span>
        <div class="avg-stars">${renderStars(Math.round(avgRating))}</div>
        <span class="review-count">${reviews.length} review${reviews.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="rating-dist">
        ${ratingDist.map(d => `
          <div class="dist-row">
            <span class="dist-star">${d.star} ${window.I ? window.I.star() : '★'}</span>
            <div class="dist-bar"><div class="dist-fill" style="width:${(d.count/reviews.length)*100}%"></div></div>
            <span class="dist-count">${d.count}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="reviews-list">
      ${visible.map(renderReviewCard).join('')}
    </div>
    <div class="reviews-actions">
      ${limit && reviews.length > limit ? `<a class="btn-ghost" href="reviews.html">Read All ${reviews.length} Reviews</a>` : ''}
      <button class="btn-ghost write-review-btn" onclick="openReviewForm(${productId || 'null'})">Write a Review</button>
    </div>
  `;
}

// ---------- Review Form ----------
function openReviewForm(productId = null) {
  const modal = document.getElementById('reviewModal');
  const form = document.getElementById('reviewForm');
  
  if (!modal || !form) return;
  
  // Reset form
  form.reset();
  document.getElementById('reviewRating').value = 5;
  updateStarDisplay(5);
  
  // Set product info
  if (productId) {
    const product = PRODUCTS.find(p => p.id === productId);
    if (product) {
      document.getElementById('reviewProductName').value = product.name;
      document.getElementById('reviewProductId').value = productId;
    }
  } else {
    document.getElementById('reviewProductName').value = '';
    document.getElementById('reviewProductId').value = '';
  }
  
  modal.classList.remove('hidden');
}

function closeReviewForm() {
  const modal = document.getElementById('reviewModal');
  if (modal) modal.classList.add('hidden');
}

function updateStarDisplay(rating) {
  const stars = document.querySelectorAll('#starRating .star');
  stars.forEach((star, i) => {
    star.classList.toggle('active', i < rating);
    star.onclick = () => {
      document.getElementById('reviewRating').value = i + 1;
      updateStarDisplay(i + 1);
    };
  });
}

async function handleReviewSubmit(e) {
  e.preventDefault();
  
  const form = e.target;
  const name = document.getElementById('reviewName').value.trim();
  const email = document.getElementById('reviewEmail').value.trim();
  const rating = parseInt(document.getElementById('reviewRating').value);
  const title = document.getElementById('reviewTitle').value.trim();
  const body = document.getElementById('reviewBody').value.trim();
  const productId = document.getElementById('reviewProductId').value;
  const productName = document.getElementById('reviewProductName').value;
  const photoFile = document.getElementById('reviewPhoto').files[0];
  const honeypot = document.getElementById('reviewWebsite');

  // Honeypot: silently succeed for bots without submitting.
  if (honeypot && honeypot.value) {
    alert('Thank you for your review! It will be published after moderation.');
    closeReviewForm();
    return;
  }

  // Validation
  if (!name || !body || !rating) {
    alert('Please fill in all required fields.');
    return;
  }

  if (body.length < 10) {
    alert('Review must be at least 10 characters.');
    return;
  }

  if (photoFile && photoFile.size > 5 * 1024 * 1024) {
    alert('Photo must be under 5MB.');
    return;
  }

  // Upload photo to Supabase Storage (public bucket); fall back to a small
  // data URL only if storage is unavailable and the file is tiny.
  let photoUrl = '';
  if (photoFile) {
    const sb = typeof getSb === 'function' ? getSb() : null;
    if (sb) {
      try {
        const ext = (photoFile.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const path = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await sb.storage.from('review-photos').upload(path, photoFile, { contentType: photoFile.type, upsert: false });
        if (!error) photoUrl = sb.storage.from('review-photos').getPublicUrl(path).data.publicUrl;
      } catch (e) { console.warn('Review photo upload failed:', e); }
    }
    if (!photoUrl && photoFile.size < 400 * 1024) {
      photoUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(photoFile);
      });
    }
  }
  
  const reviewData = {
    product_id: productId ? parseInt(productId) : null,
    product_name: productName,
    name,
    email,
    rating,
    title,
    body,
    photo_url: photoUrl
  };
  
  try {
    await submitReview(reviewData);
    alert('Thank you for your review! It will be published after moderation.');
    closeReviewForm();
    // Refresh reviews
    if (currentProductId) {
      loadProductReviews(currentProductId);
    } else {
      loadReviews();
    }
    if (window.refreshReviewsPage) window.refreshReviewsPage();
  } catch (err) {
    alert('Failed to submit review: ' + err.message);
  }
}

// ---------- Load Reviews ----------
async function loadReviews() {
  const reviews = await fetchReviews('approved');
  reviewsCache = reviews;
  renderReviewsSection(reviews, null, 3);
}

async function loadProductReviews(productId) {
  currentProductId = productId;
  const reviews = await fetchReviews('approved', productId);
  renderReviewsSection(reviews, productId);
}

// ---------- Admin Functions ----------
async function adminLoadReviews(status = 'all') {
  const reviews = await fetchReviews(status);
  return reviews;
}

async function adminApproveReview(id) {
  return await moderateReview(id, { status: 'approved' });
}

async function adminRejectReview(id) {
  return await moderateReview(id, { status: 'rejected' });
}

async function adminReplyReview(id, reply) {
  return await moderateReview(id, { admin_reply: reply });
}

async function adminVerifyPurchase(id, verified) {
  return await moderateReview(id, { verified_purchase: verified });
}

async function adminDeleteReview(id) {
  return await deleteReview(id);
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  // Load reviews on homepage
  if (document.getElementById('reviewsContainer')) {
    loadReviews();
  }
  
  // Setup review form
  const reviewForm = document.getElementById('reviewForm');
  if (reviewForm) {
    reviewForm.addEventListener('submit', handleReviewSubmit);
  }
  
  // Setup star rating
  const starRating = document.getElementById('starRating');
  if (starRating) {
    updateStarDisplay(5);
  }
  
  // Close modal on overlay click
  const reviewModal = document.getElementById('reviewModal');
  if (reviewModal) {
    reviewModal.addEventListener('click', (e) => {
      if (e.target === reviewModal) closeReviewForm();
    });
  }
});
