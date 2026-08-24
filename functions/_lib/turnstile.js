/**
 * Cloudflare Turnstile — Cloudflare's free CAPTCHA — as an OPTIONAL second
 * bot gate on signup, layered on top of the built-in proof-of-work check.
 *
 * Enable by setting both env values (Cloudflare dashboard → Turnstile →
 * Add site, then Pages → Settings → Variables and Secrets):
 *   TURNSTILE_SITE_KEY    public, rendered into the signup page
 *   TURNSTILE_SECRET_KEY  secret, used server-side to verify tokens
 *
 * With either unset, nothing renders and nothing is enforced — the
 * proof-of-work captcha remains the (always-on) first layer.
 */

function isTurnstileConfigured(env = {}) {
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
}

/** Server-side verification of the widget's response token. Never throws. */
async function verifyTurnstile(env, token, ip, fetcher = fetch) {
  if (!isTurnstileConfigured(env)) return { ok: true, skipped: true };
  if (!token) return { ok: false, error: 'missing_token' };
  try {
    const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: String(token).slice(0, 2048),
        remoteip: ip,
      }),
    });
    const data = await res.json();
    return data.success ? { ok: true } : { ok: false, error: (data['error-codes'] || []).join(',') || 'failed' };
  } catch (err) {
    // Fail CLOSED on signup: if Cloudflare is unreachable we'd rather delay a
    // signup than wave bots through while the second gate is down.
    console.error('turnstile verify threw:', err);
    return { ok: false, error: 'unreachable' };
  }
}

export { isTurnstileConfigured, verifyTurnstile };
