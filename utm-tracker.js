(function () {
  'use strict';
  var KEY = 'central_campaign_attribution_v1:lumani';
  var TRACKING = /^(?:utm_.+|fbclid|gclid|gbraid|wbraid|ttclid|tbclid|msclkid|click_id|src|sck|xcod)$/i;
  var WORKERS = ['https://camp.lumani-impact.org', 'https://us.lumani-us.org'];
  var STORES = ['https://lumani-impactt.site'];
  var PARENTS = ['https://lumani-impactt.site', 'https://www.lumani-impactt.site'];
  var current = null, parentPairs = null, parentSignature = null;
  var ownSignature = null, childEligible = true;
  var enrichmentObject = null, enrichmentGeneration = null;
  var anchors = new WeakMap(), painting = false, sequence = 0;
  var history = window.history;
  var replaceState = history && history.replaceState;

  function pairs(source) {
    var result = new Map();
    if (source && typeof source.forEach === 'function') source.forEach(function (value, name) {
      if (TRACKING.test(name)) result.set(name, value);
    });
    return Array.from(result);
  }
  function signature(values) { return JSON.stringify(values.slice().sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; })); }
  function merge() {
    var result = new Map();
    Array.from(arguments).forEach(function (values) { (values || []).forEach(function (pair) { result.set(pair[0], pair[1]); }); });
    return Array.from(result);
  }
  function valid(packet) {
    return packet && packet.v === 1 && typeof packet.generation === 'string' &&
      typeof packet.entrySignature === 'string' && Array.isArray(packet.pairs) && packet.pairs.every(function (pair) {
        return Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string' && TRACKING.test(pair[0]);
      });
  }
  function fresh(values, inputSignature) {
    var generation;
    try { generation = window.crypto && window.crypto.randomUUID(); } catch (_) {}
    return { v: 1, generation: generation || String(Date.now()) + ':' + (++sequence), entrySignature: inputSignature, pairs: values };
  }
  function historyPacket() {
    try { var packet = history && history.state && history.state[KEY]; return valid(packet) ? packet : null; } catch (_) { return null; }
  }
  function sessionPacket() {
    try { var packet = JSON.parse(window.sessionStorage.getItem(KEY)); return valid(packet) ? packet : null; } catch (_) { return null; }
  }
  function save() {
    if (!current) return;
    var serialized = JSON.stringify(current), packet = JSON.parse(serialized);
    try {
      if (window.sessionStorage.getItem(KEY) !== serialized) window.sessionStorage.setItem(KEY, serialized);
    } catch (_) {}
    try {
      var state = history && history.state;
      // DOM/link refreshes must not flood Chrome's native navigation IPC guard.
      // Persist only a changed packet; leave unrelated history namespaces intact.
      if (replaceState && (state == null || typeof state === 'object') && JSON.stringify(state && state[KEY]) !== serialized) {
        var next = Object.assign({}, state || {}); next[KEY] = packet;
        replaceState.call(history, next, '');
      }
    } catch (_) {}
  }
  function ownPairs() { try { return pairs(new URL(window.location.href).searchParams); } catch (_) { return []; } }
  function enrich() {
    var object = window.utmParams;
    if (!object || typeof object.forEach !== 'function') return [];
    if (object !== enrichmentObject) { enrichmentObject = object; enrichmentGeneration = current.generation; }
    return enrichmentGeneration === current.generation ? pairs(object) : [];
  }
  function sync() {
    var raw = ownPairs(), input = signature(raw), snapshot = historyPacket();
    if (parentPairs !== null) {
      if (raw.length && ownSignature !== input) {
        childEligible = true;
        current = fresh(merge(raw, parentPairs), parentSignature);
      }
    } else if (raw.length) {
      var existing = snapshot || current || sessionPacket();
      current = valid(existing) && (existing.entrySignature === input || signature(existing.pairs) === input)
        ? existing : fresh(raw, input);
    } else {
      current = snapshot || current || sessionPacket() || fresh([], input);
    }
    ownSignature = input;
    current.pairs = merge(current.pairs, childEligible ? raw : [], parentPairs, enrich());
    save();
    return current.pairs;
  }
  function setParent(value, origin) {
    if (PARENTS.indexOf(origin) === -1) return false;
    var url;
    try { url = new URL(value); } catch (_) { return false; }
    if (url.protocol !== 'https:' || url.origin !== origin) return false;
    sync();
    var raw = pairs(url.searchParams), input = signature(raw);
    if (parentPairs === null) {
      var own = ownPairs();
      current = own.length ? { v: 1, generation: current.generation, entrySignature: input, pairs: merge(own, raw) } : fresh(raw.length ? raw : current.pairs, input);
    } else if (raw.length && input !== parentSignature) {
      childEligible = false;
      current = fresh(raw, input);
    }
    parentPairs = raw;
    parentSignature = input;
    current.pairs = merge(current.pairs, childEligible ? ownPairs() : [], raw, enrich());
    save(); refreshLinks();
    return true;
  }
  function decorate(value) {
    if (!value || /^\s*#/.test(value)) return value;
    var url;
    try { url = new URL(value, window.location.href); } catch (_) { return value; }
    if (!/^https?:$/.test(url.protocol) ||
        !(WORKERS.indexOf(url.origin) !== -1 ||
          (WORKERS.indexOf(new URL(window.location.href).origin) !== -1 && url.origin === 'https://check.lumani-us.org' && /^\/(25|50|100|150|200|500)$/.test(url.pathname)) ||
          (STORES.indexOf(url.origin) !== -1 && url.pathname.startsWith('/cart/')))) return value;
    sync().forEach(function (pair) { url.searchParams.set(pair[0], pair[1]); });
    if (window.LumaniImpactCheckout) window.LumaniImpactCheckout.decorateNavigation(url);
    return url.href;
  }
  function refreshLinks() {
    if (painting || !document.querySelectorAll) return;
    painting = true;
    try {
      var values = sync();
      Array.from(document.querySelectorAll('a[href]')).forEach(function (anchor) {
        var href = anchor.getAttribute('href'), record = anchors.get(anchor);
        if (!record || href !== record.last) {
          var base = href;
          try {
            var url = new URL(href, window.location.href);
            values.forEach(function (pair) { if (url.searchParams.get(pair[0]) === pair[1]) url.searchParams.delete(pair[0]); });
            if (decorate(href) !== href) base = url.href;
          } catch (_) {}
          record = { base: base, last: href }; anchors.set(anchor, record);
        }
        var target = decorate(record.base);
        if (target !== href) anchor.setAttribute('href', target);
        record.last = target;
      });
    } finally { painting = false; }
  }

  window.LumaniImpactAttribution = { decorate: decorate, get: function () { return new URLSearchParams(sync()); }, setParent: setParent, refresh: refreshLinks };
  sync();
  // Keep the preexisting source-only hint separate from the opaque transport packet.
  try {
    var source = new URLSearchParams(window.location.search).get('utm_source');
    if (source) window.sessionStorage.setItem('utm_source_origin', source.toLowerCase());
  } catch (_) {}
  refreshLinks();
  document.addEventListener('DOMContentLoaded', refreshLinks);
  ['pointerdown', 'mousedown', 'contextmenu', 'auxclick', 'click'].forEach(function (event) { document.addEventListener(event, refreshLinks, true); });
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', refreshLinks);
    window.addEventListener('popstate', refreshLinks);
  }
  if (history) ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () { var result = original.apply(history, arguments); refreshLinks(); return result; };
  });
  if (typeof MutationObserver === 'function' && document.documentElement) {
    new MutationObserver(refreshLinks).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  }
})();

// Campaign/donation header controls must work before late application scripts bind.
(function () {
  'use strict';
  if (!/\/(?:campaign-detail|donate)(?:\.html)?\/?$/.test(window.location.pathname)) return;
  var pendingMenu = null;
  function applyMenu(open) {
    var menu = document.getElementById('mobMenu'), button = document.getElementById('hamburger');
    if (!menu || !button || !document.body) { pendingMenu = open; return; }
    menu.classList.toggle('open', open);
    button.classList.toggle('active', open);
    document.body.classList.toggle('mob-menu-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    pendingMenu = null;
  }
  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;
    var trigger = target.closest('nav .nav-trigger');
    if (trigger) {
      event.stopImmediatePropagation();
      var item = trigger.closest('.nav-item'), open = item && item.classList.contains('open');
      document.querySelectorAll('.nav-item').forEach(function (node) { node.classList.remove('open'); });
      if (item && !open) item.classList.add('open');
      return;
    }
    if (target.closest('#hamburger')) {
      event.stopImmediatePropagation();
      var menu = document.getElementById('mobMenu');
      applyMenu(pendingMenu === null ? !(menu && menu.classList.contains('open')) : !pendingMenu);
    } else if (target.closest('#mobMenuClose')) {
      event.stopImmediatePropagation(); applyMenu(false);
    } else if (!target.closest('.nav-item')) {
      document.querySelectorAll('.nav-item').forEach(function (node) { node.classList.remove('open'); });
    }
  }, true);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') applyMenu(false); });
  if (typeof MutationObserver === 'function' && document.documentElement) {
    new MutationObserver(function () { if (pendingMenu !== null) applyMenu(pendingMenu); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
})();
