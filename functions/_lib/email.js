/**
 * Outbound email.
 *
 * Cloudflare Workers/Pages cannot speak raw SMTP (outbound port 25 is
 * blocked, and Cloudflare's Email Routing is inbound-only), so transactional
 * mail goes out through an HTTP email API instead. The provider is chosen by
 * env so it can be switched without a code change:
 *
 *   EMAIL_PROVIDER  "resend" | "sendgrid" | "mailchannels" | "test" | unset
 *   EMAIL_API_KEY   the provider's API key (not needed for mailchannels/test)
 *   EMAIL_FROM      e.g. no-reply@goyhub.com — must be a sender the provider
 *                   has verified for your domain (SPF/DKIM), or mail lands in
 *                   spam or is rejected outright
 *   EMAIL_FROM_NAME optional display name, defaults to GoyHub
 *
 * With nothing configured, isEmailConfigured() is false and features that
 * need email (password reset, verification) degrade with honest messaging
 * instead of pretending to send. The "test" provider records messages on
 * globalThis.__testEmails for the test suite.
 */

function isEmailConfigured(env = {}) {
  const provider = String(env.EMAIL_PROVIDER || '').toLowerCase();
  if (!provider) return false;
  if (provider === 'test') return true;
  if (provider === 'mailchannels') return Boolean(env.EMAIL_FROM);
  return Boolean(env.EMAIL_API_KEY && env.EMAIL_FROM);
}

/**
 * Sends one plain-text email. Returns { ok, error? } and never throws —
 * a failed side-channel email must not 500 the request that triggered it.
 */
async function sendEmail(env, { to, subject, text }, fetcher = fetch) {
  const provider = String(env.EMAIL_PROVIDER || '').toLowerCase();
  const from = String(env.EMAIL_FROM || 'no-reply@goyhub.local');
  const fromName = String(env.EMAIL_FROM_NAME || 'GoyHub');

  try {
    if (!isEmailConfigured(env)) {
      console.warn(`email disabled — would have sent "${subject}" to ${to}`);
      return { ok: false, error: 'not_configured' };
    }

    if (provider === 'test') {
      globalThis.__testEmails = globalThis.__testEmails || [];
      globalThis.__testEmails.push({ to, subject, text });
      return { ok: true };
    }

    let res;
    if (provider === 'resend') {
      res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, text }),
      });
    } else if (provider === 'sendgrid') {
      res = await fetcher('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from, name: fromName },
          subject,
          content: [{ type: 'text/plain', value: text }],
        }),
      });
    } else if (provider === 'mailchannels') {
      res = await fetcher('https://api.mailchannels.net/tx/v1/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.EMAIL_API_KEY ? { 'X-Api-Key': env.EMAIL_API_KEY } : {}),
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from, name: fromName },
          subject,
          content: [{ type: 'text/plain', value: text }],
        }),
      });
    } else {
      return { ok: false, error: `unknown provider "${provider}"` };
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      console.error(`email send failed (${provider} ${res.status}): ${detail}`);
      return { ok: false, error: `provider_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('email send threw:', err);
    return { ok: false, error: 'exception' };
  }
}

export { sendEmail, isEmailConfigured };
