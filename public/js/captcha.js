/* GoyHub proof-of-work CAPTCHA widget.
   Self-contained SHA-256 so it works outside a secure context (crypto.subtle
   is unavailable over plain http), and solves in yielded chunks so the page
   never freezes. */
(function () {
  'use strict';

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      } else if (c < 0xd800 || c >= 0xe000) {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      } else {
        i++;
        c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
    }
    return out;
  }

  /** Returns the 8-word SHA-256 state for the given byte array. */
  function sha256Words(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
    var bitLenLo = (bytes.length * 8) >>> 0;

    var padded = bytes.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    padded.push((bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255, (bitLenHi >>> 8) & 255, bitLenHi & 255);
    padded.push((bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255, (bitLenLo >>> 8) & 255, bitLenLo & 255);

    var w = new Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] = (padded[off + i * 4] << 24) | (padded[off + i * 4 + 1] << 16)
          | (padded[off + i * 4 + 2] << 8) | padded[off + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
        var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H;
  }

  function sha256hex(str) {
    var H = sha256Words(utf8Bytes(str));
    var hex = '';
    for (var i = 0; i < 8; i++) {
      var part = (H[i] >>> 0).toString(16);
      while (part.length < 8) part = '0' + part;
      hex += part;
    }
    return hex;
  }

  /** True when the digest of `nonce:counter` starts with `difficulty` zero bits. */
  function meetsDifficulty(nonce, counter, difficulty) {
    var first = sha256Words(utf8Bytes(nonce + ':' + counter))[0];
    return (first >>> (32 - difficulty)) === 0;
  }

  // Exposed so the test suite can check this matches Node's SHA-256.
  window.__goyhubSha256 = sha256hex;

  function init(box) {
    var form = box.closest('form');
    if (!form) return;

    var tokenField = form.querySelector('input[name="captcha_token"]');
    var solutionField = form.querySelector('input[name="captcha_solution"]');
    var submitBtn = form.querySelector('button[type="submit"]');
    if (!tokenField || !solutionField) return;

    var status = document.createElement('div');
    status.className = 'captcha-status';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'captcha-trigger';
    trigger.setAttribute('aria-describedby', 'captcha-status-text');

    var mark = document.createElement('span');
    mark.className = 'captcha-mark';
    mark.setAttribute('aria-hidden', 'true');

    var label = document.createElement('span');
    label.textContent = "I'm not a bot";

    trigger.appendChild(mark);
    trigger.appendChild(label);

    var text = document.createElement('span');
    text.className = 'captcha-text muted';
    text.id = 'captcha-status-text';
    text.setAttribute('role', 'status');
    text.textContent = box.getAttribute('data-captcha-idle')
      || 'Verification required before you can sign up.';

    status.appendChild(trigger);
    status.appendChild(text);
    box.appendChild(status);

    var state = 'idle';
    if (submitBtn) submitBtn.disabled = true;

    function setState(next, message) {
      state = next;
      box.dataset.state = next;
      text.textContent = message;
    }

    trigger.addEventListener('click', function () {
      if (state === 'working' || state === 'done') return;
      setState('working', 'Requesting challenge…');
      trigger.disabled = true;

      fetch('/captcha/challenge', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
        .then(function (res) {
          if (!res.ok) throw new Error('challenge request failed');
          return res.json();
        })
        .then(function (challenge) { solve(challenge); })
        .catch(function () {
          trigger.disabled = false;
          setState('error', "Couldn't reach the verification service. Try again.");
        });
    });

    function solve(challenge) {
      var counter = 0;
      var started = Date.now();
      var CHUNK = 1500;

      function step() {
        for (var i = 0; i < CHUNK; i++) {
          if (meetsDifficulty(challenge.nonce, counter, challenge.difficulty)) {
            tokenField.value = challenge.token;
            solutionField.value = String(counter);
            if (submitBtn) submitBtn.disabled = false;
            setState('done', box.getAttribute('data-captcha-done') || 'Verified. You can sign up now.');
            return;
          }
          counter++;
        }
        var seconds = ((Date.now() - started) / 1000).toFixed(1);
        setState('working', 'Verifying you’re human… ' + counter.toLocaleString() + ' attempts, ' + seconds + 's');
        setTimeout(step, 0);
      }
      step();
    }
  }

  document.querySelectorAll('[data-captcha]').forEach(init);
})();
