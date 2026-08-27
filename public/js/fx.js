/* GoyHub visual effects — vanilla ports of React Bits components
   (reactbits.dev): SplitText, DecryptedText, CountUp, SpotlightCard,
   ClickSpark, Magnet and the Particles hero background.

   Constraints this file honors:
   - CSP is `script-src 'self'; style-src 'self'` — no inline styles in markup;
     all per-element values go through the CSSOM (el.style.setProperty).
   - Everything is decoration on top of server-rendered HTML: with JS off the
     page is complete, with prefers-reduced-motion the effects stand down. */
(function () {
  'use strict';

  var reducedMotion = false;
  var hoverCapable = false;
  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch (e) { /* no matchMedia — motion allowed, hover effects off */ }

  /* Every effect below is wrapped in safe(). This file is one IIFE and it owns
     the reveals, which start at opacity 0 (.js .reveal in style.css) — so
     without this a throw in any single effect leaves the rest of the page's
     content permanently invisible instead of just dropping that one effect. */
  function safe(fn) {
    try {
      fn();
    } catch (err) {
      if (window.console && window.console.error) window.console.error('[goyhub fx]', err);
    }
  }

  /* Theme-aware colors for canvas work: read the palette from CSS custom
     properties so canvases follow the light/dark toggle. */
  function paletteVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  var themeListeners = [];
  safe(function () {
    new MutationObserver(function () {
      themeListeners.forEach(function (fn) { safe(fn); });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  });

  /* ---------- Reveal on scroll (React Bits AnimatedContent) ----------
     Containers marked data-stagger get cascading delays on their .reveal
     children; standalone .reveal elements animate individually. */
  safe(function () {
  // Disarms the boot.js watchdog: reveals are this file's responsibility.
  document.documentElement.setAttribute('data-reveal-ready', '1');
  document.querySelectorAll('[data-stagger]').forEach(function (group) {
    var step = parseInt(group.getAttribute('data-stagger'), 10) || 70;
    var children = group.querySelectorAll('.reveal');
    children.forEach(function (el, i) {
      el.style.setProperty('--reveal-delay', (i * step) + 'ms');
    });
  });

  // Once the rise-in finishes, the reveal classes come off entirely so the
  // element's own hover transitions (cards animate transform/border) aren't
  // overridden by the reveal animation or its stagger delay.
  function finishReveal(el) {
    var delay = parseInt(el.style.getPropertyValue('--reveal-delay'), 10) || 0;
    setTimeout(function () {
      el.classList.remove('reveal', 'visible');
      el.style.removeProperty('--reveal-delay');
    }, delay + 750);
  }

  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) {
        el.classList.add('visible');
        finishReveal(el);
      });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            finishReveal(entry.target);
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }
  });

  /* ---------- SplitText ----------
     Elements marked data-split get their text split into per-character spans
     that rise in with a stagger once visible. Markup stays server-rendered;
     the original text is preserved for assistive tech via aria-label. */
  function splitElement(root) {
    var label = root.textContent.replace(/\s+/g, ' ').trim();
    var charIndex = 0;

    function splitNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var frag = document.createDocumentFragment();
        var words = node.textContent.split(/(\s+)/);
        words.forEach(function (word) {
          if (!word) return;
          if (/^\s+$/.test(word)) {
            frag.appendChild(document.createTextNode(' '));
            return;
          }
          var w = document.createElement('span');
          w.className = 'split-word';
          for (var i = 0; i < word.length; i++) {
            var c = document.createElement('span');
            c.className = 'split-char';
            c.textContent = word[i];
            c.style.setProperty('--char-delay', (charIndex * 45) + 'ms');
            charIndex += 1;
            w.appendChild(c);
          }
          frag.appendChild(w);
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
        Array.prototype.slice.call(node.childNodes).forEach(splitNode);
      }
    }

    var wrap = document.createElement('span');
    wrap.className = 'split-inner';
    wrap.setAttribute('aria-hidden', 'true');
    while (root.firstChild) wrap.appendChild(root.firstChild);
    // Real text for assistive tech; the animated per-char copy is decorative.
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = label;
    root.appendChild(sr);
    root.appendChild(wrap);
    splitNode(wrap);
    // Two frames so the initial (hidden) state paints before the rise-in.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { root.classList.add('split-go'); });
    });
  }
  safe(function () {
    if (!reducedMotion) document.querySelectorAll('[data-split]').forEach(splitElement);
  });

  /* ---------- DecryptedText ----------
     Elements marked data-decrypt scramble through random glyphs and settle
     left-to-right, one character per 50ms tick (the React Bits cadence).
     Used for the hero kicker. */
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()_+';
  function decryptElement(el) {
    var target = el.textContent;
    // Real text for assistive tech; the scrambling copy is decorative.
    el.textContent = '';
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = target;
    var visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    el.appendChild(sr);
    el.appendChild(visual);
    var settled = 0;
    var last = 0;
    el.classList.add('decrypting');
    function tick(now) {
      if (now - last >= 50) {
        last = now;
        settled += 1;
        var out = target.slice(0, settled);
        for (var i = settled; i < target.length; i++) {
          out += target[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        visual.textContent = out;
      }
      if (settled < target.length) {
        requestAnimationFrame(tick);
      } else {
        el.classList.remove('decrypting');
      }
    }
    requestAnimationFrame(tick);
  }
  safe(function () {
  if (!reducedMotion && 'IntersectionObserver' in window) {
    var dio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          decryptElement(entry.target);
          dio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-decrypt]').forEach(function (el) { dio.observe(el); });
  }
  });

  /* ---------- CountUp ---------- */
  safe(function () {
  var counters = document.querySelectorAll('[data-count]');
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (reducedMotion || target === 0) { el.textContent = String(target); return; }
    var duration = 1600;
    var start = null;
    function tick(ts) {
      if (start === null) start = ts;
      var progress = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  if (counters.length) {
    if ('IntersectionObserver' in window) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            cio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { cio.observe(el); });
    } else {
      counters.forEach(animateCount);
    }
  }
  });

  /* ---------- SpotlightCard ----------
     A radial highlight follows the pointer across any .spotlight-card.
     One delegated listener, coordinates handed to CSS via custom properties. */
  safe(function () {
  if (hoverCapable && !reducedMotion) {
    var spotRaf = null;
    var spotPending = null;
    document.addEventListener('pointermove', function (e) {
      var card = e.target && e.target.closest && e.target.closest('.spotlight-card');
      if (!card) return;
      spotPending = { card: card, x: e.clientX, y: e.clientY };
      if (spotRaf) return;
      spotRaf = requestAnimationFrame(function () {
        spotRaf = null;
        var p = spotPending;
        if (!p) return;
        var rect = p.card.getBoundingClientRect();
        p.card.style.setProperty('--spot-x', (p.x - rect.left) + 'px');
        p.card.style.setProperty('--spot-y', (p.y - rect.top) + 'px');
        p.card.classList.add('spotlight-on');
      });
    }, { passive: true });
    document.addEventListener('pointerout', function (e) {
      var card = e.target && e.target.closest && e.target.closest('.spotlight-card');
      if (card && !(e.relatedTarget && card.contains(e.relatedTarget))) {
        card.classList.remove('spotlight-on');
        // Drop any queued update so a pending frame can't re-light the card.
        spotPending = null;
      }
    }, { passive: true });
  }
  });

  /* ---------- Magnet ----------
     Primary hero CTA gently pulls toward the cursor. */
  safe(function () {
  if (hoverCapable && !reducedMotion) {
    document.querySelectorAll('[data-magnet]').forEach(function (el) {
      var strength = 0.18;
      el.addEventListener('pointermove', function (e) {
        var rect = el.getBoundingClientRect();
        var dx = e.clientX - (rect.left + rect.width / 2);
        var dy = e.clientY - (rect.top + rect.height / 2);
        el.style.setProperty('--magnet-x', (dx * strength).toFixed(1) + 'px');
        el.style.setProperty('--magnet-y', (dy * strength).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--magnet-x', '0px');
        el.style.setProperty('--magnet-y', '0px');
      });
    });
  }
  });

  /* ---------- ClickSpark ----------
     Short accent strokes burst from every click. Canvas overlay, drawn only
     while sparks are alive. */
  safe(function () {
  if (!reducedMotion) {
    var sparkCanvas = document.createElement('canvas');
    sparkCanvas.className = 'click-spark-canvas';
    sparkCanvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(sparkCanvas);
    var sctx = sparkCanvas.getContext('2d');
    var sparks = [];
    var sparkRunning = false;
    var sparkColor = paletteVar('--fx-spark', '#4d7fff');
    themeListeners.push(function () { sparkColor = paletteVar('--fx-spark', '#4d7fff'); });

    function sizeSparkCanvas() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      sparkCanvas.width = Math.round(window.innerWidth * dpr);
      sparkCanvas.height = Math.round(window.innerHeight * dpr);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeSparkCanvas();
    window.addEventListener('resize', sizeSparkCanvas);

    document.addEventListener('click', function (e) {
      var now = performance.now();
      for (var i = 0; i < 8; i++) {
        sparks.push({ x: e.clientX, y: e.clientY, angle: (Math.PI * 2 * i) / 8, start: now });
      }
      if (!sparkRunning) { sparkRunning = true; requestAnimationFrame(drawSparks); }
    });

    // React Bits defaults: sparkRadius 15, sparkSize 10, 400ms, ease t(2-t)
    function drawSparks(now) {
      sctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      sparks = sparks.filter(function (s) { return now - s.start < 400; });
      sparks.forEach(function (s) {
        var t = (now - s.start) / 400;
        var eased = t * (2 - t);
        var dist = eased * 15;
        var len = 10 * (1 - eased);
        sctx.strokeStyle = sparkColor;
        sctx.globalAlpha = 1 - t;
        sctx.lineWidth = 2;
        sctx.lineCap = 'round';
        sctx.beginPath();
        sctx.moveTo(s.x + Math.cos(s.angle) * dist, s.y + Math.sin(s.angle) * dist);
        sctx.lineTo(s.x + Math.cos(s.angle) * (dist + len), s.y + Math.sin(s.angle) * (dist + len));
        sctx.stroke();
      });
      sctx.globalAlpha = 1;
      if (sparks.length) {
        requestAnimationFrame(drawSparks);
      } else {
        sparkRunning = false;
        sctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }
  }
  });

  /* ---------- Download choreography ----------
     The click is never intercepted: the browser downloads exactly as it would
     with JS off, and this only animates the button around it. No percentage is
     invented — a native download reports no bytes back, so the strip stays
     indeterminate and the wording is honest: "Starting…" in flight, then
     "Download started". The busy window doubles as a double-click guard, since
     a second click would spend one of the downloads an IP gets per window. */
  var downloadBtns = document.querySelectorAll('[data-download]');
  if (downloadBtns.length) {
    var DL_BUSY_MS = 1500;
    var DL_DONE_MS = 4200;
    var dlEscapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    var dlToastTimer = null;

    function dlEscape(v) {
      return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return dlEscapes[c]; });
    }

    function dlSwapLabel(btn, text) {
      var label = btn.querySelector('.dl-label');
      if (!label) return;
      if (reducedMotion) { label.textContent = text; return; }
      btn.classList.add('is-swapping');
      setTimeout(function () {
        label.textContent = text;
        btn.classList.remove('is-swapping');
      }, 160);
    }

    function dlShowToast(name) {
      var existing = document.querySelector('.dl-toast');
      if (existing) existing.remove();
      if (dlToastTimer) clearTimeout(dlToastTimer);

      var toast = document.createElement('div');
      toast.className = 'dl-toast';
      toast.setAttribute('role', 'status');
      toast.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.6l4.8 4.9L19.5 6.5"'
        + ' fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '<div><div class="dl-toast-title">Download started</div>'
        + '<div class="dl-toast-body">' + dlEscape(name) + ' — check your browser downloads. '
        + '<a href="/download">Verify the checksum</a> before installing.</div></div>'
        + '<button type="button" class="dl-toast-close" aria-label="Dismiss">\u2715</button>';

      function dismiss() {
        toast.classList.add('out');
        setTimeout(function () { toast.remove(); }, 300);
      }
      toast.querySelector('.dl-toast-close').addEventListener('click', dismiss);
      document.body.appendChild(toast);
      dlToastTimer = setTimeout(dismiss, 9000);
    }

    downloadBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        // CSS holds the button shut for the mouse; keyboard activation still lands here.
        if (btn.classList.contains('is-busy') || btn.classList.contains('is-done')) {
          e.preventDefault();
          return;
        }
        var label = btn.querySelector('.dl-label');
        var idle = label ? label.textContent : 'Download';
        var name = 'Your download';

        btn.classList.add('is-busy');
        btn.setAttribute('aria-busy', 'true');
        btn.setAttribute('aria-disabled', 'true');
        dlSwapLabel(btn, 'Starting\u2026');

        setTimeout(function () {
          btn.classList.remove('is-busy');
          btn.classList.add('is-done');
          btn.removeAttribute('aria-busy');
          dlSwapLabel(btn, 'Download started');
          dlShowToast(name);

          setTimeout(function () {
            btn.classList.remove('is-done');
            btn.removeAttribute('aria-disabled');
            dlSwapLabel(btn, idle);
          }, DL_DONE_MS);
        }, DL_BUSY_MS);
      });
    });
  }

  /* ---------- Hero visibility gate ----------
     The aurora and particle loops only draw while the hero is on screen
     and the tab is visible. */
  var heroVisible = true;
  safe(function () {
    var heroEl = document.querySelector('.hero');
    if (heroEl && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
      }, { threshold: 0 }).observe(heroEl);
    }
  });
  function heroActive() { return heroVisible && !document.hidden; }

  /* ---------- Aurora (React Bits) ----------
     Canvas-2D port of the WebGL aurora: a value-noise silhouette filled
     with a horizontal 3-stop gradient, faded vertically, two layers
     composited additively, rendered at 1/3 resolution and upscaled
     (the upscale doubles as the blur). ~30fps. */
  var auroraCanvas = document.getElementById('aurora-canvas');
  safe(function () {
    if (!auroraCanvas) return;
    (function () {
      var actx = auroraCanvas.getContext('2d');
      if (!actx) return;
      var off = document.createElement('canvas');
      var octx = off.getContext('2d');
      var aw = 0, ah = 0, ow = 0, oh = 0;
      var auroraColors = [];
      function readAuroraColors() {
        auroraColors = [
          paletteVar('--fx-aurora-a', '#2f5fe0'),
          paletteVar('--fx-aurora-b', '#7099ff'),
        ];
      }
      readAuroraColors();
      themeListeners.push(readAuroraColors);

      // Deterministic 1D value noise with smooth interpolation.
      function hash(n) {
        var s = Math.sin(n * 127.1) * 43758.5453;
        return s - Math.floor(s);
      }
      function vnoise(x) {
        var i = Math.floor(x);
        var f = x - i;
        var u = f * f * (3 - 2 * f);
        return hash(i) * (1 - u) + hash(i + 1) * u;
      }

      var auroraSized = false;
      function sizeAurora() {
        var rect = auroraCanvas.getBoundingClientRect();
        if (auroraSized && rect.width === aw && rect.height === ah) return false;
        auroraSized = true;
        aw = rect.width; ah = rect.height;
        auroraCanvas.width = Math.max(1, Math.round(aw));
        auroraCanvas.height = Math.max(1, Math.round(ah));
        ow = Math.max(1, Math.round(aw / 3));
        oh = Math.max(1, Math.round(ah / 3));
        off.width = ow; off.height = oh;
        return true;
      }
      sizeAurora();
      window.addEventListener('resize', function () {
        // Under reduced motion nothing is looping, so repaint the still frame.
        if (sizeAurora() && reducedMotion) renderAurora(STILL_T);
      });

      var lastAurora = 0;
      var STILL_T = 6.2;
      var N = 56;
      function drawAuroraLayer(t, seed, baseFrac, ampFrac, alpha) {
        var base = oh * baseFrac;
        var amp = oh * ampFrac;
        octx.beginPath();
        octx.moveTo(0, 0);
        octx.lineTo(0, base);
        for (var i = 0; i <= N; i++) {
          var x = (i / N) * ow;
          var n = vnoise(i * 0.18 + t * 0.12 + seed) * 0.65 + vnoise(i * 0.45 + t * 0.2 + seed * 2) * 0.35;
          octx.lineTo(x, base + (n - 0.5) * 2 * amp);
        }
        octx.lineTo(ow, 0);
        octx.closePath();
        var g = octx.createLinearGradient(0, 0, ow, 0);
        g.addColorStop(0, auroraColors[0]);
        g.addColorStop(0.5, auroraColors[1]);
        g.addColorStop(1, auroraColors[0]);
        octx.globalCompositeOperation = 'lighter';
        octx.globalAlpha = alpha;
        octx.fillStyle = g;
        octx.fill();
        octx.globalAlpha = 1;
      }
      function renderAurora(t) {
        octx.globalCompositeOperation = 'source-over';
        octx.clearRect(0, 0, ow, oh);
        drawAuroraLayer(t, 0, 0.5, 0.22, 0.5);
        drawAuroraLayer(t * 0.7, 7.3, 0.42, 0.18, 0.35);
        // Fade the curtain toward the top and hard-limit the bottom edge.
        octx.globalCompositeOperation = 'destination-in';
        var fade = octx.createLinearGradient(0, 0, 0, oh);
        fade.addColorStop(0, 'rgba(0,0,0,0)');
        fade.addColorStop(0.55, 'rgba(0,0,0,0.85)');
        fade.addColorStop(0.8, 'rgba(0,0,0,0.15)');
        fade.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = fade;
        octx.fillRect(0, 0, ow, oh);
        octx.globalCompositeOperation = 'source-over';
        actx.clearRect(0, 0, auroraCanvas.width, auroraCanvas.height);
        actx.drawImage(off, 0, 0, ow, oh, 0, 0, auroraCanvas.width, auroraCanvas.height);
      }

      if (reducedMotion) {
        // Motion is off. Paint the curtain once at a fixed point in the noise
        // field rather than skipping it: the hero keeps its background, it
        // just doesn't move.
        renderAurora(STILL_T);
        themeListeners.push(function () { renderAurora(STILL_T); });
        return;
      }

      function drawAurora(now) {
        requestAnimationFrame(drawAurora);
        if (!heroActive()) return;
        if (now - lastAurora < 33) return;
        lastAurora = now;
        renderAurora(now / 1000);
      }
      requestAnimationFrame(drawAurora);
    })();
  });

  /* ---------- Particles (hero background) ----------
     Constellation field: linked drifting points plus rising accent embers,
     with gentle cursor repulsion. Colors track the active theme. */
  safe(function () {
  var canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  var colors = {};
  function readParticleColors() {
    colors.link = paletteVar('--fx-link', '92, 116, 158');
    colors.dot = paletteVar('--fx-dot', '92, 116, 158');
    colors.ember = paletteVar('--fx-ember', '77, 127, 255');
  }
  readParticleColors();
  themeListeners.push(readParticleColors);

  var dpr = 1;
  var width = 0;
  var height = 0;
  var particles = [];
  var mouse = { x: -9999, y: -9999 };
  var LINK_DIST = 130;
  var resizeTimer = null;

  var sized = false;
  function resize() {
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var nextDpr = Math.min(2, window.devicePixelRatio || 1);
    // Mobile browsers fire resize when the URL bar collapses during scroll —
    // don't rebuild the field unless the canvas actually changed. `sized`
    // guarantees the first call initialises even when the hero measures 0x0.
    if (sized && w === width && h === height && nextDpr === dpr) return false;
    sized = true;
    width = w;
    height = h;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.min(110, Math.max(35, Math.round((width * height) / 16000)));
    particles = [];
    for (var i = 0; i < count; i++) particles.push(makeParticle(true));
    return true;
  }

  function scheduleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      // Under reduced motion nothing is looping, so repaint the still frame.
      if (resize() && reducedMotion) drawFrame(false);
    }, 150);
  }

  function makeParticle(anywhere) {
    var ember = Math.random() < 0.25;
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 10,
      vx: (Math.random() - 0.5) * 0.25,
      vy: ember ? -(0.2 + Math.random() * 0.5) : (Math.random() - 0.5) * 0.25,
      r: ember ? 1.2 + Math.random() * 1.8 : 0.8 + Math.random() * 1.4,
      ember: ember,
      alpha: 0.3 + Math.random() * 0.5,
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  var frame = 0;
  function drawFrame(animate) {
    ctx.clearRect(0, 0, width, height);
    if (animate) frame += 1;

    ctx.lineWidth = 1;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (p.ember) continue;
      for (var j = i + 1; j < particles.length; j++) {
        var q = particles[j];
        if (q.ember) continue;
        var dx = p.x - q.x;
        var dy = p.y - q.y;
        var dist2 = dx * dx + dy * dy;
        if (dist2 < LINK_DIST * LINK_DIST) {
          var a = (1 - Math.sqrt(dist2) / LINK_DIST) * 0.22;
          ctx.strokeStyle = 'rgba(' + colors.link + ',' + a.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }

    for (var k = 0; k < particles.length; k++) {
      var pt = particles[k];

      if (animate) {
        var mdx = pt.x - mouse.x;
        var mdy = pt.y - mouse.y;
        var mdist2 = mdx * mdx + mdy * mdy;
        if (mdist2 < 120 * 120 && mdist2 > 0.01) {
          var f = 26 / mdist2;
          pt.vx += mdx * f;
          pt.vy += mdy * f;
        }
        pt.vx = Math.max(-0.9, Math.min(0.9, pt.vx)) * 0.995;
        // Embers keep their upward drift but stay clamped so the cursor can't
        // fling them off-canvas permanently.
        pt.vy = pt.ember
          ? Math.max(-1.4, Math.min(1.4, pt.vy))
          : Math.max(-0.9, Math.min(0.9, pt.vy)) * 0.995;

        pt.x += pt.vx;
        pt.y += pt.vy;

        if (pt.ember && (pt.y < -12 || pt.y > height + 16)) {
          particles[k] = makeParticle(false);
          continue;
        }
        if (pt.x < -12) pt.x = width + 10;
        if (pt.x > width + 12) pt.x = -10;
        if (!pt.ember) {
          if (pt.y < -12) pt.y = height + 10;
          if (pt.y > height + 12) pt.y = -10;
        }
      }

      var flicker = animate ? 0.75 + 0.25 * Math.sin(frame * 0.03 + pt.twinkle) : 1;
      var alpha = (pt.alpha * flicker).toFixed(3);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fillStyle = pt.ember
        ? 'rgba(' + colors.ember + ',' + alpha + ')'
        : 'rgba(' + colors.dot + ',' + alpha + ')';
      ctx.fill();
    }
  }

  resize();
  // Window resize also catches a display-scaling change or a drag to a second
  // monitor, which alters devicePixelRatio without resizing the canvas box.
  window.addEventListener('resize', scheduleResize);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleResize).observe(canvas);

  if (reducedMotion) {
    // Motion is off (Windows "Animation effects", macOS "Reduce motion", or a
    // browser setting). Paint one still frame instead of bailing out.
    drawFrame(false);
    themeListeners.push(function () { drawFrame(false); });
    return;
  }

  canvas.parentElement.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.parentElement.addEventListener('mouseleave', function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  function draw() {
    requestAnimationFrame(draw);
    if (!heroActive()) return;
    drawFrame(true);
  }
  requestAnimationFrame(draw);
  });
})();
