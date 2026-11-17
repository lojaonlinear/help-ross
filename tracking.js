(function () {
  'use strict';
  if (window.LumaniMeta) return;
  var endpoint = 'https://help-ross.vercel.app/api/meta-events';
  var storageKey = 'lumani_advertising_consent_v1';
  var consent = false, config, configPromise, initialized = false;
  var sent = new Set();
  var privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  function cookie(name) {
    var match = document.cookie.split('; ').find(function (part) { return part.startsWith(name + '='); });
    return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
  }
  function setCookie(name, value, age) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; Path=/; Max-Age=' + age + '; SameSite=Lax; Secure';
  }
  function uuid() { return crypto.randomUUID(); }
  function identifiers() {
    var visitor = cookie('lm_visitor');
    if (!/^[a-f0-9-]{36}$/i.test(visitor)) { visitor = uuid(); setCookie('lm_visitor', visitor, 7776000); }
    var fbp = cookie('_fbp');
    if (!fbp) {
      fbp = 'fb.1.' + Date.now() + '.' + crypto.getRandomValues(new Uint32Array(1))[0];
      setCookie('_fbp', fbp, 7776000);
    }
    var click = new URLSearchParams(location.search).get('fbclid');
    if (click && /^[A-Za-z0-9_.-]{1,512}$/.test(click) && cookie('_fbc').split('.').slice(3).join('.') !== click) setCookie('_fbc', 'fb.1.' + Date.now() + '.' + click, 7776000);
    return { visitor_id: visitor, fbp: fbp, fbc: cookie('_fbc') };
  }
  async function setup() {
    if (!consent || privacySignal) return false;
    if (!configPromise) configPromise = fetch(endpoint, { cache: 'no-store', credentials: 'omit' }).then(function (response) { return response.json(); }).catch(function () { return { pixelId: '1259106795284776', enabled: true }; });
    config = await configPromise;
    if (!consent || !config.enabled) return false;
    if (!initialized) {
      if (!window.fbq) {
        var queue = function () { queue.callMethod ? queue.callMethod.apply(queue, arguments) : queue.queue.push(arguments); };
        queue.push = queue; queue.loaded = true; queue.version = '2.0'; queue.queue = [];
        window.fbq = window._fbq = queue;
      }
      fbq('consent', 'revoke');
      fbq('set', 'autoConfig', false, config.pixelId);
      fbq('init', config.pixelId, { external_id: identifiers().visitor_id });
      fbq('consent', 'grant');
      initialized = true;
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      script.dataset.metaPixel = 'true';
      document.head.appendChild(script);
    }
    return true;
  }
  function payload(extra) {
    return Object.assign({ consent: true, event_source_url: location.origin + location.pathname }, identifiers(), extra);
  }
  async function post(data) {
    var response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true, credentials: 'omit' });
    var result = await response.json();
    document.documentElement.dataset.metaServerStatus = result.ok ? 'accepted' : 'error';
    return result;
  }
  async function track(name, value) {
    if (!await setup()) return;
    var id = uuid();
    var custom = name === 'InitiateCheckout' ? { value: value, currency: 'USD', num_items: 1 } : {};
    fbq('trackSingle', config.pixelId, name, custom, { eventID: id });
    // Browser and server share the same ID; no page titles or medical content are passed.
    return post(payload({ event_name: name, event_id: id, value: value })).catch(function () { document.documentElement.dataset.metaServerStatus = 'error'; });
  }
  function initialEvents() {
    if (!consent) return;
    if (!sent.has('PageView')) { sent.add('PageView'); track('PageView'); }
    var title = document.getElementById('campTitle') || document.getElementById('donationCampaignTitle');
    if (title && title.textContent.trim() && !sent.has('ViewContent')) { sent.add('ViewContent'); track('ViewContent'); }
  }
  var banner = document.createElement('section');
  banner.className = 'advertising-consent';
  banner.hidden = true;
  banner.setAttribute('aria-label', 'Advertising preferences');
  banner.innerHTML = '<div><strong>Advertising preferences</strong><p>Allow Meta advertising cookies to measure visits and donation checkouts. <a href="advertising-privacy.html">How your data is used</a></p></div><div class="advertising-consent-actions"><button type="button" data-consent="reject">Reject</button><button type="button" data-consent="accept">Accept</button></div>';
  document.body.appendChild(banner);
  if (privacySignal) {
    banner.querySelector('p').textContent = 'Your browser privacy preference disables advertising measurement.';
    banner.querySelector('[data-consent="accept"]').disabled = true;
  }
  function showPreferences() { banner.hidden = false; banner.querySelector('button').focus(); }
  var preferences = document.createElement('button');
  preferences.type = 'button'; preferences.className = 'advertising-preferences'; preferences.textContent = 'Advertising preferences';
  preferences.addEventListener('click', showPreferences);
  var footer = document.querySelector('footer .fc:last-child ul');
  if (footer) { var item = document.createElement('li'); item.appendChild(preferences); footer.appendChild(item); }
  else { preferences.classList.add('advertising-preferences-fallback'); document.body.appendChild(preferences); }
  function choose(accepted) {
    consent = accepted && !privacySignal;
    try { localStorage.setItem(storageKey, JSON.stringify({ accepted: consent, at: Date.now() })); } catch {}
    banner.hidden = true;
    document.documentElement.dataset.advertisingConsent = consent ? 'granted' : 'denied';
    if (consent) initialEvents();
    else {
      if (window.fbq) fbq('consent', 'revoke');
      for (var name of ['_fbp', '_fbc', 'lm_visitor']) {
        setCookie(name, '', 0);
        document.cookie = name + '=; Path=/; Domain=' + location.hostname + '; Max-Age=0; SameSite=Lax; Secure';
      }
    }
  }
  banner.querySelector('[data-consent="accept"]').addEventListener('click', function () { choose(true); });
  banner.querySelector('[data-consent="reject"]').addEventListener('click', function () { choose(false); });
  try {
    var saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved.accepted === 'boolean' && Date.now() - saved.at < 15552000000) consent = saved.accepted && !privacySignal;
    else if (!privacySignal) banner.hidden = false;
  } catch { if (!privacySignal) banner.hidden = false; }
  document.documentElement.dataset.advertisingConsent = consent ? 'granted' : 'not_granted';
  window.LumaniMeta = {
    prepareCheckout: async function (amount) {
      if (!consent || ![25, 50, 100, 150, 200, 500].includes(amount) || !await setup()) return null;
      track('InitiateCheckout', amount);
      try {
        var result = await post(payload({ action: 'checkout_context', value: amount }));
        return result.ok && /^lm1_[a-f0-9]{32}$/.test(result.reference) ? result.reference : null;
      } catch { return null; }
    }
  };
  window.addEventListener('lumani:campaign-ready', initialEvents);
  initialEvents();
})();
