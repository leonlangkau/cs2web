/**
 * The direct-to-wallet payment page.
 *
 * The buyer has to reproduce one exact number and one exact address, and both
 * are unforgiving: a wrong address loses the money outright, and an amount off
 * by a digit is what tells us WHICH order was paid, so getting it wrong means
 * the payment lands in an admin queue instead of upgrading the account. So the
 * page is built around making those two values impossible to get wrong — big,
 * monospaced, one-click copyable, with a QR and a wallet deep link for phones —
 * and around saying, unmissably, which network to send on.
 *
 * Everything live (confirmations arriving, the membership being granted) is
 * driven by public/js/crypto-pay.js polling the status endpoint. The page is
 * fully usable without it: the same information is in the server-rendered
 * markup, and a plain refresh advances it.
 */
import { page } from "./layout.js";
import { esc, map, emailLink } from "./util.js";
import { planDuration } from "../plans.js";
import { qrSvg } from "../qr.js";

/** One value the buyer must reproduce exactly, with a copy button. */
function copyRow(label, value, { mono = true, hint = '' } = {}) {
  return `<div class="pay-field">
    <div class="pay-field-head">
      <span class="pay-field-label">${esc(label)}</span>
      ${hint ? `<span class="pay-field-hint">${esc(hint)}</span>` : ''}
    </div>
    <div class="pay-field-body">
      <code class="pay-value${mono ? ' mono' : ''}">${esc(value)}</code>
      <button type="button" class="btn btn-outline btn-sm pay-copy" data-copy="${esc(value)}"
        aria-label="Copy ${esc(label)}">Copy</button>
    </div>
  </div>`;
}

/**
 * The headline state. Each one has to answer the only question the buyer
 * actually has — is my money safe, and do I need to do anything?
 */
function statusBlock(order) {
  if (order.credited) {
    return `<div class="flash flash-success pay-status" data-pay-state="credited">
      <strong>Payment confirmed.</strong> Your account is now <strong>Paid</strong> — everything is unlocked.
    </div>
    <p><a class="btn btn-primary" href="/profile">Go to your profile</a>
      <a class="btn btn-ghost" href="/download">Download the app</a></p>`;
  }
  if (order.txHash && order.confirmations < order.needed) {
    return `<div class="flash flash-success pay-status" data-pay-state="confirming">
      <strong>Payment received — confirming.</strong> ${esc(order.confirmations)} of
      ${esc(order.needed)} confirmations. Your membership is applied automatically the moment it
      confirms; you can close this page.
    </div>`;
  }
  if (order.txHash) {
    return `<div class="flash flash-success pay-status" data-pay-state="seen">
      <strong>Payment received.</strong> Finishing up — this page updates itself.
    </div>`;
  }
  if (order.expired) {
    return `<div class="flash flash-error pay-status" data-pay-state="expired">
      <strong>This quote has expired.</strong> Exchange rates move, so the amount below is no longer
      guaranteed. Start a new payment for a fresh quote — but if you have <em>already sent</em> the
      exact amount below, don't send it again: it is still watched for and will still be credited.
    </div>
    <p><a class="btn btn-primary" href="/buy">Get a fresh quote</a></p>`;
  }
  return `<div class="pay-status pay-status-waiting" data-pay-state="waiting" role="status">
    <span class="pay-spinner" aria-hidden="true"></span>
    <span>Waiting for your payment. This page updates on its own — no need to refresh.</span>
  </div>
  <p class="fineprint" id="pay-countdown"></p>`;
}

function payPage(ctx, { order }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const symbol = order.symbol;

  // A QR is worth real estate here: it is how somebody at a desktop pays from
  // the wallet on their phone without retyping 42 characters.
  const qr = order.uri ? qrSvg(order.uri, { size: 200, title: `Pay ${order.amount} ${symbol}` }) : '';

  const amountBlock = copyRow(`Amount (${symbol})`, order.amount, {
    hint: 'send this exact amount',
  });
  const addressBlock = copyRow('To this address', order.address);

  const received = order.received && !order.credited
    ? `<p class="pay-received">Received so far: <strong>${esc(order.received)} ${esc(symbol)}</strong>${
      order.shortfall ? ` — <span class="muted">${esc(order.shortfall)} ${esc(symbol)} short</span>` : ''}</p>`
    : '';

  const txLink = order.txHash
    ? `<p class="fineprint">Transaction
        <code class="mono">${esc(String(order.txHash).slice(0, 24))}…</code>
        ${order.explorer ? `<a href="${esc(order.explorer)}" rel="noopener nofollow" target="_blank">view on explorer</a>` : ''}</p>`
    : '';

  const stillOpen = !order.credited;

  const submitTx = stillOpen ? `
    <details class="pay-details">
      <summary>Already sent it and nothing has happened?</summary>
      <p class="muted">Payments are usually picked up within a minute or two. If yours hasn't been,
        paste the transaction hash from your wallet and we'll go and look at it directly.</p>
      <form method="post" action="/pay/${esc(order.orderId)}/tx" class="stack panel-form">
        ${csrf}
        <label for="txid">Transaction hash</label>
        <input type="text" id="txid" name="txid" maxlength="128" autocomplete="off" spellcheck="false"
          class="mono" placeholder="${esc(order.asset && order.asset.chain === 'solana' ? '5Kd3…' : '0x…')}" required>
        <button class="btn btn-outline" type="submit">Check this transaction</button>
      </form>
    </details>` : '';

  const cancel = stillOpen && !order.txHash ? `
    <form method="post" action="/pay/${esc(order.orderId)}/cancel" class="inline-form"
      data-confirm="Cancel this payment? Only do this if you have not sent anything.">
      ${csrf}<button class="btn btn-ghost btn-sm" type="submit">Cancel this payment</button>
    </form>` : '';

  // The single most expensive mistake a buyer can make, said before the numbers
  // rather than after them.
  const networkWarning = `<p class="pay-network">
    <strong>Network: ${esc(order.network)}.</strong>
    Send <strong>${esc(symbol)}</strong> on this network only — a transfer sent on a different
    network goes to an address nobody controls and cannot be recovered by anyone.</p>`;

  const body = `
<div class="section pay-page">
  <div class="container narrow">
    <h1 class="section-title">Pay ${esc(order.amount)} ${esc(symbol)}</h1>
    <p class="pay-subtitle muted">${esc(order.planName || 'Paid membership')}
      · ${esc(planDuration(order.periodDays))}
      · ${esc(order.fiat)} at ${esc(order.rate)} ${esc(order.fiat.split(' ')[1] || '')}/${esc(symbol)}</p>

    <div class="panel profile-card pay-panel"
      data-pay-poll="/pay/${esc(order.orderId)}/status"
      data-pay-expires="${esc(order.expiresAt)}"
      data-pay-credited="${order.credited ? '1' : '0'}">
      ${statusBlock(order)}
      ${received}
      ${txLink}
    </div>

    <div class="panel profile-card pay-panel">
      ${networkWarning}
      <div class="pay-grid">
        <div class="pay-fields">
          ${amountBlock}
          ${addressBlock}
          ${order.uri ? `<p class="fineprint"><a class="btn btn-outline btn-sm" href="${esc(order.uri)}">Open in a wallet app</a></p>` : ''}
        </div>
        ${qr ? `<figure class="pay-qr">${qr}<figcaption class="fineprint">Scan with a wallet app</figcaption></figure>` : ''}
      </div>
      <p class="fineprint">The amount is unique to this order — it is how we know the payment is
        yours, so please send it exactly. Overpaying is fine; underpaying by more than a rounding
        error needs a human to sort out. Network fees are paid by your wallet on top of this amount,
        not deducted from it.</p>
    </div>

    ${submitTx}

    <p class="fineprint">Order <code class="mono">${esc(order.orderId)}</code>.
      ${cancel}
      Questions about a payment? ${emailLink(ctx.company.contactEmail)}.</p>
  </div>
</div>`;

  return page(ctx, { title: `Pay ${order.amount} ${symbol}`, body, scripts: ['/js/crypto-pay.js'] });
}

function payNotFound(ctx) {
  const body = `
<div class="section pay-page">
  <div class="container narrow">
    <h1 class="section-title">Payment not found</h1>
    <div class="panel profile-card">
      <p>That payment doesn't exist, or it belongs to a different account.</p>
      <p><a class="btn btn-primary" href="/buy">Back to the store</a></p>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Payment not found', body });
}

/**
 * The payment buttons under each plan on the store page.
 *
 * Every option gets the same button, whichever checkout is behind it: a buyer
 * is choosing a COIN, and which of our two payment paths happens to handle it
 * is our implementation detail, not a distinction worth making them parse. So
 * Bitcoin (which goes to the BTCPay checkout) sits in the same grid, in the
 * same shape, as the coins paid direct to a wallet.
 *
 * `options` are { action, symbol, network, asset } — `asset` only for the
 * direct-wallet ones, which need to name the coin in the form.
 */
function payChoices(ctx, plan, options) {
  if (options.length === 0) return '';
  if (!ctx.user) {
    return `<a class="btn btn-outline btn-block" href="/auth/login?next=%2Fbuy">Sign in to buy</a>`;
  }
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  return `<div class="coin-choices">${map(options, (o) => `
    <form method="post" action="${esc(o.action)}" class="coin-choice">
      ${csrf}
      <input type="hidden" name="plan" value="${esc(plan.id)}">
      ${o.asset ? `<input type="hidden" name="asset" value="${esc(o.asset)}">` : ''}
      <button class="btn btn-primary btn-block" type="submit">
        <span class="coin-symbol">${esc(o.symbol)}</span>
        <span class="coin-network">${esc(o.network)}</span>
      </button>
    </form>`)}</div>`;
}

export { payPage, payNotFound, payChoices, statusBlock };
