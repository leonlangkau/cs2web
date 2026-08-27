/* Marks the document as JS-capable before first paint. The reveal-on-scroll
   hidden state is scoped to .js so content stays visible when scripts don't run.
   Theme is resolved here too (not in main.js, which loads deferred) so the
   dark/light attribute is set before the page paints — no flash of the wrong theme. */
document.documentElement.classList.add('js');
(function () {
  try {
    var stored = localStorage.getItem('gh-theme');
    var theme = (stored === 'dark' || stored === 'light')
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* localStorage blocked (private mode, etc.) — CSS still falls back to prefers-color-scheme */ }
})();

/* Reveal watchdog. `.js .reveal { opacity: 0 }` is only safe while fx.js is
   guaranteed to run — if it is blocked by an extension or filter, 404s from a
   stale cache, or dies on the network, every revealed element (hero copy, CTAs,
   stats, feature cards) stays invisible and the page looks empty. fx.js sets
   data-reveal-ready as its first act; if that hasn't happened shortly after
   load, unhide everything unconditionally. */
(function () {
  var disarm = function () {
    if (!document.documentElement.hasAttribute('data-reveal-ready')) {
      document.documentElement.classList.add('reveal-failsafe');
    }
  };
  window.setTimeout(disarm, 2500);
  window.addEventListener('load', function () { window.setTimeout(disarm, 500); });
})();
