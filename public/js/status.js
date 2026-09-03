/* GoyHub status page: keep it current without a reload.

   The page is fully correct before this file runs — the server already
   decided every state, colour and pulse. All this adds is refreshing them in
   place, and flashing a row when one actually changes so a swap does not
   happen silently under someone's eyes.

   Polls /status.json, which is the same data the page was rendered from. */
(function () {
  'use strict';

  var hero = document.getElementById('status-hero');
  if (!hero) return;

  var headline = document.getElementById('status-headline');
  var checked = document.getElementById('status-checked');
  var live = document.getElementById('status-live');
  var container = document.getElementById('status-components');

  var TONE = {
    operational: 'ok',
    maintenance: 'info',
    degraded: 'warn',
    partial: 'warn',
    major: 'down'
  };
  var SHORT = {
    operational: 'Operational',
    maintenance: 'Maintenance',
    degraded: 'Degraded',
    partial: 'Partial outage',
    major: 'Major outage'
  };

  var lastChecked = Date.now();
  var failures = 0;
  var incidentCount = document.querySelectorAll('.incident-open').length;

  function relative(ms) {
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    return Math.round(m / 60) + 'h ago';
  }

  function tick() {
    if (checked) checked.textContent = relative(lastChecked);
  }
  setInterval(tick, 5000);

  /* Rebuilds one beacon in place. The rings only exist while a state is not
     operational, which is what makes the pulse mean something. */
  function paintBeacon(el, state) {
    var tone = TONE[state] || 'ok';
    var animate = tone !== 'ok';
    el.className = 'beacon beacon-' + tone + (animate ? ' beacon-live' : '');
    el.innerHTML = '<span class="beacon-dot"></span>'
      + (animate ? '<span class="beacon-ring"></span><span class="beacon-ring beacon-ring-2"></span>' : '');
  }

  function flash(row) {
    row.classList.remove('status-changed');
    // Force a reflow so the animation restarts if the row changes twice.
    void row.offsetWidth;
    row.classList.add('status-changed');
  }

  function applyOverall(data) {
    var tone = TONE[data.status] || 'ok';
    if (!hero.classList.contains('status-hero-' + tone)) {
      hero.className = 'status-hero status-hero-' + tone;
      flash(hero);
    }
    hero.setAttribute('data-status', data.status);
    if (headline && headline.textContent !== data.headline) headline.textContent = data.headline;
    var heroBeacon = hero.querySelector('.beacon');
    if (heroBeacon) paintBeacon(heroBeacon, data.status);
  }

  function applyComponents(data) {
    if (!container) return;
    var changed = false;
    var rows = {};
    container.querySelectorAll('[data-component]').forEach(function (el) {
      rows[el.getAttribute('data-component')] = el;
    });
    (data.components || []).forEach(function (component) {
      var row = rows[component.slug];
      if (!row) return;
      var label = row.querySelector('.status-component-state');
      if (!label || label.getAttribute('data-state') === component.status) return;

      label.setAttribute('data-state', component.status);
      label.textContent = SHORT[component.status] || component.status;
      label.className = 'status-component-state status-state-' + (TONE[component.status] || 'ok');
      var dot = row.querySelector('.beacon');
      if (dot) paintBeacon(dot, component.status);
      flash(row);
      changed = true;
    });
    return changed;
  }

  function poll() {
    fetch('/status.json', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.status) { failures += 1; return; }
        failures = 0;
        lastChecked = Date.now();
        if (live) live.hidden = false;
        tick();
        applyOverall(data);
        var componentsChanged = applyComponents(data);
        // A new or closed incident changes the prose, not just a chip, and
        // rebuilding that client-side would mean a second renderer to keep in
        // step with the server's. Reload instead — it is a status page, the
        // page IS the payload.
        if (data.incidents && data.incidents.length !== incidentCount) {
          window.location.reload();
        } else if (componentsChanged) {
          document.title = (data.status === 'operational' ? '' : '● ') + data.headline + ' · Status · GoyHub';
        }
      })
      .catch(function () { failures += 1; });
  }

  /* 30s while the tab is visible, immediate catch-up when it comes back, and
     a back-off after repeated failures so a broken connection does not turn
     into a retry storm. Slower than the chat on purpose: an outage is not a
     conversation, and this page is often left open for hours. */
  setInterval(function () {
    if (document.hidden) return;
    if (failures > 3 && failures % 4 !== 0) { failures += 1; return; }
    poll();
  }, 30000);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) poll();
  });

  tick();
})();
