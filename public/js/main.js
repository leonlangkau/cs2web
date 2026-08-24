/* AimHub frontend: hero reticle motion, scroll reveals, stat count-ups, confirms. */
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

  /* ---------- Scraper-resistant contact emails ---------- */
  document.querySelectorAll('.email-protect').forEach(function (a) {
    var u = a.getAttribute('data-u');
    var d = a.getAttribute('data-d');
    if (!u || !d) return;
    var addr = u + '@' + d;
    a.href = 'mailto:' + addr;
    a.textContent = addr;
  });

  /* ---------- Announcement banner (dismiss persists per message) ---------- */
  var announcement = document.getElementById('announcement');
  if (announcement) {
    var annText = announcement.textContent.trim();
    var annKey = 'gh-announcement-dismissed';
    var hash = 0;
    for (var ai = 0; ai < annText.length; ai++) {
      hash = ((hash << 5) - hash + annText.charCodeAt(ai)) | 0;
    }
    var annHash = String(hash);
    try {
      if (localStorage.getItem(annKey) === annHash) announcement.remove();
    } catch (e) { /* storage blocked — banner just stays visible */ }
    var dismissBtn = document.getElementById('announcement-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        announcement.remove();
        try { localStorage.setItem(annKey, annHash); } catch (e) { /* ignore */ }
      });
    }
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

    var STAFF_TIERS = { developer: 1, trial_admin: 1, admin: 1 };
    function renderShout(s) {
      var row = document.createElement('div');
      row.className = 'shout-row';
      row.setAttribute('data-id', s.id);
      var staffTag = STAFF_TIERS[s.author_tier] ? ' <span class="tag tag-admin">STAFF</span>' : '';
      var del = '';
      if (shoutbox.getAttribute('data-staff') === '1') {
        del = '<form method="post" action="/forum/shouts/' + encodeURIComponent(s.id)
          + '/delete" class="inline-form shout-del-form" data-confirm="Delete this shout?">'
          + '<input type="hidden" name="_csrf" value="' + escapeHtml(shoutbox.getAttribute('data-csrf') || '') + '">'
          + '<button class="shout-del" type="submit" aria-label="Delete shout">\u2715</button></form>';
      }
      row.innerHTML = '<span class="shout-user">' + escapeHtml(s.username) + staffTag + '</span>'
        + '<span class="shout-body">' + escapeHtml(s.body) + '</span>'
        + '<span class="shout-time muted">just now</span>'
        + del;
      return row;
    }

    // Open the box scrolled to the newest message, like a chat window.
    if (shoutList) shoutList.scrollTop = shoutList.scrollHeight;

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

    // "Live" via fast polling — 5s while the tab is visible, paused when
    // hidden (with an immediate catch-up poll when the tab comes back).
    setInterval(function () {
      if (!document.hidden) pollShouts();
    }, 5000);
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

  /* ---------- Hero reticle: one-shot settle + pointer parallax ---------- */
  var heroVisual = document.getElementById('hero-visual');
  if (!heroVisual) return;
  var reticle = heroVisual.querySelector('.reticle');
  if (!reticle) return;

  if (reducedMotion) {
    reticle.classList.add('settled');
    return;
  }

  // Settle on the next frame so the transition from the initial state runs.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { reticle.classList.add('settled'); });
  });

  // Light parallax toward the pointer, fine pointers only. The transform is
  // written once per frame from the latest pointer position (no layout reads).
  if (!window.matchMedia('(pointer: fine)').matches) return;
  var hero = document.getElementById('hero');
  if (!hero) return;

  var targetX = 0;
  var targetY = 0;
  var currentX = 0;
  var currentY = 0;
  var rafId = null;
  var MAX_SHIFT = 10; // px

  function step() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    heroVisual.style.transform = 'translate3d(' + currentX.toFixed(2) + 'px,' + currentY.toFixed(2) + 'px,0)';
    if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.05) {
      rafId = requestAnimationFrame(step);
    } else {
      rafId = null;
    }
  }
  function nudge() {
    if (rafId === null) rafId = requestAnimationFrame(step);
  }

  hero.addEventListener('pointermove', function (e) {
    var rect = hero.getBoundingClientRect();
    targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2 * MAX_SHIFT;
    targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2 * MAX_SHIFT;
    nudge();
  });
  hero.addEventListener('pointerleave', function () {
    targetX = 0;
    targetY = 0;
    nudge();
  });
})();
