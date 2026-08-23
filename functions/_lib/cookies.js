/**
 * Cookie helpers with the same signatures the app used from hono/cookie, so the
 * middleware and route code did not have to change when the framework was
 * dropped. Cookies are stashed on c.__setCookies and flushed to Set-Cookie
 * headers by the response builder in app.js.
 */

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getCookie(c, name) {
  if (!c.__cookies) c.__cookies = parseCookies(c.req.header('cookie'));
  return c.__cookies[name];
}

function serialize(name, value, opts = {}) {
  let str = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) str += `; Max-Age=${Math.floor(opts.maxAge)}`;
  str += `; Path=${opts.path || '/'}`;
  if (opts.httpOnly !== false && opts.httpOnly !== undefined) {
    if (opts.httpOnly) str += '; HttpOnly';
  } else if (opts.httpOnly === undefined) {
    str += '; HttpOnly';
  }
  if (opts.sameSite) str += `; SameSite=${opts.sameSite}`;
  if (opts.secure) str += '; Secure';
  return str;
}

function setCookie(c, name, value, opts = {}) {
  (c.__setCookies ||= []).push(serialize(name, value, opts));
}

function deleteCookie(c, name, opts = {}) {
  (c.__setCookies ||= []).push(serialize(name, '', { ...opts, maxAge: 0 }));
}

export { getCookie, setCookie, deleteCookie, parseCookies };
