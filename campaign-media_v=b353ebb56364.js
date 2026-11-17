(function (global) {
  'use strict';

  var scriptSrc = global.document && global.document.currentScript
    ? global.document.currentScript.src || ''
    : '';
  var scriptBase = '';
  if (/^https?:\/\//i.test(scriptSrc)) {
    scriptBase = scriptSrc.slice(0, scriptSrc.lastIndexOf('/') + 1);
  } else if (scriptSrc) {
    scriptBase = scriptSrc.slice(0, scriptSrc.lastIndexOf('/') + 1);
  }

  function assetUrl(value) {
    var raw = String(value || '');
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw) || !scriptBase) return raw;
    return scriptBase + raw.replace(/^\/+/, '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseStory(text) {
    if (!text) return [];
    return String(text).split(/\n\n|\n/).map(function (line) {
      return line.trim();
    }).filter(Boolean).map(function (line) {
      var image = line.match(/^IMAGE:((?:https?:\/\/|\/?[a-z0-9_.-]+\/)[^|\s]+)(?:\|(.*))?$/i);
      if (image) return { type: 'img', src: assetUrl(image[1]), caption: image[2] || '' };
      var bare = line.match(/^((?:https?:\/\/|\/?[a-z0-9_.-]+\/)[^\s]+\.(?:jpg|jpeg|png|gif|webp))(?:\s+(.*))?$/i);
      if (bare) return { type: 'img', src: assetUrl(bare[1]), caption: bare[2] || '' };
      return line;
    });
  }

  function videoMarkup(campaign) {
    if (!campaign || !campaign.video_url) return '';
    var label = campaign.video_label || campaign.title || 'Campaign video';
    var heading = campaign.video_heading || ('See ' + label);
    var description = campaign.video_description || '';
    var warning = campaign.video_warning || '';
    var poster = assetUrl(campaign.video_poster || campaign.image_url || '');
    var videoUrl = assetUrl(campaign.video_url);
    var safeLabel = escapeHtml(label);
    if (campaign.video_player === 'adrieli') {
      return '<section class="campaign-video-card campaign-video-card-adrieli" data-campaign-video data-player-type="adrieli">' +
        '<div class="campaign-video-kicker">HER STORY — WATCH WITH SOUND</div>' +
        '<h3>' + escapeHtml(heading) + '</h3>' +
        (description ? '<p class="campaign-video-description">' + escapeHtml(description) + '</p>' : '') +
        '<div class="adrieli-player">' +
          '<video autoplay muted playsinline preload="metadata" poster="' + escapeHtml(poster) + '">' +
            '<source src="' + escapeHtml(videoUrl) + '" type="video/mp4">' +
            'Your browser does not support video playback.' +
          '</video>' +
          '<button type="button" class="adrieli-sound-overlay" data-adrieli-overlay data-adrieli-unmute aria-label="Turn on sound for ' + safeLabel + '">' +
            '<strong>Your video has already started</strong>' +
            '<span class="adrieli-sound-icon" aria-hidden="true">🔊</span>' +
            '<span>Click to listen</span>' +
          '</button>' +
          '<div class="adrieli-controls" data-adrieli-controls>' +
            '<button type="button" data-adrieli-toggle aria-label="Play or pause video"><span data-adrieli-play-icon>❚❚</span></button>' +
            '<input type="range" min="0" max="1000" value="0" step="1" data-adrieli-progress aria-label="Video progress">' +
            '<span data-adrieli-time>0:00</span>' +
            '<button type="button" data-adrieli-volume aria-label="Mute or unmute video">🔇</button>' +
            '<button type="button" data-adrieli-fullscreen aria-label="Enter fullscreen">⛶</button>' +
          '</div>' +
        '</div>' +
        (warning ? '<p class="campaign-video-warning">⚠️ ' + escapeHtml(warning.replace(/^⚠️\s*/, '')) + '</p>' : '') +
      '</section>';
    }
    return '<section class="campaign-video-card" data-campaign-video>' +
      '<div class="campaign-video-kicker">URGENT — REAL FOOTAGE</div>' +
      '<h3>' + escapeHtml(heading) + '</h3>' +
      (description ? '<p class="campaign-video-description">' + escapeHtml(description) + '</p>' : '') +
      '<button type="button" class="campaign-video-poster" data-campaign-video-play aria-label="Play ' + safeLabel + '">' +
        '<img src="' + escapeHtml(poster) + '" alt="Video: ' + safeLabel + ' — click to watch" loading="lazy">' +
        '<span class="campaign-video-badge">🎥 ' + safeLabel + '</span>' +
        '<span class="campaign-video-real">⚠️ REAL FOOTAGE</span>' +
        '<span class="campaign-video-play"><span aria-hidden="true">▶</span> Watch ' + safeLabel + '</span>' +
      '</button>' +
      '<div class="campaign-video-player" data-campaign-video-player hidden>' +
        '<video controls playsinline preload="metadata" poster="' + escapeHtml(poster) + '">' +
          '<source src="' + escapeHtml(videoUrl) + '" type="video/mp4">' +
          'Your browser does not support video playback.' +
        '</video>' +
      '</div>' +
      (warning ? '<p class="campaign-video-warning">⚠️ ' + escapeHtml(warning.replace(/^⚠️\s*/, '')) + '</p>' : '') +
    '</section>';
  }

  function supportCount(campaign) {
    var imported = Number(String(campaign && campaign.donations_count || '').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(imported) && imported > 0) return Math.round(imported);
    return 0;
  }

  function mountPlayers(root) {
    var scope = root || (global.document || null);
    if (!scope || !scope.querySelectorAll) return;
    Array.prototype.forEach.call(scope.querySelectorAll('[data-campaign-video]'), function (card) {
      var trigger = card.querySelector('[data-campaign-video-play]');
      var player = card.querySelector('[data-campaign-video-player]');
      var video = player && player.querySelector('video');
      if (!trigger || !player || !video || trigger.dataset.campaignVideoBound === 'true') return;
      trigger.dataset.campaignVideoBound = 'true';
      trigger.addEventListener('click', function () {
        trigger.hidden = true;
        player.hidden = false;
        if (global.document && global.document.body) {
          global.document.body.classList.add('campaign-video-active');
        }
        function restoreSticky() {
          if (global.document && global.document.body) {
            global.document.body.classList.remove('campaign-video-active');
          }
        }
        video.addEventListener('ended', restoreSticky, { once: true });
        video.addEventListener('error', restoreSticky, { once: true });
        var promise = video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(restoreSticky);
      });
    });

    Array.prototype.forEach.call(scope.querySelectorAll('[data-player-type="adrieli"]'), function (card) {
      var video = card.querySelector('video');
      var listen = card.querySelector('[data-adrieli-unmute]');
      var overlay = card.querySelector('[data-adrieli-overlay]');
      if (!video || !listen || !listen.dataset || listen.dataset.adrieliBound === 'true') return;
      listen.dataset.adrieliBound = 'true';
      var toggle = card.querySelector('[data-adrieli-toggle]');
      var playIcon = card.querySelector('[data-adrieli-play-icon]');
      var progress = card.querySelector('[data-adrieli-progress]');
      var time = card.querySelector('[data-adrieli-time]');
      var volume = card.querySelector('[data-adrieli-volume]');
      var fullscreen = card.querySelector('[data-adrieli-fullscreen]');

      function bodyActive(active) {
        if (!global.document || !global.document.body) return;
        global.document.body.classList[active ? 'add' : 'remove']('campaign-video-active');
      }
      function play() {
        var promise = video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(function () {});
      }
      function formatTime(seconds) {
        var safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
        return Math.floor(safe / 60) + ':' + String(safe % 60).padStart(2, '0');
      }
      function sync() {
        if (progress && Number.isFinite(video.duration) && video.duration > 0) {
          progress.value = String(Math.round((video.currentTime / video.duration) * 1000));
        }
        if (time) time.textContent = formatTime(video.currentTime);
        if (playIcon) playIcon.textContent = video.paused ? '▶' : '❚❚';
        if (volume) volume.textContent = video.muted ? '🔇' : '🔊';
      }

      video.muted = true;
      play();
      listen.addEventListener('click', function () {
        video.muted = false;
        if (overlay) overlay.hidden = true;
        bodyActive(true);
        play();
        sync();
      });
      if (toggle) toggle.addEventListener('click', function () {
        if (video.paused) play(); else video.pause();
        bodyActive(true);
        sync();
      });
      if (volume) volume.addEventListener('click', function () {
        video.muted = !video.muted;
        if (!video.muted && overlay) overlay.hidden = true;
        bodyActive(true);
        sync();
      });
      if (progress) progress.addEventListener('input', function () {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = (Number(progress.value) / 1000) * video.duration;
        }
        sync();
      });
      if (fullscreen) fullscreen.addEventListener('click', function () {
        if (card.requestFullscreen) card.requestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      });
      video.addEventListener('timeupdate', sync);
      video.addEventListener('loadedmetadata', sync);
      video.addEventListener('play', sync);
      video.addEventListener('pause', sync);
      video.addEventListener('ended', function () { bodyActive(false); sync(); });
      video.addEventListener('error', function () { bodyActive(false); });
      sync();
    });
  }

  global.LumaniImpactCampaignMedia = {
    parseStory: parseStory,
    videoMarkup: videoMarkup,
    mountPlayers: mountPlayers,
    supportCount: supportCount
  };
})(typeof window !== 'undefined' ? window : this);
