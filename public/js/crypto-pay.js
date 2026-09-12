/* GoyHub crypto payment page: copy buttons, a live status poll and the quote
   countdown.

   Notes that constrain how this is written:
   - CSP is `script-src 'self'` with no inline scripts, so everything this needs
     comes from data- attributes on the markup rather than an injected blob.
   - The page is fully usable with this file blocked or broken. The amount, the
     address and the current status are all server-rendered; this only saves the
     buyer from refreshing.
   - When the state actually changes, the page is RELOADED rather than patched.
     A crypto payment page has one job and getting it subtly wrong (showing
     "confirmed" when the server disagrees) is worse than a flicker, so the
     server's rendering stays the only rendering. State changes are rare enough
     that this costs nothing. */
(function () {
  'use strict';

  /* ---------- Copy buttons ---------- */

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Older browsers, and any context where the async clipboard is unavailable.
    return new Promise(function (resolve, reject) {
      var field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.className = 'sr-only';
      document.body.appendChild(field);
      field.select();
      try {
        if (document.execCommand('copy')) resolve(); else reject(new Error('copy rejected'));
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(field);
      }
    });
  }

  document.querySelectorAll('.pay-copy').forEach(function (button) {
    var original = button.textContent;
    var timer = null;
    button.addEventListener('click', function () {
      copyText(button.getAttribute('data-copy') || '').then(function () {
        button.textContent = 'Copied';
        button.classList.add('pay-copied');
      }, function () {
        // Copying failed — say so instead of pretending. The value is on screen
        // and selectable either way.
        button.textContent = 'Select it';
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        button.textContent = original;
        button.classList.remove('pay-copied');
      }, 1800);
    });
  });

  var panel = document.querySelector('[data-pay-poll]');
  if (!panel) return;

  /* ---------- Quote countdown ---------- */

  var expiresAt = Number(panel.getAttribute('data-pay-expires')) || 0;
  var credited = panel.getAttribute('data-pay-credited') === '1';
  var countdown = document.getElementById('pay-countdown');

  function renderCountdown() {
    if (!countdown || credited || !expiresAt) return;
    var left = Math.floor((expiresAt - Date.now()) / 1000);
    if (left <= 0) {
      countdown.textContent = 'This quote has expired.';
      return;
    }
    var minutes = Math.floor(left / 60);
    var seconds = left % 60;
    countdown.textContent = 'Quote held for another '
      + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  }
  renderCountdown();
  if (!credited) setInterval(renderCountdown, 1000);

  /* ---------- Status poll ---------- */

  if (credited) return;

  var url = panel.getAttribute('data-pay-poll');
  var signature = null;
  var failures = 0;
  /* Start responsive, then ease off: somebody who just hit Send is watching,
     somebody who left the tab open for an hour is not. The scan behind this
     endpoint is throttled server-side anyway, so polling never storms it. */
  var delay = 6000;
  var started = Date.now();
  var MAX_WATCH_MS = 60 * 60 * 1000;

  function poll() {
    if (Date.now() - started > MAX_WATCH_MS) return;

    fetch(url, { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        failures = 0;
        if (!data || !data.ok) return;

        var next = [data.status, data.credited, data.confirmations, data.txHash, data.expired].join('|');
        if (signature !== null && next !== signature) {
          // Something moved — let the server re-render it.
          window.location.reload();
          return;
        }
        signature = next;

        // Ease the poll out over the first few minutes.
        var age = Date.now() - started;
        delay = age > 10 * 60 * 1000 ? 30000 : (age > 2 * 60 * 1000 ? 12000 : 6000);
        setTimeout(poll, delay);
      })
      .catch(function () {
        // Offline, rate-limited or a blip. Back off rather than hammering; the
        // payment is unaffected either way.
        failures += 1;
        setTimeout(poll, Math.min(60000, delay * Math.pow(2, Math.min(failures, 4))));
      });
  }

  setTimeout(poll, 2500);
}());
