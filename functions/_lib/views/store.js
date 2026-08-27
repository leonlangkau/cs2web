import { page } from "./layout.js";
import { esc, map, timeAgo, emailLink } from "./util.js";
import { meetsTier, tierOf, isStaff, TIER_LABELS } from "../tiers.js";
import { planDuration, STATUS_LABELS } from "../store.js";

const BTC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 7.5h3.9a2.3 2.3 0 010 4.5H9.5m0 0h4.2a2.3 2.3 0 010 4.5H9.5m0-9v9m1.2-11v2m2.6-2v2m-2.6 9v2m2.6-2v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BENEFITS = [
  ['Community forum', 'Full access to every category — threads, replies and the shoutbox.'],
  ['App download', 'The GoyHub desktop app for Windows, and every update after it.'],
  ['Loader license', 'A signed token so the app knows your account is Paid, refreshed automatically.'],
  ['Priority support', 'Paid member reports go to the top of the queue.'],
];

/** Membership state banner: already covered, signed out, or nothing to say. */
function accountNote(ctx) {
  if (!ctx.user) {
    return `<p class="muted store-lede"><a href="/auth/signup">Create a free account</a> or
      <a href="/auth/login?next=%2Fstore">sign in</a> first — a purchase attaches to your username.</p>`;
  }
  if (isStaff(ctx.user)) {
    return `<div class="flash flash-success upgrade-note">Your
      <strong>${esc(TIER_LABELS[tierOf(ctx.user)])}</strong> account already includes everything below —
      there is nothing here for you to buy.</div>`;
  }
  if (meetsTier(ctx.user, 'paid')) {
    const until = ctx.user.paid_until
      ? `until <strong>${esc(new Date(Number(ctx.user.paid_until)).toISOString().slice(0, 10))}</strong>`
      : 'with <strong>no expiry</strong>';
    return `<div class="flash flash-success upgrade-note">You are <strong>Paid</strong> ${until}.
      Buying again extends your membership from that date — it never replaces the time you have left.</div>`;
  }
  return '';
}

/** The per-plan call to action, which depends on who is looking and whether checkout is live. */
function planAction(ctx, plan, { live, csrf }) {
  if (!live) {
    return '<p class="plan-soon">Checkout opening soon</p>';
  }
  if (!ctx.user) {
    return `<a class="btn btn-outline btn-block" href="/auth/login?next=%2Fstore">Sign in to buy</a>`;
  }
  if (isStaff(ctx.user)) {
    return '<p class="plan-soon">Included with staff access</p>';
  }
  return `<form method="post" action="/store/checkout">${csrf}
      <input type="hidden" name="plan" value="${esc(plan.id)}">
      <button class="btn btn-primary btn-block" type="submit">${BTC_ICON}Pay with Bitcoin</button>
    </form>`;
}

function planCard(ctx, plan, opts) {
  return `<article class="plan-card${plan.popular ? ' plan-popular' : ''}">
    ${plan.popular ? '<span class="plan-flag">Best value</span>' : ''}
    <h3 class="plan-name">${esc(plan.name)}</h3>
    <p class="plan-price"><span class="plan-amount">${esc(plan.price)}</span>
      <span class="plan-currency">${esc(opts.currency)}</span></p>
    <p class="plan-term">${esc(planDuration(plan.days))}</p>
    <p class="plan-blurb">${esc(plan.blurb)}</p>
    ${planAction(ctx, plan, opts)}
  </article>`;
}

/**
 * How payment works, in whichever of three states the site is actually in:
 * BTCPay live, the manual CRYPTO_PAY_* fallback, or nothing configured yet —
 * in which case it says so rather than dressing up a button that can't work.
 */
function payBlock(ctx, { live, legacy }) {
  if (live) {
    return `<h2>How paying works</h2>
      <ol class="steps">
        <li>Pick a plan — we create an invoice on our own BTCPay Server.</li>
        <li>Pay it in Bitcoin (on-chain or Lightning) from any wallet.</li>
        <li>Your account flips to <strong>Paid</strong> the moment the payment confirms.</li>
      </ol>
      <p class="muted">Every order gets its own status page you can come back to. There is no third-party
        payment processor in the way: the invoice is raised on our own server and carries nothing about you
        beyond your order reference and username. No card details ever touch this site.</p>`;
  }
  if (legacy.url) {
    return `<h2>Pay with crypto</h2>
      <a class="btn btn-primary btn-lg" href="${esc(legacy.url)}" rel="noopener nofollow">Open checkout</a>
      <p class="fineprint">Checkout is handled by our payment processor while our own BTCPay Server is
        being set up. Include your username
        <span class="mono">${esc(ctx.user ? ctx.user.username : 'your-username')}</span> in the payment
        memo so we can match it to your account.</p>`;
  }
  if (legacy.addresses.length > 0) {
    return `<h2>Pay with crypto</h2>
      <p>Send the amount for the plan you want in any listed coin, then email
        ${emailLink(ctx.company.contactEmail)} with the <strong>transaction ID</strong> and your username
        <span class="mono">${esc(ctx.user ? ctx.user.username : 'your-username')}</span>. An admin activates
        Paid once it confirms — automatic activation arrives with our BTCPay Server.</p>
      <div class="pay-addresses">${map(legacy.addresses, (a) => `
        <div class="pay-address"><span class="pay-coin">${esc(a.coin)}</span>
          <span class="mono">${esc(a.address)}</span></div>`)}
      </div>`;
  }
  return `<h2>Checkout is being set up</h2>
    <p class="muted">Bitcoin payments run on our own <strong>BTCPay Server</strong>, which is being set up
      right now — the plans and prices above are final, the pay button is not live yet.</p>
    <p class="muted">Want in before it opens? Email ${emailLink(ctx.company.contactEmail)}
      ${ctx.user ? `from your account address with your username <span class="mono">${esc(ctx.user.username)}</span>` : 'with your username'}
      and we will sort it out by hand.</p>`;
}

const statusTag = (status) =>
  `<span class="tag tag-order tag-order-${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>`;

function ordersPanel(orders) {
  if (orders.length === 0) return '';
  return `<div class="panel profile-card">
    <h2>Your recent orders</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Order</th><th>Plan</th><th>Amount</th><th>Status</th><th>Placed</th></tr></thead>
      <tbody>${map(orders, (o) => `<tr>
        <td><a class="mono" href="/store/order/${esc(o.order_ref)}">${esc(o.order_ref.slice(0, 8))}…</a></td>
        <td>${esc(o.product_name)}</td>
        <td class="nowrap">${esc(o.amount)} ${esc(o.currency)}</td>
        <td>${statusTag(o.status)}</td>
        <td class="muted nowrap">${esc(timeAgo(o.created_at))}</td></tr>`)}
      </tbody></table></div>
  </div>`;
}

/**
 * Staff-only setup checklist. Names the variables that are still missing (never
 * their values), so "checkout isn't live" is a to-do list rather than a mystery
 * while the BTCPay Server is being stood up.
 */
function setupPanel(ctx, { missing, live, origin }) {
  if (!isStaff(ctx.user) || missing.length === 0) return '';
  return `<div class="panel profile-card store-setup">
    <h2>BTCPay setup — staff only</h2>
    <p class="muted">${live
      ? 'Invoices can be created, but settlement callbacks are not authenticated yet:'
      : 'Bitcoin checkout stays off until these are set as Pages variables/secrets:'}</p>
    <ul class="upgrade-benefits">${map(missing, (name) => `<li><span class="mono">${esc(name)}</span></li>`)}</ul>
    <p class="fineprint">Point the BTCPay webhook at
      <span class="mono">${esc(origin)}/api/btcpay/webhook</span> and give it the
      <strong>InvoiceSettled</strong>, <strong>InvoiceProcessing</strong>, <strong>InvoiceExpired</strong> and
      <strong>InvoiceInvalid</strong> events. Until then, an order still settles when the buyer opens its
      status page — that page re-checks the invoice against BTCPay directly.</p>
  </div>`;
}

function storePage(ctx, { plans, currency, live, legacy, missing, orders = [], origin = '' }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const body = `
<div class="section store-page">
  <div class="container">
    <p class="section-kicker">// STORE</p>
    <h1 class="section-title">Get GoyHub Paid</h1>
    <p class="muted store-lede">One membership unlocks the app download, the community forum and your
      loader license. Pay in Bitcoin — no card, no subscription that quietly renews itself.</p>
    ${accountNote(ctx)}

    <div class="plan-grid">
      ${map(plans, (plan) => planCard(ctx, plan, { currency, live, csrf }))}
    </div>

    <div class="store-columns">
      <div class="panel profile-card">
        <h2>What you get</h2>
        <ul class="upgrade-benefits">
          ${map(BENEFITS, ([name, copy]) => `<li><strong>${esc(name)}</strong> — ${esc(copy)}</li>`)}
        </ul>
      </div>
      <div class="panel profile-card" id="pay">
        ${payBlock(ctx, { live, legacy })}
      </div>
    </div>

    ${ordersPanel(orders)}
    ${setupPanel(ctx, { missing, live, origin })}

    <p class="fineprint">Cryptocurrency payments are final and cannot be reversed by us — check the amount
      before you send it. Purchases are subject to our <a href="/terms">Terms &amp; Conditions</a>;
      tier changes and orders are logged. Something wrong with an order?
      ${emailLink(ctx.company.contactEmail)}.</p>
  </div>
</div>`;
  return page(ctx, { title: 'Store', body });
}

/** Live-ish status of one order: what was bought, what state it is in, what to do next. */
function orderPage(ctx, { order, live }) {
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;
  const open = order.status === 'new' || order.status === 'processing';
  const done = order.status === 'fulfilled';

  const steps = [
    ['Order placed', true],
    ['Payment confirmed', order.status === 'paid' || done],
    ['Access granted', done],
  ];

  let next;
  if (done) {
    next = `<div class="flash flash-success upgrade-note">Payment received — your account is
        <strong>Paid</strong>${order.days === null ? ' for life' : ''}. Thank you.</div>
      <p><a class="btn btn-primary" href="/download">Go to the download</a>
        <a class="btn btn-outline" href="/forum">Open the forum</a></p>`;
  } else if (order.status === 'paid') {
    next = `<p class="muted">The payment confirmed, but we could not attach it to an account
        automatically. Email ${emailLink(ctx.company.contactEmail)} quoting order
        <span class="mono">${esc(order.order_ref)}</span> and we will finish it by hand.</p>`;
  } else if (open && order.checkout_url) {
    next = `<p><a class="btn btn-primary btn-lg" href="${esc(order.checkout_url)}" rel="noopener nofollow">${BTC_ICON}Open the payment page</a>
        <a class="btn btn-outline btn-lg" href="/store/order/${esc(order.order_ref)}">Refresh status</a></p>
      <p class="muted">The invoice stays open for a short window — pay it from any Bitcoin wallet, on-chain or
        over Lightning. This page updates itself when you come back${live ? '' : ' once checkout is live'}.</p>`;
  } else if (open) {
    next = `<p class="muted">This order has no payment page attached. Start a fresh one from the
        <a href="/store">store</a> — nothing has been charged.</p>`;
  } else {
    next = `<p class="muted">${order.status === 'expired'
      ? 'The invoice expired before it was paid. Nothing was charged — start a new order whenever you like.'
      : order.status === 'cancelled'
        ? 'This order was cancelled. Nothing was charged.'
        : 'This order could not be completed. If money did leave your wallet, email us with the transaction ID and we will sort it out.'}</p>
      <p><a class="btn btn-primary" href="/store">Back to the store</a></p>`;
  }

  const body = `
<div class="section order-page">
  <div class="container narrow">
    <p class="section-kicker">// ORDER</p>
    <h1 class="section-title">${esc(order.product_name)}</h1>
    <p class="muted">Order <span class="mono">${esc(order.order_ref)}</span> · placed ${esc(timeAgo(order.created_at))}</p>

    <div class="panel profile-card">
      <div class="order-head">
        <div>
          <span class="order-amount">${esc(order.amount)} ${esc(order.currency)}</span>
          <span class="muted"> · ${esc(planDuration(order.days === null || order.days === undefined ? null : Number(order.days)))}</span>
        </div>
        ${statusTag(order.status)}
      </div>
      <ol class="order-steps">
        ${map(steps, ([label, hit]) => `<li class="${hit ? 'step-done' : ''}">${esc(label)}</li>`)}
      </ol>
      ${next}
    </div>

    ${open && order.checkout_url ? `<form method="post" action="/store/order/${esc(order.order_ref)}/cancel"
        class="inline-form" data-confirm="Cancel this order? Nothing has been charged.">${csrf}
        <button class="btn btn-ghost btn-sm" type="submit">Cancel this order</button></form>` : ''}

    <p class="fineprint">Payments are handled by our self-hosted BTCPay Server; we never see your wallet.
      Crypto payments are final — see our <a href="/terms">Terms &amp; Conditions</a>. Questions about this
      order? ${emailLink(ctx.company.contactEmail)} — quote the order reference above.</p>
  </div>
</div>`;
  return page(ctx, { title: `Order ${order.order_ref.slice(0, 8)}`, body });
}

export { storePage, orderPage, statusTag, BTC_ICON };
