/*! CityHub visibility guard v1 — never leave content stuck at opacity:0.
    Handles: GSAP/ScrollTrigger CDN failure, delayed window.load, late Firebase/Netlify
    injection (one-shot gsap.utils.toArray misses dynamic nodes), stale ScrollTrigger offsets. */
(function () {
  'use strict';
  var root = document.documentElement;
  var GRACE_MS = 1000;

  // Intentionally-hidden UI is NEVER touched (dropdowns, hover arrows, loader, modals, chat).
  var SKIP = '#loader,[hidden],[aria-hidden="true"],.dropdown-panel,.dropdown-menu,' +
             '.location-arrow,.modal,.modal-overlay,[role="dialog"],#aria-widget-root';
  var PROTECT = ['.reveal', '.reveal-left', '.reveal-right', '.space-card', '.location-card',
    '.feature-item', '.highlight-item', '.listing-card', '.property-card', '.faq-item',
    '.cta-block', '.hero-eyebrow', '.hero-headline', '.hero-sub', '.hero-actions',
    '.hero-stats', '.hero h1', '.hero p'].join(',');

  function alive() { return !!(window.gsap && window.ScrollTrigger); }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function isHidden(el) {
    var cs = getComputedStyle(el);
    return parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden';
  }
  function tweening(el) {
    try { return !!(window.gsap && window.gsap.isTweening(el)); } catch (e) { return false; }
  }
  function inView(el, pad) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || root.clientHeight;
    return r.width > 0 && r.height > 0 && r.bottom > -pad && r.top < vh + pad;
  }

  // Permanently unblock one element (CSS .gz-visible carries the !important).
  function force(el) {
    if (el.__gzForced) return;
    el.__gzForced = true;
    try { if (window.gsap) window.gsap.killTweensOf(el); } catch (e) {}
    el.classList.add('gz-visible');
    el.style.removeProperty('opacity');
    el.style.removeProperty('transform');
    el.style.removeProperty('visibility');
  }

  // Animate-in nodes injected AFTER first paint; guarantee they end visible.
  function reveal(el) {
    if (el.__gzSeen) return;
    el.__gzSeen = true;
    if (!alive() || reduced()) { force(el); return; }
    try {
      window.gsap.fromTo(el, { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', overwrite: 'auto',
          onComplete: function () { force(el); } });
    } catch (e) { force(el); }
  }

  var refreshTimer;
  function refreshST() {                       // debounced: heights changed after injection
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      try { if (window.ScrollTrigger) window.ScrollTrigger.refresh(); } catch (e) {}
    }, 150);
  }

  // Below-the-fold safety: if an element scrolls into view and is STILL hidden after
  // the grace period (and nothing is animating it), force it visible.
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        io.unobserve(el);
        setTimeout(function () {
          if (!el.closest(SKIP) && isHidden(el) && !tweening(el)) force(el);
        }, GRACE_MS);
      });
    }, { rootMargin: '0px 0px -4% 0px' });
  }
  function watch(el) {
    if (io && !el.__gzWatched) { el.__gzWatched = true; io.observe(el); }
  }

  function collect(node, out) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches(PROTECT)) out.push(node);
    if (node.querySelectorAll) {
      var k = node.querySelectorAll(PROTECT);
      for (var i = 0; i < k.length; i++) out.push(k[i]);
    }
  }

  // Handle a freshly injected subtree (Firebase / Netlify data).
  function adopt(node) {
    var found = [];
    collect(node, found);
    found.forEach(function (el) {
      if (el.closest(SKIP)) return;
      watch(el);
      reveal(el);
    });
    if (node && node.querySelectorAll) {
      var imgs = node.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        if (!imgs[i].complete) imgs[i].addEventListener('load', refreshST, { once: true });
      }
    }
    if (found.length) refreshST();
  }

  // Force anything protected that is hidden, in view (or all), and not being animated.
  function sweep(all) {
    var nodes = document.querySelectorAll(PROTECT);
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.__gzForced || el.closest(SKIP)) continue;
      if (!isHidden(el) || tweening(el)) continue;
      if (all || inView(el, 120)) force(el);
    }
  }

  // Public hook: call (or dispatch 'cityhub:listings-rendered') after any dynamic render.
  function refresh(container) {
    if (container) adopt(container);
    refreshST();
    sweep(false);
    setTimeout(function () { refreshST(); sweep(false); }, GRACE_MS);
  }

  function audit() {                            // DevTools helper: window.CityHubReveal.audit()
    var out = [];
    document.querySelectorAll(PROTECT).forEach(function (el) {
      if (el.closest(SKIP)) return;
      var cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden') {
        out.push({ tag: el.tagName, cls: el.className, opacity: cs.opacity, inView: inView(el, 0) });
      }
    });
    if (window.console && console.table) console.table(out);
    return out;
  }

  function init() {
    // GSAP CDN failed / blocked, or user prefers reduced motion → no-motion safe mode NOW.
    if (!alive() || reduced()) root.classList.add('gz-safe');

    Array.prototype.forEach.call(document.querySelectorAll(PROTECT), watch);

    if ('MutationObserver' in window && document.body) {
      new MutationObserver(function (muts) {
        muts.forEach(function (m) {
          for (var i = 0; i < m.addedNodes.length; i++) adopt(m.addedNodes[i]);
        });
      }).observe(document.body, { childList: true, subtree: true });
    }

    // 1-second global watchdog (GSAP loaded but initAnimations threw / window.load delayed).
    setTimeout(function () {
      if (!alive()) root.classList.add('gz-safe');
      var l = document.getElementById('loader');
      if (l && getComputedStyle(l).display !== 'none') l.style.display = 'none';
      sweep(false);
    }, GRACE_MS);

    window.addEventListener('load', function () {
      setTimeout(function () { refreshST(); sweep(false); }, GRACE_MS);
    });
    window.addEventListener('cityhub:listings-rendered', function (e) {
      refresh(e && e.detail && e.detail.container);
    });
  }

  window.CityHubReveal = { refresh: refresh, sweep: function () { sweep(true); }, force: force, audit: audit };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
