/**
 * Crypto primitives built only on Web Crypto (globalThis.crypto.subtle), so the
 * exact same code runs on Node 22 and on the Cloudflare Workers runtime.
 *
 * Node's scrypt is unavailable in Workers, so passwords use PBKDF2-HMAC-SHA256.
 * Raise PBKDF2_ITERATIONS where your CPU budget allows — note that Workers Free
 * caps CPU at 10ms per request, which a very high iteration count can exceed.
 */

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();

const DEFAULT_ITERATIONS = 100_000;

function iterations() {
  const raw = Number(globalThis.PBKDF2_ITERATIONS_OVERRIDE);
  return Number.isFinite(raw) && raw >= 1000 ? Math.floor(raw) : DEFAULT_ITERATIONS;
}

function toB64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromB64(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toHex(bytes) {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function randomBytes(length) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** Cryptographically random hex token. */
function newToken(bytes = 32) {
  return toHex(randomBytes(bytes));
}

async function derive(password, salt, rounds) {
  const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    key,
    256
  );
  return new Uint8Array(bits);
}

/** Hash a password with a random per-user salt. */
async function hashPassword(password) {
  const rounds = iterations();
  const salt = randomBytes(16);
  const hash = await derive(password, salt, rounds);
  return `pbkdf2$${rounds}$${toB64(salt)}$${toB64(hash)}`;
}

/** Length-independent constant-time comparison of two byte arrays. */
function timingSafeEqualBytes(a, b) {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** Constant-time verification of a password against a stored hash. */
async function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const rounds = Number(parts[1]);
    if (!Number.isFinite(rounds) || rounds < 1000) return false;
    const salt = fromB64(parts[2]);
    const expected = fromB64(parts[3]);
    const actual = await derive(password, salt, rounds);
    return timingSafeEqualBytes(actual, expected);
  } catch {
    return false;
  }
}

async function sha256hex(value) {
  const digest = await subtle.digest('SHA-256', encoder.encode(String(value)));
  return toHex(new Uint8Array(digest));
}

async function hmacHex(secret, message) {
  const key = await subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(new Uint8Array(signature));
}

/** Constant-time comparison of two strings. */
function safeEqual(a, b) {
  return timingSafeEqualBytes(encoder.encode(String(a)), encoder.encode(String(b)));
}

export {
  newToken, randomBytes, toHex,
  hashPassword, verifyPassword,
  sha256hex, hmacHex, safeEqual, timingSafeEqualBytes,
};
