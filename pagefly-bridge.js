(function () {
  'use strict';

  var WORKER_ORIGIN = 'https://camp.lumani-impact.org';
  // Direct navigation stays on either owned host; Shopify iframe routes stay canonical.
  try {
    var directOrigin = new URL(window.location.href).origin;
    if (window.parent === window && ['https://camp.lumani-impact.org', 'https://us.lumani-us.org'].indexOf(directOrigin) !== -1) WORKER_ORIGIN = directOrigin;
  } catch (_) {}
  var WORKER_CHECKOUT = ['https://camp.lumani-impact.org', 'https://us.lumani-us.org'].indexOf(new URL(window.location.href).origin) !== -1;
  var CHECKOUT_ORIGINS = WORKER_CHECKOUT ? ['https://check.lumani-us.org', 'https://lumani-impactt.site'] : ['https://lumani-impactt.site'];
  var checkoutSpecific = !WORKER_CHECKOUT;
  var DEFAULT_CHECKOUT_STORE = 'lumani-impactt';
  var CHECKOUT_STORES = ['lumani-impactt'];
  var CHECKOUT_AMOUNTS = ['25', '50', '100', '150', '200', '500'];
  var CHECKOUT_STORE_KEY = 'lumani_impact_checkout_store';
  var TRACKING_PARAMETER = /^(?:utm_.+|fbclid|gclid|gbraid|wbraid|ttclid|tbclid|msclkid|click_id|src|sck|xcod)$/i;
  var SHARE_PARENT_ORIGINS = [
    'https://lumani-impactt.site',
    'https://www.lumani-impactt.site'
  ];

  function normalizeCheckoutStore(value) {
    var normalized = String(value || '').trim().toLowerCase();
    return CHECKOUT_STORES.indexOf(normalized) !== -1 ? normalized : DEFAULT_CHECKOUT_STORE;
  }

  function saveCheckoutStore(value) {
    try { window.sessionStorage.setItem(CHECKOUT_STORE_KEY, value); }
    catch (_) {}
  }

  function initialCheckoutStore() {
    var requested = '';
    try { requested = new URL(window.location.href).searchParams.get('checkout_store') || ''; }
    catch (_) {}
    if (requested) {
      if (WORKER_CHECKOUT) checkoutSpecific = String(requested).trim().toLowerCase() === DEFAULT_CHECKOUT_STORE;
      var normalized = normalizeCheckoutStore(requested);
      saveCheckoutStore(normalized);
      return normalized;
    }
    if (window.parent === window) {
      saveCheckoutStore(DEFAULT_CHECKOUT_STORE);
      return DEFAULT_CHECKOUT_STORE;
    }
    try {
      if (WORKER_CHECKOUT) checkoutSpecific = String(window.sessionStorage.getItem(CHECKOUT_STORE_KEY) || '').trim().toLowerCase() === DEFAULT_CHECKOUT_STORE;
      normalized = normalizeCheckoutStore(window.sessionStorage.getItem(CHECKOUT_STORE_KEY));
    } catch (_) {}
    return normalized || DEFAULT_CHECKOUT_STORE;
  }

  var checkoutStore = initialCheckoutStore();

  function applyCheckoutStore(value) {
    var normalized = normalizeCheckoutStore(value);
    checkoutStore = normalized;
    saveCheckoutStore(normalized);
    if (WORKER_CHECKOUT) checkoutSpecific = true;
    if (window.LumaniImpactCheckout) window.LumaniImpactCheckout.applyCheckoutStore(normalized);
    return true;
  }

  function checkoutStoreForParentOrigin(origin) {
    return DEFAULT_CHECKOUT_STORE;
  }

  function navigateCheckout(url) {
    if (window.parent !== window) {
      window.parent.postMessage({
        source: 'lumani-impact-embed',
        type: 'navigate-checkout',
        url: url.href
      }, '*');
    } else {
      window.location.assign(url.href);
    }
    return true;
  }

  function checkoutUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      if (url.protocol !== 'https:' || CHECKOUT_ORIGINS.indexOf(url.origin) === -1) return null;
      if (url.origin === 'https://check.lumani-us.org' ? !/^\/(25|50|100|150|200|500)$/.test(url.pathname) : !url.pathname.startsWith('/cart/')) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function checkout(value) {
    var url = checkoutUrl(value);
    if (!url) return false;
    if (window.LumaniImpactAttribution) url = new URL(window.LumaniImpactAttribution.decorate(url.href));
    return navigateCheckout(url);
  }

  function checkoutTier(value) {
    var amount = String(value || '').trim();
    if (CHECKOUT_AMOUNTS.indexOf(amount) === -1) return false;
    var routeStore = checkoutStore === DEFAULT_CHECKOUT_STORE ? checkoutStore : DEFAULT_CHECKOUT_STORE;
    var url = new URL('/checkout/' + routeStore + '/' + amount, WORKER_ORIGIN);
    var specific = window.LumaniImpactCheckout ? window.LumaniImpactCheckout.isSpecific() : checkoutSpecific;
    if (WORKER_CHECKOUT && !specific) url = new URL('https://check.lumani-us.org/' + amount);
    if (WORKER_CHECKOUT && specific) url.searchParams.set('checkout_store', routeStore);
    if (checkoutStore !== routeStore) url.searchParams.set('checkout_store', checkoutStore);
    var sourceUrl;
    if (window.LumaniImpactAttribution) {
      url = new URL(window.LumaniImpactAttribution.decorate(url.href));
      return navigateCheckout(url);
    }
    try { sourceUrl = new URL(window.__LUMANI_IMPACT_PAGEFLY_SHARE_URL__ || window.location.href); }
    catch (_) { sourceUrl = null; }
    if (sourceUrl) {
      sourceUrl.searchParams.forEach(function (parameterValue, name) {
        if (TRACKING_PARAMETER.test(name)) url.searchParams.set(name, parameterValue);
      });
    }
    return navigateCheckout(url);
  }

  window.LumaniImpactEmbed = {
    checkout: checkout,
    checkoutTier: checkoutTier,
    getCheckoutStore: function () { return checkoutStore; },
    isAllowedCheckout: function (value) { return Boolean(checkoutUrl(value)); }
  };

  function shareUrlFromParent(value, parentOrigin) {
    if (SHARE_PARENT_ORIGINS.indexOf(parentOrigin) === -1) return null;
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.origin !== parentOrigin) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function applyShareUrl(value) {
    window.__LUMANI_IMPACT_PAGEFLY_SHARE_URL__ = value;
    var input = document.getElementById && document.getElementById('shareLinkInput');
    if (input) input.value = value;
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('message', function (event) {
      if (window.parent === window || event.source !== window.parent) return;
      var message = event.data || {};
      if (message.source !== 'lumani-impact-pagefly-universal' ||
          SHARE_PARENT_ORIGINS.indexOf(event.origin) === -1) return;
      if (message.type === 'set-share-url' && typeof message.url === 'string') {
        var url = shareUrlFromParent(message.url, event.origin);
        if (url) {
          applyShareUrl(url.href);
          if (window.LumaniImpactAttribution) window.LumaniImpactAttribution.setParent(url.href, event.origin);
          applyCheckoutStore(checkoutStoreForParentOrigin(event.origin));
        }
        return;
      }
      if (message.type === 'set-checkout-store' && typeof message.store === 'string') {
        applyCheckoutStore(checkoutStoreForParentOrigin(event.origin));
      }
    });
  }

  function currentCampaignSlug() {
    var slug = '';
    try { slug = new URLSearchParams(window.location.search).get('slug') || ''; }
    catch (_) {}
    if (!slug) {
      var path = String(window.location.pathname || '').replace(/^\/+|\/+$/g, '');
      if (path && !path.includes('/')) slug = path;
    }
    return /^[a-z0-9-]+$/.test(slug) ? slug : '';
  }

  function reportCampaignRoute() {
    if (window.parent === window) return;
    var slug = currentCampaignSlug();
    if (!slug) return;
    window.parent.postMessage({
      source: 'lumani-impact-embed',
      type: 'campaign-route',
      slug: slug
    }, '*');
  }

  reportCampaignRoute();

  function installPageFlyShareBridge() {
    if (typeof document.getElementById !== 'function' ||
        !document.getElementById('lumani-impact-pagefly-original-document')) return;
    var shareUrl = window.location.href;
    applyShareUrl(shareUrl);

    function updateShareInput() {
      var input = document.getElementById('shareLinkInput');
      if (input) input.value = shareUrl;
    }

    window.shareVia = function (platform) {
      var titleElement = document.getElementById('campTitle');
      var title = ((titleElement && titleElement.textContent) || document.title || 'Lumani Impact') + ' — Lumani Impact';
      var encodedUrl = encodeURIComponent(shareUrl);
      var encodedTitle = encodeURIComponent(title);
      if (platform === 'instagram') {
        if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).catch(function () {});
        window.open('https://www.instagram.com/', '_blank');
        return;
      }
      var links = {
        whatsapp: 'https://wa.me/?text=' + encodedTitle + '%20' + encodedUrl,
        facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl,
        email: 'mailto:?subject=' + encodedTitle + '&body=' + encodedUrl
      };
      if (links[platform]) window.open(links[platform], '_blank');
    };

    window.copyShareLink = function () {
      if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).catch(function () {});
    };

    updateShareInput();
    document.addEventListener('DOMContentLoaded', updateShareInput, { once: true });
  }

  installPageFlyShareBridge();

  document.addEventListener('click', function (event) {
    if (!event.isTrusted || event.button !== 0 || event.defaultPrevented) return;
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    var url;
    try { url = new URL(anchor.href, window.location.href); } catch (_) { return; }
    if (checkoutUrl(url.href)) {
      event.preventDefault();
      checkout(url.href);
      return;
    }
    if (url.origin !== window.location.origin && /^https?:$/.test(url.protocol)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  }, true);
})();
