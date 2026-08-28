/**
 * Public support views: the help centre ("try this first"), the contact
 * funnel and the live ticket thread.
 *
 * The funnel is deliberate — /help and the article page both end in a
 * "still stuck?" hand-off, /support/new shows matching articles *while* the
 * problem is being typed, and only then does the form submit. Nothing is
 * hidden behind that: the contact button is always reachable, because a
 * support flow that traps people is worse than a busy queue.
 */
import { page } from "./layout.js";
import { esc, timeAgo, map, emailLink } from "./util.js";
import { renderArticle, excerpt } from "../kb.js";
import {
  STATUS_LABELS, PRIORITY_LABELS, CATEGORIES, CATEGORY_LABELS, MAX_SUBJECT, MAX_BODY,
} from "../support.js";

const errorList = (errors) => (errors && errors.length
  ? `<div class="form-errors" role="alert"><ul>${map(errors, (e) => `<li>${esc(e)}</li>`)}</ul></div>`
  : '');

const csrf = (ctx) => `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;

const statusTag = (status) =>
  `<span class="tag tag-ticket tag-ticket-${esc(status)}">${esc(STATUS_LABELS[status] || status)}</span>`;

const priorityTag = (priority) => (priority && priority !== 'normal'
  ? `<span class="tag tag-prio tag-prio-${esc(priority)}">${esc(PRIORITY_LABELS[priority] || priority)}</span>`
  : '');

const crumbs = (trail) => `<nav class="breadcrumbs" aria-label="Breadcrumb">${
  trail.map(([label, href], i) => (i > 0 ? '<span aria-hidden="true">/</span>' : '')
    + (href ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span>${esc(label)}</span>`)).join('')
}</nav>`;

/** Card for one help article in a list. */
const articleCard = (a) => `<a class="thread-row thread-row--flush help-row" href="/help/a/${encodeURIComponent(a.slug)}">
  <span>
    <span class="thread-title">${a.pinned ? '<span class="tag tag-pin">START HERE</span> ' : ''}${esc(a.title)}</span>
    <span class="muted">${esc(a.summary || excerpt(a.body))}</span>
  </span>
  <span class="thread-nums"><strong>${esc(a.views || 0)}</strong><span class="muted">reads</span></span>
</a>`;

/* ------------------------------------------------------------------ *
 * Help centre
 * ------------------------------------------------------------------ */

function helpIndex(ctx, { sections, popular, q, results, openTickets = 0 }) {
  const searchBlock = `<form class="filter-bar help-search" method="get" action="/help">
    <input type="search" name="q" value="${esc(q || '')}" maxlength="120" autocomplete="off"
           placeholder="Describe your problem, e.g. &quot;GoyHub crashes on launch&quot;" aria-label="Search the help centre">
    <button class="btn btn-primary btn-sm" type="submit">Search</button>
    ${q ? '<a class="btn btn-ghost btn-sm" href="/help">Clear</a>' : ''}
  </form>`;

  const resultsBlock = q
    ? `<h2 class="search-group">${results.length
      ? `${results.length} article${results.length === 1 ? '' : 's'} for “${esc(q)}”`
      : `Nothing matched “${esc(q)}”`}</h2>
      ${results.length
        ? `<div class="thread-list">${map(results, articleCard)}</div>`
        : `<p class="muted empty-state">No article covers that yet — which is exactly what the support desk is for.</p>`}
      <p class="center help-cta"><a class="btn btn-primary" href="/support/new${q ? `?q=${encodeURIComponent(q)}` : ''}">Still stuck? Contact support</a></p>`
    : '';

  const sectionCards = map(sections, (s) => `<a class="category-card help-card" href="/help/s/${encodeURIComponent(s.slug)}">
    <div>
      <h2 class="thread-title">${s.icon ? `<span class="help-icon" aria-hidden="true">${esc(s.icon)}</span> ` : ''}${esc(s.name)}</h2>
      <p class="muted">${esc(s.description)}</p>
    </div>
    <div class="category-stats"><strong>${esc(s.article_count || 0)}</strong><span class="muted">articles</span></div>
    <div class="category-latest"><span class="muted">Top question</span>
      <span class="latest-title">${s.top_title ? esc(s.top_title) : '—'}</span></div>
  </a>`);

  const yourTickets = ctx.user && openTickets > 0
    ? `<p class="switch-note">You have ${openTickets} open ticket${openTickets === 1 ? '' : 's'}.
        <a href="/support">Open your support inbox →</a></p>`
    : '';

  const body = `
<div class="section content-page">
  <div class="container">
    <div class="page-head">
      <div>
        <h1 class="section-title">Help centre</h1>
        <p class="muted">Most problems are already solved below. If yours isn't, the support desk is
          open to <strong>every</strong> account — free members included — and to visitors without one.</p>
      </div>
      <div class="forum-head-actions">
        <a class="btn btn-outline" href="/support">My tickets</a>
        <a class="btn btn-primary" href="/support/new">Contact support</a>
      </div>
    </div>
    ${yourTickets}
    ${searchBlock}
    ${resultsBlock}
    ${q ? '' : `
    <h2 class="search-group">Browse by topic</h2>
    <div class="category-list">${sectionCards}</div>

    <h2 class="search-group">Most read</h2>
    <div class="thread-list">${popular.length
      ? map(popular, articleCard)
      : '<p class="muted empty-state">No articles published yet.</p>'}</div>

    <div class="panel panel-spaced support-cta">
      <div class="panel-head"><h2>Still stuck?</h2></div>
      <div class="panel-form">
        <p class="muted">Open a ticket and a human answers it. Free accounts, paid members and people
          with no account at all all use the same queue — you'll get a live chat thread either way.</p>
        <a class="btn btn-primary" href="/support/new">Contact support</a>
        <a class="btn btn-ghost" href="/support/lookup">Find an existing ticket</a>
      </div>
    </div>`}
  </div>
</div>`;
  return page(ctx, { title: q ? `Help · ${q}` : 'Help centre', body });
}

function helpSection(ctx, { section, articles }) {
  const body = `
<div class="section content-page">
  <div class="container">
    ${crumbs([['Help centre', '/help'], [section.name, null]])}
    <div class="page-head">
      <div>
        <h1 class="section-title">${section.icon ? `<span class="help-icon" aria-hidden="true">${esc(section.icon)}</span> ` : ''}${esc(section.name)}</h1>
        <p class="muted">${esc(section.description)}</p>
      </div>
      <div class="forum-head-actions"><a class="btn btn-primary" href="/support/new">Contact support</a></div>
    </div>
    <div class="thread-list">${articles.length
      ? map(articles, articleCard)
      : '<p class="muted empty-state">Nothing here yet.</p>'}</div>
  </div>
</div>`;
  return page(ctx, { title: `Help · ${section.name}`, body });
}

function helpArticle(ctx, { article, section, related, voted }) {
  const feedback = voted
    ? `<p class="switch-note">${voted === 'yes'
      ? 'Thanks — noted. That helps us decide what to write next.'
      : 'Sorry that didn\'t do it. Open a ticket below and a human will pick it up.'}</p>`
    : `<form class="kb-feedback" method="post" action="/help/a/${encodeURIComponent(article.slug)}/feedback">
        ${csrf(ctx)}
        <span>Did this solve it?</span>
        <button class="btn btn-outline btn-sm" type="submit" name="helpful" value="yes">Yes</button>
        <button class="btn btn-ghost btn-sm" type="submit" name="helpful" value="no">No, I still need help</button>
      </form>`;

  const relatedRail = related.length
    ? `<aside class="forum-sidebar kb-rail">
        <h2>Related</h2>
        ${map(related, (r) => `<a class="sidebar-thread" href="/help/a/${encodeURIComponent(r.slug)}">
          <span class="sidebar-title">${esc(r.title)}</span>
          <span class="muted">${esc(r.section_name || section.name)}</span></a>`)}
        <a class="btn btn-primary btn-sm btn-block kb-rail-cta"
           href="/support/new?article=${encodeURIComponent(article.slug)}">Contact support</a>
      </aside>`
    : `<aside class="forum-sidebar kb-rail">
        <h2>Still stuck?</h2>
        <p class="muted">Open a ticket and we'll take it from here.</p>
        <a class="btn btn-primary btn-sm btn-block"
           href="/support/new?article=${encodeURIComponent(article.slug)}">Contact support</a>
      </aside>`;

  const body = `
<div class="section content-page">
  <div class="container">
    ${crumbs([['Help centre', '/help'], [section.name, `/help/s/${section.slug}`], [article.title, null]])}
    <div class="forum-layout kb-layout">
      <article class="panel kb-article">
        <div class="kb-head">
          <h1>${esc(article.title)}</h1>
          <p class="muted">${esc(article.summary)}</p>
        </div>
        <div class="kb-body">${renderArticle(article.body)}</div>
        <div class="kb-foot">
          ${feedback}
          <p class="fineprint">${esc(article.helpful_yes || 0)} of
            ${esc((article.helpful_yes || 0) + (article.helpful_no || 0))} people found this helpful ·
            last updated ${esc(timeAgo(article.updated_at))}</p>
        </div>
      </article>
      ${relatedRail}
    </div>
  </div>
</div>`;
  return page(ctx, { title: article.title, body });
}

/* ------------------------------------------------------------------ *
 * Support inbox
 * ------------------------------------------------------------------ */

const ticketRow = (t, keyed) => `<a class="thread-row ticket-row" href="/support/t/${encodeURIComponent(t.ref)}${keyed ? `?k=${encodeURIComponent(keyed)}` : ''}">
  <span class="uid-badge">${esc(t.ref)}</span>
  <span>
    <span class="thread-title">${esc(t.subject)}</span>
    <span class="muted">${esc(CATEGORY_LABELS[t.category] || t.category)} · updated ${esc(timeAgo(t.updated_at))}</span>
  </span>
  <span class="thread-nums">
    ${statusTag(t.status)}${priorityTag(t.priority)}
    ${Number(t.user_unread) > 0 ? `<span class="tag tag-report-open">${esc(t.user_unread)} NEW</span>` : ''}
  </span>
</a>`;

function supportHome(ctx, { tickets, guestTickets, popular, cfg }) {
  const mine = tickets.length
    ? `<div class="thread-list">${map(tickets, (t) => ticketRow(t, null))}</div>`
    : `<p class="muted empty-state">${ctx.user
      ? 'No tickets yet. That is the goal.'
      : 'Sign in to see tickets opened from your account.'}</p>`;

  const guestBlock = guestTickets.length
    ? `<h2 class="search-group">Tickets from this browser</h2>
       <p class="muted">Opened without signing in and remembered on this device only.</p>
       <div class="thread-list">${map(guestTickets, (t) => ticketRow(t, t.__key))}</div>`
    : '';

  const body = `
<div class="section content-page">
  <div class="container">
    <div class="page-head">
      <div>
        <h1 class="section-title">Support</h1>
        <p class="muted">Every ticket is a live chat with a real person. Free accounts included.</p>
      </div>
      <div class="forum-head-actions">
        <a class="btn btn-outline" href="/help">Help centre</a>
        <a class="btn btn-primary" href="/support/new">New ticket</a>
      </div>
    </div>

    <div class="support-steps">
      <div class="support-step"><span class="support-step-n">1</span>
        <strong>Try the help centre</strong>
        <span class="muted">Written runbooks for the things that break most often.</span>
        <a href="/help">Browse articles →</a></div>
      <div class="support-step"><span class="support-step-n">2</span>
        <strong>Search your exact error</strong>
        <span class="muted">Paste the message you actually see — that finds more than a description does.</span>
        <a href="/help">Search →</a></div>
      <div class="support-step"><span class="support-step-n">3</span>
        <strong>Open a ticket</strong>
        <span class="muted">Still stuck? A human picks it up${cfg.slaHours ? ` — usually within ${esc(cfg.slaHours.normal)}h` : ''}.</span>
        <a href="/support/new">Contact support →</a></div>
    </div>

    <h2 class="search-group">Your tickets</h2>
    ${mine}
    ${guestBlock}

    ${ctx.user ? '' : `<p class="switch-note">Opened a ticket without an account on another device?
      <a href="/support/lookup">Find it with your ticket link</a>.</p>`}

    <h2 class="search-group">Popular right now</h2>
    <div class="thread-list">${popular.length
      ? map(popular, articleCard)
      : '<p class="muted empty-state">No articles yet.</p>'}</div>
  </div>
</div>`;
  return page(ctx, { title: 'Support', body });
}

/* ------------------------------------------------------------------ *
 * New ticket
 * ------------------------------------------------------------------ */

function newTicket(ctx, { errors = [], values = {}, suggestions = [], cfg, needsCaptcha, aiDeflect, fromArticle }) {
  const categoryOptions = map(CATEGORIES, ([id, label]) =>
    `<option value="${esc(id)}" ${values.category === id ? 'selected' : ''}>${esc(label)}</option>`);

  const suggestionBlock = suggestions.length
    ? `<div class="try-first" id="try-first">
        <h2>Try this first</h2>
        <p class="muted">These look like they cover what you described. Opening one does not lose your draft.</p>
        ${map(suggestions, (s) => `<a class="try-first-item" href="/help/a/${encodeURIComponent(s.article.slug)}" target="_blank" rel="noopener">
          <span class="try-first-title">${esc(s.article.title)}</span>
          <span class="muted">${esc(s.why || s.article.summary || excerpt(s.article.body, 120))}</span>
        </a>`)}
      </div>`
    : '';

  const guestFields = ctx.user ? '' : `
      <label><span>Your email <small class="muted">(so we can reach you)</small></span>
        <input type="email" name="email" required maxlength="254" autocomplete="email"
               value="${esc(values.email || '')}"></label>
      <label><span>Your name <small class="muted">(optional)</small></span>
        <input type="text" name="name" maxlength="40" autocomplete="name"
               value="${esc(values.name || '')}"></label>`;

  const captchaBlock = needsCaptcha ? `
      <div class="honeypot" aria-hidden="true">
        <label>Leave this field empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
      </div>
      <input type="hidden" name="captcha_token" value="">
      <input type="hidden" name="captcha_solution" value="">
      <div class="captcha-box" data-captcha data-captcha-idle="Verification required before you can send this."
           data-captcha-done="Verified. You can send your ticket now."></div>
      <noscript><p class="form-errors">The human-verification step below needs JavaScript, and so does
        creating an account. With scripting off, email us at ${emailLink(ctx.company.contactEmail)}
        instead — you will get the same answer from the same people, just without the live thread.</p></noscript>` : '';

  const attachBlock = cfg.attachMaxCount > 0 ? `
      <label><span>Screenshot or log <small class="muted">(optional, up to
        ${esc(cfg.attachMaxCount)} files, ${esc(cfg.attachMaxKb)} KB each)</small></span>
        <input type="file" name="files" multiple
               accept=".png,.jpg,.jpeg,.gif,.webp,.txt,.log,.cfg,.json,.pdf,image/*,text/plain,application/pdf"></label>` : '';

  const articleNote = fromArticle
    ? `<p class="switch-note">You came from <a href="/help/a/${encodeURIComponent(fromArticle.slug)}">${esc(fromArticle.title)}</a>.
        Tell us which step failed and what happened instead — that is the fastest possible ticket.</p>`
    : '';

  const body = `
<div class="section content-page">
  <div class="container narrow">
    ${crumbs([['Help centre', '/help'], ['Contact support', null]])}
    <h1 class="section-title">Contact support</h1>
    <p class="muted">Everyone gets a reply — free accounts, paid members and visitors without an account.
      Tickets are a live chat, so you can keep talking in the same thread.</p>
    ${articleNote}
    ${errorList(errors)}
    ${suggestionBlock}

    <form method="post" action="/support/new" class="stack ticket-form" enctype="multipart/form-data">
      ${csrf(ctx)}
      ${fromArticle ? `<input type="hidden" name="article" value="${esc(fromArticle.slug)}">` : ''}
      ${guestFields}
      <label><span>What is going wrong?</span>
        <input type="text" name="subject" required minlength="5" maxlength="${MAX_SUBJECT}"
               placeholder="One line, e.g. &quot;GoyHub closes as soon as I open it&quot;"
               value="${esc(values.subject || '')}"></label>
      <label><span>Topic</span>
        <select name="category">${categoryOptions}</select></label>
      <label><span>Tell us everything</span>
        <textarea name="body" required minlength="15" maxlength="${MAX_BODY}" rows="9"
          placeholder="What you did, what happened, what you expected. Paste the exact error text. Include your app version and Windows version if it is about the app."
        >${esc(values.body || '')}</textarea></label>
      ${attachBlock}
      ${aiDeflect ? `<p class="fineprint" id="deflect-note">As you describe the problem we check the help
        centre for a matching fix. Nothing is sent to support until you press the button.</p>` : ''}
      ${captchaBlock}
      <button type="submit" class="btn btn-primary btn-block">Send to support</button>
    </form>
    <p class="fineprint">Never include passwords, licence keys, wallet seed phrases or private keys in a
      ticket. Support will never ask for them.</p>
  </div>
</div>`;

  const scripts = ['/js/support.js'];
  if (needsCaptcha) scripts.unshift('/js/captcha.js');
  return page(ctx, { title: 'Contact support', body, scripts });
}

/** Shown once, right after a guest ticket is created — the only time the key is displayed. */
function ticketCreated(ctx, { ticket, key, emailed }) {
  const link = `/support/t/${encodeURIComponent(ticket.ref)}?k=${encodeURIComponent(key)}`;
  const body = `
<div class="section content-page">
  <div class="container narrow">
    <h1 class="section-title">Ticket ${esc(ticket.ref)} is open</h1>
    <p class="muted">A human will pick it up. In the meantime, this is your way back in.</p>

    <div class="panel panel-spaced">
      <div class="panel-head"><h2>Save your ticket link</h2></div>
      <div class="panel-form stack">
        <p>You opened this without an account, so this private link <strong>is</strong> your ticket key.
          It is remembered on this browser, and ${emailed
            ? 'we have emailed it to you as well.'
            : '<strong>this page is the only other place it appears</strong> — copy it somewhere safe now.'}</p>
        <div class="pay-field">
          <div class="pay-field-head"><span class="pay-field-label">Your ticket link</span></div>
          <div class="pay-field-body"><code class="pay-value mono">${esc(link)}</code>
            <button type="button" class="btn btn-outline btn-sm pay-copy" data-copy="${esc(link)}"
                    data-copied="Copied">Copy</button></div>
          <p class="pay-field-hint">Anyone with this link can read and reply to the ticket. Do not share it.</p>
        </div>
        <a class="btn btn-primary" href="${esc(link)}">Open the ticket</a>
      </div>
    </div>

    <p class="switch-note"><a href="/auth/signup">Create a free account</a> with the same email address and
      your tickets follow you to any device — free accounts get the identical support queue.</p>
  </div>
</div>`;
  return page(ctx, { title: `Ticket ${ticket.ref}`, body, scripts: ['/js/support.js'] });
}

function guestLookup(ctx, { errors = [], values = {}, sent }) {
  const body = `
<div class="section content-page">
  <div class="container narrow">
    <h1 class="section-title">Find your ticket</h1>
    ${errorList(errors)}
    ${sent ? '<p class="switch-note">If that reference and email match a ticket, the link is on its way to that address.</p>' : ''}
    <p class="muted">Paste the ticket link you were given, or ask for it again by reference and email.</p>

    <form method="post" action="/support/lookup" class="stack">
      ${csrf(ctx)}
      <label><span>Ticket reference</span>
        <input type="text" name="ref" required maxlength="20" placeholder="GH-1A2B3C4D"
               value="${esc(values.ref || '')}" autocomplete="off"></label>
      <label><span>The email you used</span>
        <input type="email" name="email" required maxlength="254" value="${esc(values.email || '')}"></label>
      <button type="submit" class="btn btn-primary btn-block">Email me the link</button>
    </form>
    <p class="fineprint">Signed-in members never need this — <a href="/support">your tickets</a> are always
      listed on your account.</p>
  </div>
</div>`;
  return page(ctx, { title: 'Find your ticket', body });
}

/* ------------------------------------------------------------------ *
 * Ticket thread (the live chat)
 * ------------------------------------------------------------------ */

const attachmentChip = (a, keyQuery) => {
  const isImage = String(a.mime || '').startsWith('image/');
  const href = `/support/attachments/${esc(a.id)}${keyQuery}`;
  return `<a class="attach-item${isImage ? ' attach-image' : ''}" href="${href}"${isImage ? '' : ' download'}>
    <span class="attach-icon" aria-hidden="true">${isImage ? '🖼' : '📄'}</span>
    <span class="attach-name">${esc(a.filename)}</span>
    <span class="muted attach-size">${esc(Math.max(1, Math.round(Number(a.bytes) / 1024)))} KB</span>
  </a>`;
};

/**
 * One chat message. Kept structurally identical to what public/js/support.js
 * builds when it appends a polled message, so a reloaded page and a live one
 * are indistinguishable.
 */
function chatMessage(m, { attachments = [], keyQuery = '' } = {}) {
  const role = m.author_role === 'staff' ? 'staff' : (m.author_role === 'system' ? 'system' : 'user');
  const files = attachments.filter((a) => Number(a.message_id) === Number(m.id));
  return `<div class="chat-msg chat-msg-${role}" data-id="${esc(m.id)}" id="msg-${esc(m.id)}">
  <div class="chat-head">
    <span class="chat-who">${esc(m.author_name)}${role === 'staff' ? ' <span class="tag tag-admin">SUPPORT</span>' : ''}</span>
    <span class="chat-time muted">${esc(timeAgo(m.created_at))}</span>
  </div>
  <div class="chat-body post-text">${esc(m.body)}</div>
  ${files.length ? `<div class="attach-list">${map(files, (a) => attachmentChip(a, keyQuery))}</div>` : ''}
</div>`;
}

function ratingBlock(ctx, ticket, keyField) {
  if (ticket.rating) {
    return `<div class="csat csat-done">
      <span class="muted">You rated this ${esc(ticket.rating)}/5.</span>
      <span class="csat-stars" aria-label="${esc(ticket.rating)} out of 5">${'★'.repeat(ticket.rating)}${'☆'.repeat(5 - ticket.rating)}</span>
    </div>`;
  }
  if (ticket.status !== 'solved' && ticket.status !== 'closed') return '';
  return `<form class="csat" method="post" action="/support/t/${encodeURIComponent(ticket.ref)}/rate">
    ${csrf(ctx)}${keyField}
    <span class="csat-label">How did we do?</span>
    <span class="csat-stars">${[1, 2, 3, 4, 5].map((n) =>
      `<button class="csat-star" type="submit" name="rating" value="${n}"
        title="${n} out of 5" aria-label="Rate ${n} out of 5">★</button>`).join('')}</span>
    <input type="text" name="comment" maxlength="500" placeholder="Anything you'd like to add? (optional)"
           aria-label="Optional feedback">
  </form>`;
}

function ticketView(ctx, { ticket, messages, attachments, canReply, accessKey, cfg, suggestions = [], mergedInto = null }) {
  const keyQuery = accessKey ? `?k=${encodeURIComponent(accessKey)}` : '';
  const keyField = accessKey ? `<input type="hidden" name="k" value="${esc(accessKey)}">` : '';
  const lastId = messages.length ? messages[messages.length - 1].id : 0;

  const composer = canReply
    ? `<form class="chat-composer" id="ticket-composer"
             method="post" action="/support/t/${encodeURIComponent(ticket.ref)}/reply${keyQuery}"
             enctype="multipart/form-data">
        ${csrf(ctx)}${keyField}
        <textarea name="body" rows="3" maxlength="${MAX_BODY}" required
                  placeholder="Add anything new — an error message, what you tried, a screenshot."></textarea>
        <div class="chat-composer-actions">
          ${cfg.attachMaxCount > 0 ? `<label class="chat-attach">
            <span class="btn btn-ghost btn-sm">Attach</span>
            <input type="file" name="files" multiple class="sr-only"
                   accept=".png,.jpg,.jpeg,.gif,.webp,.txt,.log,.cfg,.json,.pdf,image/*,text/plain,application/pdf">
            <span class="muted chat-attach-name"></span></label>` : '<span></span>'}
          <button class="btn btn-primary btn-sm" type="submit">Send</button>
        </div>
      </form>`
    : `<p class="muted locked-note">This ticket is closed. ${accessKey || ctx.user
      ? '<a href="/support/new">Open a new one</a> if it comes back.'
      : ''}</p>`;

  const openSuggestions = suggestions.length && ticket.status === 'open' && !ticket.first_response_at
    ? `<div class="try-first try-first-inline">
        <h2>While you wait — try this first</h2>
        ${map(suggestions, (a) => `<a class="try-first-item" href="/help/a/${encodeURIComponent(a.slug)}">
          <span class="try-first-title">${esc(a.title)}</span>
          <span class="muted">${esc(a.summary || excerpt(a.body, 120))}</span></a>`)}
      </div>`
    : '';

  const body = `
<div class="section content-page">
  <div class="container">
    ${crumbs([['Support', '/support'], [ticket.ref, null]])}
    <div class="page-head">
      <div>
        <h1 class="section-title thread-heading">
          <span class="uid-badge">${esc(ticket.ref)}</span>
          ${statusTag(ticket.status)}${priorityTag(ticket.priority)}
          ${esc(ticket.subject)}
        </h1>
        <p class="muted">${esc(CATEGORY_LABELS[ticket.category] || ticket.category)} ·
          opened ${esc(timeAgo(ticket.created_at))}${ticket.assignee_name
            ? ` · handled by ${esc(ticket.assignee_name)}` : ''}</p>
      </div>
      <div class="forum-head-actions">
        <a class="btn btn-ghost btn-sm" href="/help">Help centre</a>
        ${canReply ? `<form method="post" action="/support/t/${encodeURIComponent(ticket.ref)}/close${keyQuery}"
          class="inline-form" data-confirm="Close this ticket? You can reopen it by replying.">
          ${csrf(ctx)}${keyField}
          <button class="btn btn-outline btn-sm" type="submit">It's solved — close it</button></form>` : ''}
      </div>
    </div>

    ${mergedInto ? `<p class="switch-note">This ticket was merged into
      <strong>${esc(mergedInto)}</strong>, where the conversation continues. It is listed under
      <a href="/support">your tickets</a>.</p>` : ''}
    ${ratingBlock(ctx, ticket, keyField)}
    ${openSuggestions}

    <div class="panel chat-panel" id="ticket-chat"
         data-ref="${esc(ticket.ref)}" data-last-id="${esc(lastId)}"
         data-poll="/support/t/${encodeURIComponent(ticket.ref)}/messages${keyQuery}"
         data-csrf="${esc(ctx.csrfToken)}">
      <div class="panel-head">
        <h2>Conversation</h2>
        <span class="muted chat-live" id="chat-live" hidden>Live</span>
      </div>
      <div class="chat-log" id="chat-log">${messages.length
        ? map(messages, (m) => chatMessage(m, { attachments, keyQuery }))
        : '<p class="muted chat-empty">No messages yet.</p>'}</div>
      ${composer}
    </div>

    <p class="fineprint">Support never asks for your password, licence key or wallet seed phrase.
      ${accessKey ? 'Keep this ticket link private — it is the key to this conversation.' : ''}</p>
  </div>
</div>`;
  return page(ctx, { title: `${ticket.ref} · ${ticket.subject}`, body, scripts: ['/js/support.js'] });
}

export {
  helpIndex, helpSection, helpArticle,
  supportHome, newTicket, ticketCreated, guestLookup, ticketView,
  chatMessage, statusTag, priorityTag, articleCard,
};
