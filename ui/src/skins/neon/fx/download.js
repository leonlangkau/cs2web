const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12.6l4.8 4.9L19.5 6.5"/></svg>';

let toastEl = null;
let toastTimer = 0;

function dismissToast() {
  if (!toastEl) return;
  const el = toastEl;
  toastEl = null;
  window.clearTimeout(toastTimer);
  el.classList.add('is-out');
  window.setTimeout(() => el.remove(), 260);
}

function showToast(fileName) {
  dismissToast();
  const el = document.createElement('div');
  el.className = 'rb-toast';
  el.setAttribute('role', 'status');
  const icon = document.createElement('span');
  icon.className = 'rb-toast__icon';
  icon.innerHTML = CHECK; // static markup, no data inside
  const body = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'rb-toast__title';
  title.textContent = 'Download started';
  const text = document.createElement('div');
  text.className = 'rb-toast__body';
  text.textContent = fileName ? `${fileName} — check your browser downloads. ` : 'Check your browser downloads. ';
  const help = document.createElement('a');
  help.href = '/help';
  help.textContent = 'Install guide';
  text.appendChild(help);
  body.append(title, text);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'rb-toast__close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';
  close.addEventListener('click', dismissToast);
  el.append(icon, body, close);
  document.body.appendChild(el);
  toastEl = el;
  toastTimer = window.setTimeout(dismissToast, 8000);
}

let fileNameHint = '';
/** Lets the landing app tell the toast which file the visitor is getting. */
export const setDownloadName = (name) => { fileNameHint = name || ''; };

/**
 * Honest click choreography for every [data-download] link (delegated, so
 * links rendered later — e.g. the Stepper's final action — are covered):
 * the browser starts the download itself; we only reflect that it did.
 * Starting… -> Download started (+ toast) -> reset. No invented progress.
 */
export function initDownloads(root = document) {
  const onClick = (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-download]') : null;
    if (!btn || btn.classList.contains('is-busy') || btn.classList.contains('is-done')) return;
    const label = btn.querySelector('.dl-label, .nl-btn__label') || btn;
    const original = label.textContent;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    label.textContent = 'Starting…';
    window.setTimeout(() => {
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
      btn.classList.add('is-done');
      label.textContent = 'Download started';
      showToast(fileNameHint || btn.dataset.download || '');
      window.setTimeout(() => { if (btn.isConnected) { btn.classList.remove('is-done'); label.textContent = original; } }, 4000);
    }, 900);
  };
  root.addEventListener('click', onClick);
  return () => { root.removeEventListener('click', onClick); dismissToast(); };
}
