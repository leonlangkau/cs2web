import { createRoot } from 'react-dom/client';

/**
 * Mounts a React tree into `host`, replacing its server-rendered children
 * (the no-JS fallback). Returns the root so the caller can unmount.
 */
export function mountInto(host, element) {
  if (!host) return null;
  host.setAttribute('data-rb-root', '1');
  const root = createRoot(host);
  root.render(element);
  return root;
}

/**
 * Mounts a React tree into a fresh element appended to `parent` (default
 * <body>). Used for overlays: cursors, backgrounds, docks, toasts.
 */
export function mountOverlay(element, { parent = document.body, className = '', id = '' } = {}) {
  const host = document.createElement('div');
  if (className) host.className = className;
  if (id) host.id = id;
  host.setAttribute('data-rb-root', '1');
  parent.appendChild(host);
  const root = createRoot(host);
  root.render(element);
  return { host, root };
}

/**
 * Mounts a React tree into a fresh element inserted as the first child of
 * `parent` — for backgrounds that must sit behind the page content.
 */
export function mountBehind(element, parent, { className = '', id = '' } = {}) {
  const host = document.createElement('div');
  if (className) host.className = className;
  if (id) host.id = id;
  host.setAttribute('data-rb-root', '1');
  host.setAttribute('aria-hidden', 'true');
  parent.insertBefore(host, parent.firstChild);
  const root = createRoot(host);
  root.render(element);
  return { host, root };
}
