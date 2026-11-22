// ---------- Luxury icon set ----------
// Thin-line SVG icons (24x24, 1.5px stroke) shared across the storefront.
// I.<name>() returns inline SVG markup for JS-rendered content;
// upgradeStaticIcons() swaps legacy text glyphs in static HTML on load.
(function () {
  'use strict';

  var BASE = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

  var PATHS = {
    menu:    '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
    search:  '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.4" y2="16.4"/>',
    heart:   '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    heartFill: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" fill="currentColor" stroke="none"/>',
    bag:     '<path d="M5.5 8h13l.9 12.5a1 1 0 0 1-1 1.1H5.6a1 1 0 0 1-1-1.1L5.5 8z"/><path d="M9 8V6.8a3 3 0 0 1 6 0V8"/>',
    close:   '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    minus:   '<line x1="5" y1="12" x2="19" y2="12"/>',
    plus:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    star:    '<polygon points="12 3.6 14.8 8.9 20.5 9.7 16.6 13.8 17.7 19.4 12 16.7 6.3 19.4 7.4 13.8 3.5 9.7 9.2 8.9"/>',
    starFill:'<polygon points="12 3.6 14.8 8.9 20.5 9.7 16.6 13.8 17.7 19.4 12 16.7 6.3 19.4 7.4 13.8 3.5 9.7 9.2 8.9" fill="currentColor" stroke="none"/>',
    arrowR:  '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13.5 5.5 20 12 13.5 18.5"/>',
    arrowU:  '<line x1="12" y1="20" x2="12" y2="4"/><polyline points="5.5 10.5 12 4 18.5 10.5"/>',
    user:    '<circle cx="12" cy="8" r="4"/><path d="M4.8 20.4c1.4-3.4 4.3-5 7.2-5s5.8 1.6 7.2 5"/>',
    insta:   '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none"/>',
    chat:    '<path d="M4.5 6.8A2.3 2.3 0 0 1 6.8 4.5h10.4a2.3 2.3 0 0 1 2.3 2.3v6.4a2.3 2.3 0 0 1-2.3 2.3H9.2L4.5 20.5v-13.7z"/>',
    lock:    '<rect x="5" y="10.5" width="14" height="9.5" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    sparkle: '<path d="M12 4l1.7 4.6L18.3 10l-4.6 1.7L12 16.3l-1.7-4.6L5.7 10l4.6-1.4L12 4z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
    truck:   '<rect x="2.5" y="6" width="11" height="10" rx="1"/><path d="M13.5 9.5h4l3.5 3.5v3h-7.5"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    headset: '<path d="M4.5 13.5v-1a7.5 7.5 0 0 1 15 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19a4 4 0 0 1-4 2h-2"/>'
  };

  function svg(name, cls) {
    var inner = PATHS[name];
    if (!inner) return '';
    return '<svg class="ic ic-' + name + (cls ? ' ' + cls : '') + '" ' + BASE + ' aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  window.I = {
    svg: svg,
    menu: function (c) { return svg('menu', c); },
    search: function (c) { return svg('search', c); },
    heart: function (c) { return svg('heart', c); },
    heartFill: function (c) { return svg('heartFill', c); },
    bag: function (c) { return svg('bag', c); },
    close: function (c) { return svg('close', c); },
    minus: function (c) { return svg('minus', c); },
    plus: function (c) { return svg('plus', c); },
    star: function (c) { return svg('star', c); },
    starFill: function (c) { return svg('starFill', c); },
    arrowR: function (c) { return svg('arrowR', c); },
    arrowU: function (c) { return svg('arrowU', c); },
    user: function (c) { return svg('user', c); },
    insta: function (c) { return svg('insta', c); },
    chat: function (c) { return svg('chat', c); },
    lock: function (c) { return svg('lock', c); },
    sparkle: function (c) { return svg('sparkle', c); },
    truck: function (c) { return svg('truck', c); },
    headset: function (c) { return svg('headset', c); }
  };

  // Replace legacy text glyphs in static markup. Dynamic content uses I.* directly.
  function upgradeStaticIcons() {
    function setIcon(el, name) {
      if (!el || el.dataset.iconDone) return;
      el.dataset.iconDone = '1';
      // Preserve badge children (cart/wishlist counters).
      var badge = el.querySelector('.badge');
      el.innerHTML = svg(name);
      if (badge) el.appendChild(badge);
    }
    document.querySelectorAll('.hamburger').forEach(function (el) { setIcon(el, 'menu'); });
    document.querySelectorAll('#searchBtn, [aria-label="Search"]').forEach(function (el) { setIcon(el, 'search'); });
    document.querySelectorAll('#wishlistBtn, #cartBtn').forEach(function (el) { setIcon(el, el.id === 'cartBtn' ? 'bag' : 'heart'); });
    document.querySelectorAll('.close, .menu-close').forEach(function (el) { setIcon(el, 'close'); });
    // Star-rating inputs (review form)
    document.querySelectorAll('#starRating .star').forEach(function (el) {
      if (el.dataset.iconDone) return;
      el.dataset.iconDone = '1';
      el.innerHTML = svg('star');
    });
    // Declarative icons: <span data-icon="truck"></span>
    document.querySelectorAll('[data-icon]').forEach(function (el) {
      if (el.dataset.iconDone) return;
      el.dataset.iconDone = '1';
      el.innerHTML = svg(el.getAttribute('data-icon'));
    });
    // Social text links get a small platform glyph
    document.querySelectorAll('.socials a').forEach(function (a) {
      if (a.dataset.iconDone || !/instagram/i.test(a.textContent)) return;
      a.dataset.iconDone = '1';
      a.innerHTML = svg('insta') + '<span style="margin-left:8px">' + a.textContent.trim() + '</span>';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgradeStaticIcons);
  } else {
    upgradeStaticIcons();
  }
})();
