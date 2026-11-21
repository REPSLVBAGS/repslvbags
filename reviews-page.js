// ---------- Customer Reviews page (/reviews) ----------
// Fetches approved reviews once, then handles stats, sorting, star
// filtering and Load-More pagination entirely client-side.
(function () {
  'use strict';

  var PAGE_SIZE = 6;
  var allReviews = [];
  var state = { sort: 'newest', star: 0, shown: PAGE_SIZE };

  function esc(s) { return String(s == null ? '' : s); }

  function filtered() {
    var list = allReviews.slice();
    if (state.star) list = list.filter(function (r) { return r.rating === state.star; });
    if (state.sort === 'oldest') list.sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    else if (state.sort === 'rating') list.sort(function (a, b) { return b.rating - a.rating || new Date(b.created_at) - new Date(a.created_at); });
    else list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    // Featured reviews always surface first within the chosen sort.
    list.sort(function (a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0); });
    return list;
  }

  function renderStats(reviews) {
    var avg = reviews.length ? reviews.reduce(function (s, r) { return s + r.rating; }, 0) / reviews.length : 0;
    var el = document.getElementById('rvAvg'); if (el) el.textContent = avg ? avg.toFixed(1) : '—';
    var stars = document.getElementById('rvAvgStars');
    if (stars) {
      var full = Math.round(avg);
      stars.textContent = '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full);
    }
    var cnt = document.getElementById('rvCount');
    if (cnt) cnt.textContent = reviews.length + ' review' + (reviews.length !== 1 ? 's' : '');
    [5, 4, 3, 2, 1].forEach(function (star) {
      var n = reviews.filter(function (r) { return r.rating === star; }).length;
      var bar = document.getElementById('rvBar' + star); if (bar) bar.style.width = (reviews.length ? (n / reviews.length) * 100 : 0) + '%';
      var num = document.getElementById('rvNum' + star); if (num) num.textContent = n;
    });
  }

  function renderList() {
    var listEl = document.getElementById('rvList');
    if (!listEl) return;
    var list = filtered();
    var slice = list.slice(0, state.shown);
    if (!list.length) {
      listEl.innerHTML = '<p class="rv-empty">No reviews match your filters yet.</p>';
    } else {
      listEl.innerHTML = slice.map(renderReviewCard).join('');
    }
    var more = document.getElementById('rvLoadMore');
    if (more) {
      more.classList.toggle('hidden', state.shown >= list.length);
      more.textContent = 'Load More Reviews (' + Math.max(0, list.length - state.shown) + ' remaining)';
    }
    var resultCount = document.getElementById('rvResultCount');
    if (resultCount) resultCount.textContent = list.length + ' of ' + allReviews.length + ' reviews';
  }

  function setSort(v) { state.sort = v; state.shown = PAGE_SIZE; renderList(); syncChips(); }
  function setStar(v) { state.star = v; state.shown = PAGE_SIZE; renderList(); syncChips(); }
  function loadMore() { state.shown += PAGE_SIZE; renderList(); }

  function syncChips() {
    document.querySelectorAll('.rv-chip[data-star]').forEach(function (c) {
      c.classList.toggle('active', +c.dataset.star === state.star);
    });
  }

  async function refresh() {
    allReviews = await fetchReviews('approved');
    // Featured first, then newest — base order before user sorting.
    allReviews.sort(function (a, b) {
      if (!!b.featured !== !!a.featured) return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });
    renderStats(allReviews);
    renderList();
  }

  window.refreshReviewsPage = refresh;

  document.addEventListener('DOMContentLoaded', function () {
    var sortSel = document.getElementById('rvSort');
    if (sortSel) sortSel.addEventListener('change', function () { setSort(sortSel.value); });
    document.querySelectorAll('.rv-chip[data-star]').forEach(function (c) {
      c.addEventListener('click', function () { setStar(+c.dataset.star); });
    });
    var more = document.getElementById('rvLoadMore');
    if (more) more.addEventListener('click', loadMore);
    var writeBtn = document.getElementById('rvWriteTop');
    if (writeBtn) writeBtn.addEventListener('click', function () { openReviewForm(null); });
    var writeBtn2 = document.getElementById('rvWriteBottom');
    if (writeBtn2) writeBtn2.addEventListener('click', function () { openReviewForm(null); });
    refresh();
  });
})();
