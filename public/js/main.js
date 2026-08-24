/* GoyHub frontend: hero particle canvas, scroll reveals, stat count-ups, confirms. */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme toggle ---------- */
  var themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('gh-theme', next); } catch (e) { /* private mode — theme just won't persist */ }
    });
  }

  /* ---------- Auto-dismiss flash messages ---------- */
  var flash = document.querySelector('.flash');
  if (flash) {
    setTimeout(function () {
      flash.classList.add('flash-out');
      setTimeout(function () { flash.remove(); }, 400);
    }, 5000);
  }

  /* ---------- Shoutbox: poll for new messages, post via fetch ---------- */
  var shoutbox = document.getElementById('shoutbox');
  if (shoutbox) {
    var shoutList = document.getElementById('shout-list');
    var shoutForm = document.getElementById('shout-form');
    var lastShoutId = parseInt(shoutbox.getAttribute('data-last-id'), 10) || 0;
    var shoutEscapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    var escapeHtml = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) { return shoutEscapes[c]; });
    };

    function renderShout(s) {
      var row = document.createElement('div');
      row.className = 'shout-row';
      row.setAttribute('data-id', s.id);
      var staff = s.author_role === 'admin' ? ' <span class="tag tag-admin">STAFF</span>' : '';
      row.innerHTML = '<span class="shout-user">' + escapeHtml(s.username) + staff + '</span>'
        + '<span class="shout-body">' + escapeHtml(s.body) + '</span>'
        + '<span class="shout-time muted">just now</span>';
      return row;
    }

    function pollShouts() {
      fetch('/forum/shoutbox?after=' + lastShoutId, { headers: { 'X-Requested-With': 'fetch' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.shouts || !data.shouts.length) return;
          var empty = shoutList.querySelector('.shout-empty');
          if (empty) empty.remove();
          data.shouts.forEach(function (s) {
            shoutList.appendChild(renderShout(s));
            lastShoutId = s.id;
          });
          // Cap the DOM list so a tab left open all day doesn't grow forever.
          while (shoutList.children.length > 40) shoutList.removeChild(shoutList.firstChild);
          shoutList.scrollTop = shoutList.scrollHeight;
        })
        .catch(function () { /* offline or blocked — next poll just retries */ });
    }

    setInterval(pollShouts, 15000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pollShouts();
    });

    if (shoutForm) {
      shoutForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = shoutForm.querySelector('input[name="body"]');
        if (!input.value.trim()) return;
        var btn = shoutForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        fetch('/forum/shoutbox', {
          method: 'POST',
          headers: { 'X-Requested-With': 'fetch' },
          body: new FormData(shoutForm),
        })
          .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              input.value = '';
              pollShouts();
            } else {
              window.alert((result.data && result.data.error) || 'Could not post — try again.');
            }
          })
          .catch(function () { window.alert('Network error — try again.'); })
          .then(function () { btn.disabled = false; input.focus(); });
      });
    }
  }

  /* ---------- Confirm dialogs for destructive forms ---------- */
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form && form.hasAttribute && form.hasAttribute('data-confirm')) {
      if (!window.confirm(form.getAttribute('data-confirm'))) {
        e.preventDefault();
      }
    }
  });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach(function (el) { el.classList.add('visible'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      revealEls.forEach(function (el) { io.observe(el); });
    }
  }

  /* ---------- Count-up stats ---------- */
  var counters = document.querySelectorAll('[data-count]');
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (reducedMotion || target === 0) { el.textContent = String(target); return; }
    var duration = 1400;
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

  /* ---------- Hero particle canvas ---------- */
  var canvas = document.getElementById('hero-canvas');
  if (!canvas || reducedMotion) return;
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var dpr = 1;
  var width = 0;
  var height = 0;
  var particles = [];
  var mouse = { x: -9999, y: -9999 };
  var LINK_DIST = 130;
  var resizeTimer = null;

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var nextDpr = Math.min(2, window.devicePixelRatio || 1);
    // Mobile browsers fire resize when the URL bar collapses during scroll —
    // don't rebuild the field unless the canvas actually changed.
    if (rect.width === width && rect.height === height && nextDpr === dpr) return;
    width = rect.width;
    height = rect.height;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var count = Math.min(110, Math.max(35, Math.round((width * height) / 16000)));
    particles = [];
    for (var i = 0; i < count; i++) particles.push(makeParticle(true));
  }

  function scheduleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
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

  canvas.parentElement.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.parentElement.addEventListener('mouseleave', function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  var frame = 0;
  function draw() {
    ctx.clearRect(0, 0, width, height);
    frame += 1;

    // Links between nearby cool particles
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
          ctx.strokeStyle = 'rgba(1, 55, 183,' + a.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }

    for (var k = 0; k < particles.length; k++) {
      var pt = particles[k];

      // Gentle repulsion from the cursor
      var mdx = pt.x - mouse.x;
      var mdy = pt.y - mouse.y;
      var mdist2 = mdx * mdx + mdy * mdy;
      if (mdist2 < 120 * 120 && mdist2 > 0.01) {
        var f = 26 / mdist2;
        pt.vx += mdx * f;
        pt.vy += mdy * f;
      }
      pt.vx = Math.max(-0.9, Math.min(0.9, pt.vx)) * 0.995;
      // Embers keep their upward drift but are still clamped so the cursor
      // can't fling them off-canvas permanently.
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

      var flicker = 0.75 + 0.25 * Math.sin(frame * 0.03 + pt.twinkle);
      var alpha = (pt.alpha * flicker).toFixed(3);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      // Signal particles carry the brand blue; the linked network sits back in slate.
      ctx.fillStyle = pt.ember
        ? 'rgba(1, 55, 183,' + alpha + ')'
        : 'rgba(92, 116, 158,' + alpha + ')';
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', scheduleResize);
  requestAnimationFrame(draw);
})();
