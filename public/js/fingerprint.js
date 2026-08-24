/* Reports a coarse device/browser fingerprint to /api/fingerprint once per
   browser session (tab), feeding the admin panel's Fingerprints log. This is
   a background beacon, not a page feature — it never touches the DOM and
   fails silently if fetch, canvas or storage are unavailable. */
(function () {
  'use strict';

  if (!window.fetch) return;

  var SENT_KEY = 'gh-fp-sent';
  try {
    if (sessionStorage.getItem(SENT_KEY)) return;
  } catch (e) { /* storage blocked (private mode) — send anyway, just every page load */ }

  function detectDevice() {
    var ua = navigator.userAgent || '';
    var touch = (navigator.maxTouchPoints || 0) > 1;
    if (/iPad/i.test(ua) || (touch && /Macintosh/i.test(ua)) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablet';
    if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  function detectBrowser() {
    var ua = navigator.userAgent || '';
    var m;
    if ((m = ua.match(/Edg\/([\d.]+)/))) return 'Edge ' + m[1];
    if ((m = ua.match(/OPR\/([\d.]+)/))) return 'Opera ' + m[1];
    if ((m = ua.match(/Firefox\/([\d.]+)/))) return 'Firefox ' + m[1];
    if ((m = ua.match(/Chrome\/([\d.]+)/))) return 'Chrome ' + m[1];
    if ((m = ua.match(/Version\/([\d.]+).*Safari/))) return 'Safari ' + m[1];
    if (/Safari\//.test(ua)) return 'Safari';
    return 'Unknown';
  }

  function detectOS() {
    var ua = navigator.userAgent || '';
    if (/Windows NT 10\.0/.test(ua)) return 'Windows 10/11';
    if (/Windows NT/.test(ua)) return 'Windows';
    if (/Android ([\d.]+)/.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }

  function canvasFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 220;
      canvas.height = 30;
      var ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 220, 30);
      ctx.fillStyle = '#069';
      ctx.fillText('AimHub fp ⚔ 0123', 2, 2);
      ctx.strokeStyle = 'rgba(102,204,0,0.7)';
      ctx.beginPath();
      ctx.arc(50, 15, 10, 0, Math.PI * 2);
      ctx.stroke();
      var data = canvas.toDataURL();
      // Non-cryptographic hash — this is a coarse device signal, not a security token.
      var hash = 0;
      for (var i = 0; i < data.length; i++) {
        hash = (hash << 5) - hash + data.charCodeAt(i);
        hash |= 0;
      }
      return String(hash);
    } catch (e) {
      return '';
    }
  }

  function timezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch (e) {
      return '';
    }
  }

  var payload = {
    device: detectDevice(),
    browser: detectBrowser(),
    os: detectOS(),
    screen: [screen.width, screen.height, screen.colorDepth || ''].join('x'),
    language: navigator.language || (navigator.languages && navigator.languages[0]) || '',
    timezone: timezone(),
    canvasHash: canvasFingerprint(),
  };

  fetch('/api/fingerprint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  }).then(function () {
    try { sessionStorage.setItem(SENT_KEY, '1'); } catch (e) { /* ignore */ }
  }).catch(function () { /* offline/blocked — next page load in this session retries */ });
})();
