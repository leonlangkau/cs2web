/**
 * Outgoing staff alerts over a Discord-compatible webhook.
 *
 * `SUPPORT_WEBHOOK_URL` is a secret, and it is the ONLY destination — the
 * URL is never taken from a request, so this can't be turned into an SSRF
 * gadget by a ticket body. Delivery is best effort with a hard timeout: an
 * unreachable Discord must never delay, let alone fail, the customer's
 * request that triggered it.
 *
 * The payload is plain Discord webhook JSON (`content` + one `embed`), which
 * Slack's and Guilded's Discord-compatible endpoints accept unchanged.
 */

const TIMEOUT_MS = 5000;

/** Discord's decimal embed colours, per alert kind. */
const COLORS = {
  ticket_new: 0x0137b7,
  ticket_urgent: 0xc01829,
  sla_breach: 0xc01829,
  ticket_escalated: 0x8a5a00,
  ticket_spam: 0x5b6884,
  chain_provider_down: 0xc01829,
};

const TITLES = {
  ticket_new: 'New support ticket',
  ticket_urgent: 'New URGENT support ticket',
  sla_breach: 'SLA breached — no first response',
  ticket_escalated: 'Ticket escalated',
  ticket_spam: 'Ticket flagged as spam',
  chain_provider_down: 'Chain provider is not answering',
};

/** Discord rejects an empty field value, so never send one. */
const field = (name, value, inline = true) => ({ name, value: String(value || '—').slice(0, 1000), inline });

/**
 * Posts one alert. Returns { ok, error? } and never throws.
 *
 * `fetcher` is injectable so tests assert on the payload without network.
 */
async function notifySupport(env, kind, data = {}, fetcher = fetch) {
  const url = String(env.SUPPORT_WEBHOOK_URL || '');
  if (!url) return { ok: false, error: 'not_configured' };
  if (!/^https:\/\//i.test(url)) {
    console.warn('SUPPORT_WEBHOOK_URL must be https — alert skipped');
    return { ok: false, error: 'insecure_url' };
  }

  const title = TITLES[kind] || 'Support update';
  // Ticket alerts share one set of labels; anything else says what it is. A
  // payments outage rendered under a heading reading "Ticket" and "Priority"
  // is worse than no alert, because it reads as somebody else's problem.
  const fields = Array.isArray(data.fields)
    ? data.fields.map((f) => field(f.name, f.value, f.inline !== false))
    : [
      field('Ticket', data.ref),
      field('Priority', data.priority),
      field('Category', data.category),
      field('From', data.requester),
    ];
  if (data.note) fields.push(field('Note', data.note, false));

  const payload = {
    username: 'GoyHub Support',
    content: kind === 'sla_breach' || kind === 'ticket_urgent' || kind === 'chain_provider_down'
      ? `**${title}** — ${data.ref || ''}`
      : undefined,
    embeds: [{
      title: `${title}: ${String(data.subject || '').slice(0, 200)}`,
      url: /^https:\/\//i.test(String(data.url || '')) ? data.url : undefined,
      color: COLORS[kind] ?? 0x0137b7,
      fields,
      footer: { text: 'GoyHub' },
    }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`support webhook rejected the alert (${res.status})`);
      return { ok: false, error: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.warn('support webhook failed:', err && err.message);
    return { ok: false, error: 'request_failed' };
  } finally {
    clearTimeout(timer);
  }
}

const isWebhookConfigured = (env = {}) => Boolean(env.SUPPORT_WEBHOOK_URL);

export { notifySupport, isWebhookConfigured };
