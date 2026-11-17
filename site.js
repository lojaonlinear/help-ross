(function () {
  'use strict';
  var links = window.LumaniImpactCheckout.getLinks();
  var previousFocus = null;
  var notice = document.createElement('div');
  notice.className = 'site-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  document.body.appendChild(notice);
  var noticeTimer;
  window.showSiteNotice = function (message) {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.classList.add('visible');
    noticeTimer = setTimeout(function () { notice.classList.remove('visible'); }, 4000);
  };
  window.shareNative = async function () {
    var link = document.querySelector('#shareLinkInput');
    var url = link ? link.value : location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: url });
      else await window.copyCampaignLink();
    } catch (error) {
      if (error.name !== 'AbortError') window.showSiteNotice('Use the share window to copy the campaign link.');
    }
  };
  var dialog = document.createElement('dialog');
  dialog.className = 'donation-dialog';
  dialog.id = 'donationDialog';
  dialog.setAttribute('aria-labelledby', 'donationHeading');
  dialog.innerHTML = '<button class="donation-close" type="button" aria-label="Close donation options">×</button>' +
    '<div class="donation-layout"><section class="donation-preview" aria-label="Campaign summary">' +
    '<img id="donationImage" alt=""><div class="donation-preview-body"><span class="donation-category">HEALTH</span>' +
    '<h2 id="donationCampaignTitle"></h2><progress id="donationProgress" max="100" aria-label="Campaign funding progress"></progress>' +
    '<p id="donationTotals"></p><small>Campaign totals are not updated in real time.</small></div></section>' +
    '<section class="donation-options"><header><h2 id="donationHeading">Choose your donation</h2>' +
    '<p>Select an amount to continue to Stripe.</p></header><div class="donation-form">' +
    '<fieldset><legend>SELECT AN AMOUNT (USD)</legend><div class="donation-amounts">' +
    [25, 50, 100, 150, 200, 500].map(function (amount) {
      return '<label class="donation-amount"><input type="radio" name="donation-amount" value="' + amount + '">' +
        (amount === 100 ? '<span class="donation-suggested">★ SUGGESTED</span>' : '') +
        '<span>$' + amount + '</span></label>';
    }).join('') + '</div></fieldset><a id="donationContinue" class="donation-continue" aria-disabled="true" tabindex="-1">Choose an amount</a>' +
    '<p class="donation-security">🔒 Secure checkout via Stripe</p>' +
    '<p class="donation-checkout-note">Review the amount, currency and recipient on Stripe before paying.</p></div></section></div>';
  document.body.appendChild(dialog);
  var continueLink = dialog.querySelector('#donationContinue');
  dialog.querySelector('.donation-close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', function () {
    document.body.classList.remove('donation-is-open');
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    if (document.body.classList.contains('donation-route')) window.location.assign('campaign-detail.html' + window.location.search);
  });
  continueLink.addEventListener('click', function (event) {
    if (continueLink.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
  dialog.addEventListener('change', function (event) {
    if (event.target.name !== 'donation-amount') return;
    var amount = event.target.value;
    if (!Object.prototype.hasOwnProperty.call(links, amount)) return;
    continueLink.href = links[amount];
    continueLink.removeAttribute('aria-disabled');
    continueLink.removeAttribute('tabindex');
    continueLink.textContent = 'Donate $' + amount;
  });
  function formatMoney(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  }
  window.openDonation = function (campaign) {
    if (!campaign || dialog.open) return;
    previousFocus = document.activeElement;
    document.querySelectorAll('.moverlay.open,.don-overlay.open').forEach(function (overlay) { overlay.classList.remove('open'); });
    dialog.querySelectorAll('input').forEach(function (input) { input.checked = false; });
    continueLink.removeAttribute('href');
    continueLink.setAttribute('aria-disabled', 'true');
    continueLink.setAttribute('tabindex', '-1');
    continueLink.textContent = 'Choose an amount';
    dialog.querySelector('#donationCampaignTitle').textContent = campaign.title;
    var image = dialog.querySelector('#donationImage');
    image.src = (campaign.imgs && campaign.imgs[0]) || campaign.image_url;
    image.alt = campaign.title;
    var raised = Number(campaign.raisedN === undefined ? campaign.raised : campaign.raisedN) || 0;
    var goal = Number(campaign.goalN === undefined ? campaign.goal : campaign.goalN) || 0;
    dialog.querySelector('#donationProgress').value = goal > 0 ? Math.min(raised / goal * 100, 100) : 0;
    dialog.querySelector('#donationTotals').textContent = formatMoney(raised) + ' raised of ' + formatMoney(goal);
    dialog.querySelector('.donation-category').textContent = campaign.label || campaign.category || 'CAMPAIGN';
    document.body.classList.add('donation-is-open');
    dialog.showModal();
    dialog.querySelector('.donation-close').focus();
  };

  // Legacy dialogs keep keyboard focus inside, close with Escape, and restore focus.
  document.querySelectorAll('.moverlay,.don-overlay').forEach(function (overlay) {
    var modal = overlay.querySelector('.modal,.don-modal');
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('tabindex', '-1');
    var heading = modal.querySelector('h3,.don-modal-title');
    if (heading) {
      if (!heading.id) heading.id = overlay.id + 'Heading';
      modal.setAttribute('aria-labelledby', heading.id);
    } else modal.setAttribute('aria-label', 'Campaign information');
    var returnFocus;
    new MutationObserver(function () {
      if (overlay.classList.contains('open')) {
        returnFocus = document.activeElement;
        document.body.classList.add('legacy-modal-open');
        var close = modal.querySelector('.mclose,.don-modal-close');
        (close || modal).focus();
      } else {
        if (!document.querySelector('.moverlay.open,.don-overlay.open')) document.body.classList.remove('legacy-modal-open');
        if (returnFocus && returnFocus.isConnected) returnFocus.focus();
      }
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); overlay.classList.remove('open'); return; }
      if (event.key !== 'Tab') return;
      var focusable = Array.from(modal.querySelectorAll('button,a[href],input,textarea,[tabindex="0"]')).filter(function (el) { return el.getClientRects().length && !el.disabled; });
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); modal.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  });
  document.querySelectorAll('.mclose,.don-modal-close').forEach(function (button) {
    if (button.textContent.trim() === '×') button.setAttribute('aria-label', 'Close dialog');
  });
  document.querySelectorAll('.rel-nav-btn').forEach(function (button, index) { button.setAttribute('aria-label', index === 0 ? 'Previous campaigns' : 'Next campaigns'); });
  var searchOverlay = document.getElementById('navSearchOverlay');
  var menu = document.getElementById('mobMenu');
  var hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.setAttribute('aria-label', 'Open navigation menu');
    hamburger.setAttribute('aria-controls', 'mobMenu');
    hamburger.setAttribute('aria-expanded', 'false');
  }
  if (menu) new MutationObserver(function () { if (hamburger) hamburger.setAttribute('aria-expanded', String(menu.classList.contains('open'))); }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (searchOverlay) searchOverlay.classList.remove('open');
    document.querySelectorAll('.nav-item.open').forEach(function (el) { el.classList.remove('open'); });
    var dropdown = document.getElementById('relDrop');
    if (dropdown) dropdown.classList.remove('open');
  });
  document.querySelectorAll('.nav-trigger').forEach(function (button) {
    button.setAttribute('aria-expanded', 'false');
    new MutationObserver(function () { button.setAttribute('aria-expanded', String(button.closest('.nav-item').classList.contains('open'))); }).observe(button.closest('.nav-item'), { attributes: true, attributeFilter: ['class'] });
  });
  // A broken optional image falls back to initials; no broken-image icons remain.
  document.addEventListener('error', function (event) {
    if (!(event.target instanceof HTMLImageElement)) return;
    var image = event.target;
    if (image.closest('.word-card,.drow,.don-modal-row')) {
      var fallback = document.createElement('span');
      fallback.className = 'word-av';
      var row = image.closest('.word-card,.drow,.don-modal-row');
      var name = row.querySelector('.word-name,.dname,.don-modal-name');
      fallback.textContent = (name ? name.textContent : 'A').split(' ').map(function (part) { return part[0]; }).join('').slice(0, 2);
      image.replaceWith(fallback);
    }
  }, true);
})();
