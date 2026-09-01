/* GoyHub visual effects — vanilla ports of React Bits components
   (reactbits.dev): SplitText, DecryptedText, CountUp, SpotlightCard,
   ClickSpark, Magnet and the Particles hero background — plus the
   site-wide kill-feed rain (matrix rain drawn with CS2 icons).

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

  /* ---------- Specular tracking (SpotlightCard, generalised) ----------
     Glass gets its "wet" look from a highlight that moves as you move.
     Every pane on the site takes one: the pointer position is handed to
     CSS as --spot-x/--spot-y and the pane's ::before film parks a radial
     smear there. With no pointer the smear rests off the top edge, which
     is where a fixed overhead light would put it.

     One delegated listener for the whole document, and the closest()
     walk happens INSIDE the animation frame rather than on every
     pointermove — the selector list is long, and a mouse can fire it a
     few hundred times a second. */
  var GLASS_PANES = [
    '.spotlight-card', '.lg-pane', '.nav-inner', '.panel', '.feature-card',
    '.recent-thread', '.category-card', '.thread-row', '.post', '.reply-box',
    '.auth-card', '.forum-sidebar', '.hud-card', '.download-box', '.faq-item',
    '.plan-card', '.stat-card', '.support-step', '.csat', '.status-hero',
    '.status-components', '.incident', '.status-note', '.legal-toc',
    '.legal-contact', '.legal-summary', '.try-first', '.terms-gate-card',
    '.code-block', '.empty-state', '.switch-note', '.upgrade-note',
    '.admin-tabs', '.component-picker', '.pay-details', '.help-card'
  ].join(',');

  safe(function () {
  if (hoverCapable && !reducedMotion) {
    var spotRaf = null;
    var spotPending = null;
    var lit = null;

    function unlight() {
      if (!lit) return;
      lit.classList.remove('spotlight-on');
      lit.style.removeProperty('--spot-x');
      lit.style.removeProperty('--spot-y');
      lit = null;
    }

    document.addEventListener('pointermove', function (e) {
      spotPending = { target: e.target, x: e.clientX, y: e.clientY };
      if (spotRaf) return;
      spotRaf = requestAnimationFrame(function () {
        spotRaf = null;
        var p = spotPending;
        spotPending = null;
        if (!p) return;
        var pane = p.target && p.target.closest ? p.target.closest(GLASS_PANES) : null;
        if (pane !== lit) unlight();
        if (!pane) return;
        var rect = pane.getBoundingClientRect();
        pane.style.setProperty('--spot-x', (p.x - rect.left).toFixed(1) + 'px');
        pane.style.setProperty('--spot-y', (p.y - rect.top).toFixed(1) + 'px');
        pane.classList.add('spotlight-on');
        lit = pane;
      });
    }, { passive: true });

    // Pointer left the window (or was cancelled by a gesture): park the
    // highlight back at rest rather than leaving it stranded mid-pane.
    document.addEventListener('pointerleave', function () {
      spotPending = null;
      unlight();
    }, { passive: true });
    document.addEventListener('pointercancel', function () {
      spotPending = null;
      unlight();
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

  /* ---------- Kill-feed rain (matrix rain, CS2 icon set) ----------
     A site-wide fall of Counter-Strike kill-feed marks — crosshairs,
     headshots, flashbangs, grenades, bullets — down a fixed grid, each
     column led by a lit head that fades into a trail behind it.

     Two things make it cheap enough to run under every page:
     - The icons are vector paths rasterised ONCE into a sprite atlas per
       tint (trail / head / hot / hot head) at device resolution, so a frame
       is nothing but drawImage calls at 1:1 pixels.
     - Glyphs are pinned to grid cells and only their alpha moves, so no
       per-cell transform or path work happens in the loop.

     The canvas is transparent (no fade-to-black fill): the trail is drawn
     explicitly cell by cell so the ambient field on body::before keeps
     showing through underneath. */
  safe(function () {
  var rainCanvas = document.getElementById('rain-canvas');
  if (!rainCanvas) return;
  var rctx = rainCanvas.getContext && rainCanvas.getContext('2d');
  if (!rctx) return;

  var TAU = Math.PI * 2;

  /* ---- Icon painters. Each fills a 24x24 box in solid white; buildAtlas
     tints the result. Cut-outs use destination-out, which only ever reaches
     pixels inside the icon's own atlas cell. ---- */

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  // Path points are transformed by the CTM as they are added, so building
  // under a scale and filling after restore() fills the ellipse correctly.
  function ellipse(g, cx, cy, rx, ry, rot) {
    g.save();
    g.translate(cx, cy);
    if (rot) g.rotate(rot);
    g.scale(rx, ry);
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    g.restore();
    g.fill();
  }

  function star(g, cx, cy, outer, inner, points) {
    g.beginPath();
    for (var i = 0; i < points * 2; i++) {
      var r = (i % 2) ? inner : outer;
      var a = (i / (points * 2)) * TAU - Math.PI / 2;
      var x = cx + Math.cos(a) * r;
      var y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }

  var ICONS = [
    // Crosshair — the default four-line cross with a centre dot.
    { w: 5, draw: function (g) {
      g.lineWidth = 2.1;
      g.beginPath();
      g.moveTo(12, 1.6); g.lineTo(12, 8.4);
      g.moveTo(12, 15.6); g.lineTo(12, 22.4);
      g.moveTo(1.6, 12); g.lineTo(8.4, 12);
      g.moveTo(15.6, 12); g.lineTo(22.4, 12);
      g.stroke();
      g.beginPath(); g.arc(12, 12, 1.3, 0, TAU); g.fill();
    } },

    // Crosshair — scoped ring with outer ticks.
    { w: 4, draw: function (g) {
      g.lineWidth = 1.7;
      g.beginPath(); g.arc(12, 12, 7.4, 0, TAU); g.stroke();
      g.beginPath();
      g.moveTo(12, 1.0); g.lineTo(12, 5.4);
      g.moveTo(12, 18.6); g.lineTo(12, 23.0);
      g.moveTo(1.0, 12); g.lineTo(5.4, 12);
      g.moveTo(18.6, 12); g.lineTo(23.0, 12);
      g.stroke();
      g.beginPath(); g.arc(12, 12, 1.5, 0, TAU); g.fill();
    } },

    // Crosshair — corner brackets closing on a target dot.
    { w: 3, draw: function (g) {
      g.lineWidth = 1.9;
      var b = 4.6, o = 3.0;
      g.beginPath();
      g.moveTo(o, o + b); g.lineTo(o, o); g.lineTo(o + b, o);
      g.moveTo(24 - o - b, o); g.lineTo(24 - o, o); g.lineTo(24 - o, o + b);
      g.moveTo(24 - o, 24 - o - b); g.lineTo(24 - o, 24 - o); g.lineTo(24 - o - b, 24 - o);
      g.moveTo(o + b, 24 - o); g.lineTo(o, 24 - o); g.lineTo(o, 24 - o - b);
      g.stroke();
      g.beginPath(); g.arc(12, 12, 1.7, 0, TAU); g.fill();
    } },

    // Headshot — masked head, impact star at the temple, round coming in.
    { w: 3, hot: true, draw: function (g) {
      g.beginPath();
      g.moveTo(11.6, 2.2);
      g.bezierCurveTo(16.2, 2.2, 19.4, 5.6, 19.4, 10.2);
      g.bezierCurveTo(19.4, 12.6, 18.2, 14.0, 18.0, 15.8);
      g.bezierCurveTo(17.7, 19.0, 15.8, 21.8, 12.6, 21.8);
      g.bezierCurveTo(9.4, 21.8, 7.8, 19.6, 7.2, 17.2);
      g.bezierCurveTo(6.6, 14.8, 4.4, 13.4, 4.4, 10.0);
      g.bezierCurveTo(4.4, 5.2, 7.4, 2.2, 11.6, 2.2);
      g.closePath();
      g.fill();

      g.globalCompositeOperation = 'destination-out';
      star(g, 9.8, 7.2, 3.3, 1.25, 8);
      ellipse(g, 9.6, 12.6, 2.1, 1.45, -0.12);
      ellipse(g, 14.8, 12.4, 1.25, 1.0, -0.12);
      ellipse(g, 13.2, 17.0, 1.6, 2.1, 0.22);
      g.globalCompositeOperation = 'source-over';

      g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(23.0, 3.4); g.lineTo(19.8, 5.3); g.stroke();
      g.beginPath();
      g.moveTo(18.4, 6.1); g.lineTo(20.72, 6.3); g.lineTo(19.36, 3.98);
      g.closePath(); g.fill();
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(22.0, 0.9); g.lineTo(22.6, 2.4);
      g.moveTo(23.9, 1.6); g.lineTo(23.2, 2.8);
      g.moveTo(23.9, 4.6); g.lineTo(22.9, 4.3);
      g.stroke();
    } },

    // Flashbang — banded cylinder, spoon, and the pop going off beside it.
    { w: 3, hot: true, draw: function (g) {
      roundRect(g, 8.6, 9.4, 6.8, 11.4, 2.2); g.fill();
      roundRect(g, 9.6, 6.2, 4.8, 3.4, 1.1); g.fill();
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(14.6, 7.0); g.lineTo(17.4, 8.2); g.lineTo(17.0, 12.2);
      g.stroke();
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(6.8, 6.6); g.lineTo(4.0, 4.2);
      g.moveTo(5.8, 10.2); g.lineTo(2.4, 9.6);
      g.moveTo(8.2, 3.9); g.lineTo(7.0, 1.2);
      g.moveTo(16.6, 4.6); g.lineTo(18.8, 2.4);
      g.stroke();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(8.6, 13.2, 6.8, 1.3);
      g.fillRect(8.6, 16.6, 6.8, 1.3);
      g.globalCompositeOperation = 'source-over';
    } },

    // HE grenade — pineapple body, spoon and pulled pin.
    { w: 3, draw: function (g) {
      g.beginPath(); g.arc(11.4, 14.6, 6.0, 0, TAU); g.fill();
      roundRect(g, 9.6, 6.6, 3.8, 3.0, 1.0); g.fill();
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(13.4, 7.2); g.lineTo(16.6, 8.8); g.lineTo(16.2, 13.4);
      g.stroke();
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(18.2, 5.4, 2.1, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(16.3, 6.2); g.lineTo(13.6, 7.4); g.stroke();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(5.6, 12.8); g.lineTo(17.2, 12.8);
      g.moveTo(5.6, 16.0); g.lineTo(17.2, 16.0);
      g.moveTo(8.9, 9.2); g.lineTo(8.9, 20.4);
      g.moveTo(13.2, 10.0); g.lineTo(13.2, 20.4);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    } },

    // Smoke grenade — canister under three puffs.
    { w: 2, draw: function (g) {
      roundRect(g, 9.4, 12.6, 5.6, 8.6, 1.8); g.fill();
      roundRect(g, 10.4, 10.4, 3.6, 2.6, 0.9); g.fill();
      g.beginPath(); g.arc(7.8, 6.6, 2.7, 0, TAU); g.fill();
      g.beginPath(); g.arc(11.6, 4.6, 3.3, 0, TAU); g.fill();
      g.beginPath(); g.arc(15.4, 6.2, 2.9, 0, TAU); g.fill();
      g.beginPath(); g.arc(12.4, 8.2, 2.6, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(9.4, 15.8, 5.6, 1.3);
      g.globalCompositeOperation = 'source-over';
    } },

    // Round in flight — cartridge falling tip-down.
    { w: 5, draw: function (g) {
      g.beginPath();
      g.moveTo(8.8, 13.6);
      g.bezierCurveTo(9.2, 17.6, 10.6, 20.4, 12.0, 22.4);
      g.bezierCurveTo(13.4, 20.4, 14.8, 17.6, 15.2, 13.6);
      g.closePath(); g.fill();
      roundRect(g, 8.6, 4.4, 6.8, 9.4, 1.0); g.fill();
      roundRect(g, 7.9, 1.8, 8.2, 2.9, 1.0); g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.fillRect(8.6, 13.1, 6.8, 0.9);
      g.fillRect(7.9, 4.6, 8.2, 0.9);
      g.globalCompositeOperation = 'source-over';
    } },

    // Bullet hole — impact with spalling cracks.
    { w: 4, draw: function (g) {
      g.beginPath(); g.arc(12, 12, 4.0, 0, TAU); g.fill();
      g.lineWidth = 1.9;
      g.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * TAU + 0.3;
        var r0 = 4.1 + (i % 2) * 0.5;
        var r1 = r0 + 1.9 + (i % 3) * 1.4;
        g.moveTo(12 + Math.cos(a) * r0, 12 + Math.sin(a) * r0);
        g.lineTo(12 + Math.cos(a) * r1, 12 + Math.sin(a) * r1);
      }
      g.stroke();
    } },

    // Skull — the kill mark itself.
    { w: 2, hot: true, draw: function (g) {
      g.beginPath();
      g.moveTo(4.6, 11.6);
      g.bezierCurveTo(4.6, 5.6, 7.9, 2.4, 12.0, 2.4);
      g.bezierCurveTo(16.1, 2.4, 19.4, 5.6, 19.4, 11.6);
      g.bezierCurveTo(19.4, 14.6, 17.8, 16.4, 16.4, 17.2);
      g.lineTo(16.4, 20.2);
      g.bezierCurveTo(16.4, 21.0, 15.9, 21.4, 15.1, 21.4);
      g.lineTo(8.9, 21.4);
      g.bezierCurveTo(8.1, 21.4, 7.6, 21.0, 7.6, 20.2);
      g.lineTo(7.6, 17.2);
      g.bezierCurveTo(6.2, 16.4, 4.6, 14.6, 4.6, 11.6);
      g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-out';
      ellipse(g, 9.1, 11.4, 2.5, 2.8, 0);
      ellipse(g, 14.9, 11.4, 2.5, 2.8, 0);
      g.beginPath();
      g.moveTo(12, 14.4); g.lineTo(10.5, 17.2); g.lineTo(13.5, 17.2);
      g.closePath(); g.fill();
      g.fillRect(9.5, 18.8, 1.3, 3.0);
      g.fillRect(11.4, 18.8, 1.3, 3.0);
      g.fillRect(13.3, 18.8, 1.3, 3.0);
      g.globalCompositeOperation = 'source-over';
    } },

    // Knife.
    { w: 2, draw: function (g) {
      g.beginPath();
      g.moveTo(7.4, 16.2);
      g.lineTo(20.8, 2.8);
      g.bezierCurveTo(20.2, 7.6, 17.2, 12.4, 12.6, 16.0);
      g.bezierCurveTo(11.6, 16.8, 10.6, 17.6, 9.6, 18.4);
      g.closePath(); g.fill();
      g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(8.0, 17.6); g.lineTo(3.4, 22.2); g.stroke();
      g.lineWidth = 1.7;
      g.beginPath(); g.moveTo(5.9, 15.7); g.lineTo(10.3, 20.1); g.stroke();
    } },

    // C4 — the other way a round ends.
    { w: 2, hot: true, draw: function (g) {
      roundRect(g, 4.4, 7.8, 15.2, 11.2, 2.0); g.fill();
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(16.6, 7.8); g.lineTo(18.8, 3.6); g.stroke();
      g.beginPath(); g.arc(19.2, 2.6, 1.3, 0, TAU); g.fill();
      g.globalCompositeOperation = 'destination-out';
      roundRect(g, 6.4, 9.8, 6.4, 3.8, 0.8); g.fill();
      for (var row = 0; row < 2; row++) {
        for (var col = 0; col < 3; col++) {
          g.beginPath();
          g.arc(7.6 + col * 2.4, 15.6 + row * 2.0, 0.8, 0, TAU);
          g.fill();
        }
      }
      g.fillRect(14.4, 10.6, 4.2, 1.0);
      g.fillRect(14.4, 13.0, 4.2, 1.0);
      g.fillRect(14.4, 15.4, 4.2, 1.0);
      g.globalCompositeOperation = 'source-over';
    } },
  ];

  // Weighted draw bag: crosshairs and rounds carry the field, the loud
  // marks (headshot, flashbang, C4) stay occasional so they still land.
  var BAG = [];
  var HOT_BAG = [];
  ICONS.forEach(function (icon, i) {
    for (var n = 0; n < icon.w; n++) BAG.push(i);
    if (icon.hot) HOT_BAG.push(i);
  });
  function pickIcon() { return BAG[(Math.random() * BAG.length) | 0]; }
  function pickHotIcon() { return HOT_BAG[(Math.random() * HOT_BAG.length) | 0]; }

  /* ---- Sprite atlas ---- */

  var colors = {};
  function readRainColors() {
    colors.trail = paletteVar('--fx-rain', '#5c8cff');
    colors.head = paletteVar('--fx-rain-head', '#cfe0ff');
    colors.hot = paletteVar('--fx-rain-hot', '#ff6b7a');
    colors.hotHead = paletteVar('--fx-rain-hot-head', '#ffd8d2');
  }

  var atlas = {};
  var cellPx = 0;

  function buildAtlas(color, glow) {
    var sheet = document.createElement('canvas');
    sheet.width = cellPx * ICONS.length;
    sheet.height = cellPx;
    var g = sheet.getContext('2d');
    var draw = cellPx * 0.72;
    var pad = (cellPx - draw) / 2;
    var scale = draw / 24;
    for (var i = 0; i < ICONS.length; i++) {
      g.save();
      g.translate(i * cellPx + pad, pad);
      g.scale(scale, scale);
      g.lineWidth = 1.8;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = '#fff';
      g.fillStyle = '#fff';
      ICONS[i].draw(g);
      g.restore();
    }
    // Recolour the white silhouette in one pass, keeping its alpha.
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, sheet.width, sheet.height);
    g.globalCompositeOperation = 'source-over';
    if (!glow) return sheet;

    // Head sprites carry their bloom baked in — a per-frame shadowBlur would
    // cost far more than the one-off blur here.
    var lit = document.createElement('canvas');
    lit.width = sheet.width;
    lit.height = sheet.height;
    var lg = lit.getContext('2d');
    lg.shadowColor = color;
    lg.shadowBlur = Math.max(2, cellPx * 0.11);
    lg.drawImage(sheet, 0, 0);
    lg.drawImage(sheet, 0, 0);
    lg.shadowBlur = 0;
    lg.drawImage(sheet, 0, 0);
    return lit;
  }

  function buildAtlases() {
    readRainColors();
    atlas.trail = buildAtlas(colors.trail, false);
    atlas.head = buildAtlas(colors.head, true);
    atlas.hot = buildAtlas(colors.hot, false);
    atlas.hotHead = buildAtlas(colors.hotHead, true);
  }

  /* ---- Grid ---- */

  var rdpr = 1, rwidth = 0, rheight = 0, cell = 0, cols = 0, rows = 0;
  var streams = [];
  var rainSized = false;
  var rainResizeTimer = null;

  function seedStream(stream, fresh) {
    stream.speed = 2.4 + Math.random() * 6.4;          // rows per second
    stream.len = 9 + Math.round(Math.random() * 13);
    stream.alpha = 0.52 + Math.random() * 0.48;
    // A tenth of the columns run hot: the kill marks in the site's danger
    // colour instead of its accent.
    stream.hot = Math.random() < 0.1;
    stream.y = fresh
      ? Math.random() * (rows + stream.len)
      : -stream.len - Math.random() * rows * 0.4;
    for (var r = 0; r < stream.glyphs.length; r++) {
      stream.glyphs[r] = stream.hot ? pickHotIcon() : pickIcon();
    }
  }

  function sizeRain() {
    var w = Math.max(1, Math.round(rainCanvas.clientWidth || window.innerWidth));
    var h = Math.max(1, Math.round(rainCanvas.clientHeight || window.innerHeight));
    var nextDpr = Math.min(2, window.devicePixelRatio || 1);
    if (rainSized && w === rwidth && h === rheight && nextDpr === rdpr) return false;
    rainSized = true;
    rwidth = w; rheight = h; rdpr = nextDpr;
    rainCanvas.width = Math.round(w * rdpr);
    rainCanvas.height = Math.round(h * rdpr);
    rctx.setTransform(rdpr, 0, 0, rdpr, 0, 0);

    cell = w < 620 ? 30 : 36;
    cols = Math.ceil(w / cell);
    rows = Math.ceil(h / cell) + 1;
    cellPx = Math.round(cell * rdpr);
    buildAtlases();

    streams = [];
    for (var c = 0; c < cols; c++) {
      var stream = { glyphs: new Uint8Array(rows + 2) };
      seedStream(stream, true);
      streams.push(stream);
    }
    return true;
  }

  function drawRain(dt) {
    rctx.clearRect(0, 0, rwidth, rheight);
    for (var c = 0; c < cols; c++) {
      var stream = streams[c];
      if (dt) {
        stream.y += stream.speed * dt;
        if (stream.y - stream.len > rows) { seedStream(stream, false); continue; }
        // Glyph churn: the same cell shows a different mark next pass.
        if (Math.random() < 0.09) {
          var m = (Math.random() * stream.glyphs.length) | 0;
          stream.glyphs[m] = stream.hot ? pickHotIcon() : pickIcon();
        }
      }
      var trail = stream.hot ? atlas.hot : atlas.trail;
      var lit = stream.hot ? atlas.hotHead : atlas.head;
      var top = Math.floor(stream.y);
      var frac = stream.y - top;
      var x = c * cell;
      for (var i = 0; i < stream.len; i++) {
        var r = top - i;
        if (r < 0) break;
        if (r >= rows) continue;
        var a = i === 0
          // The head fades up as it crosses into its cell, so a mark lights
          // rather than pops.
          ? stream.alpha * (0.35 + 0.65 * frac)
          : stream.alpha * Math.pow(1 - (i + frac) / stream.len, 1.7);
        if (a <= 0.012) break;
        rctx.globalAlpha = a;
        rctx.drawImage(
          i === 0 ? lit : trail,
          stream.glyphs[r] * cellPx, 0, cellPx, cellPx,
          x, r * cell, cell, cell
        );
      }
    }
    rctx.globalAlpha = 1;
  }

  sizeRain();

  function scheduleRainResize() {
    if (rainResizeTimer) clearTimeout(rainResizeTimer);
    rainResizeTimer = setTimeout(function () {
      // Under reduced motion nothing is looping, so repaint the still frame.
      if (sizeRain() && reducedMotion) drawRain(0);
    }, 150);
  }
  window.addEventListener('resize', scheduleRainResize);

  if (reducedMotion) {
    drawRain(0);
    themeListeners.push(function () { buildAtlases(); drawRain(0); });
    return;
  }
  themeListeners.push(buildAtlases);

  var lastRain = 0;
  function rainFrame(now) {
    requestAnimationFrame(rainFrame);
    if (document.hidden) { lastRain = 0; return; }
    if (!lastRain) { lastRain = now; return; }
    var dt = (now - lastRain) / 1000;
    if (dt < 0.032) return;      // ~30fps is plenty for a backdrop
    lastRain = now;
    // Clamped: a tab that was throttled or backgrounded must not teleport
    // the whole field forward on its first frame back.
    drawRain(Math.min(dt, 0.05));
  }
  requestAnimationFrame(rainFrame);
  });
})();
