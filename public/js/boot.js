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
