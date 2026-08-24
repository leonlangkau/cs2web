import { page } from "./layout.js";
import { esc, timeAgo, map, pagination } from "./util.js";
import { isStaff, STAFF_TIERS, TIER_LABELS, normalizeTier } from "../tiers.js";
import { canEditPost } from "../post-rules.js";

function errorList(errors) {
  if (!errors || errors.length === 0) return '';
  return `<div class="form-errors" role="alert"><ul>${map(errors, (e) => `<li>${esc(e)}</li>`)}</ul></div>`;
}

/** Linked username for anywhere a member is named. */
const memberLink = (username) => `<a class="member-link" href="/u/${encodeURIComponent(username)}">${esc(username)}</a>`;

const shoutRow = (s, ctx) => `<div class="shout-row" data-id="${esc(s.id)}">
  <span class="shout-user">${esc(s.username)}${STAFF_TIERS.has(s.author_tier) ? ' <span class="tag tag-admin">STAFF</span>' : ''}</span>
  <span class="shout-body">${esc(s.body)}</span>
  <span class="shout-time muted">${esc(timeAgo(s.created_at))}</span>
  ${ctx && isStaff(ctx.user) ? `<form method="post" action="/forum/shouts/${esc(s.id)}/delete" class="inline-form shout-del-form"
      data-confirm="Delete this shout?">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <button class="shout-del" type="submit" aria-label="Delete shout">✕</button></form>` : ''}
</div>`;

function shoutbox(ctx, shouts) {
  const lastId = shouts.length ? shouts[shouts.length - 1].id : 0;
  const list = shouts.length === 0
    ? '<p class="muted shout-empty">No shouts yet. Say hi!</p>'
    : map(shouts, (s) => shoutRow(s, ctx));
  const form = ctx.user
    ? `<form method="post" action="/forum/shoutbox" class="shout-form" id="shout-form">
        <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
        <input type="text" name="body" maxlength="200" required placeholder="Say something…"
               aria-label="Shoutbox message" autocomplete="off">
        <button class="btn btn-primary btn-sm" type="submit">Send</button>
      </form>`
    : '<p class="muted shout-login-note"><a href="/auth/login?next=%2Fforum">Log in</a> to join the shoutbox.</p>';

  const purge = isStaff(ctx.user) ? `<form method="post" action="/forum/shouts/purge" class="inline-form shout-purge-form"
      data-confirm="Delete every shout in the shoutbox? This cannot be undone.">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <button class="btn btn-ghost btn-xs" type="submit">Purge all</button></form>` : '';

  return `<div class="shoutbox" id="shoutbox" data-last-id="${esc(lastId)}"${isStaff(ctx.user) ? ` data-staff="1" data-csrf="${esc(ctx.csrfToken)}"` : ''}>
    <div class="shoutbox-head"><h2>Shoutbox</h2>${purge}</div>
    <div class="shout-list" id="shout-list">${list}</div>
    ${form}
  </div>`;
}

function index(ctx, { categories, recent, shouts }) {
  const newBtn = ctx.user
    ? '<a class="btn btn-primary" href="/forum/new">+ New thread</a>'
    : '<a class="btn btn-primary" href="/auth/signup">Sign up to post</a>';

  const body = `
<div class="section forum-page">
  <div class="container">
    <div class="page-head">
      <div><p class="section-kicker">// COMMUNITY</p><h1 class="section-title">Forum</h1></div>
      <div class="forum-head-actions">
        <form method="get" action="/forum/search" class="forum-search" role="search">
          <input type="search" name="q" minlength="2" maxlength="100" required
                 placeholder="Search the forum…" aria-label="Search the forum">
          <button class="btn btn-outline btn-sm" type="submit">Search</button>
        </form>
        ${newBtn}
      </div>
    </div>
    <div class="forum-layout">
      <div class="category-list">
        ${map(categories, (c) => `<a class="category-card" href="/forum/c/${esc(c.slug)}">
          <div class="category-main"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.description)}</p></div>
          <div class="category-stats">
            <span><strong>${esc(c.thread_count)}</strong> threads</span>
            <span><strong>${esc(c.post_count)}</strong> posts</span>
          </div>
          <div class="category-latest">${c.latest_title
            ? `<span class="latest-title">${esc(c.latest_title)}</span><span class="muted">${esc(timeAgo(c.latest_at))}</span>`
            : '<span class="muted">No threads yet</span>'}</div>
        </a>`)}
      </div>
      <aside class="forum-sidebar" aria-label="Recent activity">
        <h2>Recent activity</h2>
        ${recent.length === 0 ? '<p class="muted">Nothing yet.</p>' : map(recent, (t) => `
          <a class="sidebar-thread" href="/forum/t/${esc(t.id)}">
            <span class="sidebar-title">${esc(t.title)}</span>
            <span class="muted">${esc(t.category)} · ${esc(t.username)} · ${esc(timeAgo(t.updated_at))}</span>
          </a>`)}
        ${shoutbox(ctx, shouts)}
      </aside>
    </div>
  </div>
</div>`;
  return page(ctx, { title: 'Forum', body });
}

function category(ctx, { category: cat, threads, page: current, pages }) {
  const newBtn = ctx.user
    ? `<a class="btn btn-primary" href="/forum/new?c=${encodeURIComponent(cat.slug)}">+ New thread</a>`
    : `<a class="btn btn-primary" href="/auth/login?next=${encodeURIComponent(`/forum/new?c=${cat.slug}`)}">Log in to post</a>`;

  const list = threads.length === 0
    ? '<p class="muted empty-state">No threads here yet. Start the first one!</p>'
    : `<div class="thread-list">${map(threads, (t) => `<a class="thread-row" href="/forum/t/${esc(t.id)}">
        <div class="thread-flags">
          ${t.pinned ? '<span class="tag tag-pin">PINNED</span>' : ''}
          ${t.locked ? '<span class="tag tag-lock">LOCKED</span>' : ''}
        </div>
        <div class="thread-main">
          <span class="thread-title">${esc(t.title)}</span>
          <span class="muted">by ${esc(t.username)} · ${esc(timeAgo(t.created_at))}</span>
        </div>
        <div class="thread-nums">
          <span><strong>${esc(Math.max(0, t.replies))}</strong> replies</span>
          <span><strong>${esc(t.views)}</strong> views</span>
          <span class="muted">active ${esc(timeAgo(t.last_post_at || t.updated_at))}</span>
        </div></a>`)}</div>
      ${pagination(current, pages, (p) => `/forum/c/${cat.slug}?page=${p}`)}`;

  const body = `
<div class="section forum-page">
  <div class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span> <span>${esc(cat.name)}</span>
    </nav>
    <div class="page-head">
      <div><h1 class="section-title">${esc(cat.name)}</h1><p class="muted">${esc(cat.description)}</p></div>
      ${newBtn}
    </div>
    ${list}
  </div>
</div>`;
  return page(ctx, { title: cat.name, body });
}

function thread(ctx, { thread: t, posts, firstPostId, page: current, pages, postOffset }) {
  const staff = isStaff(ctx.user);
  const isOwner = ctx.user && ctx.user.id === t.user_id;
  const csrf = `<input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">`;

  const modActions = staff ? `
      <form method="post" action="/admin/threads/${esc(t.id)}/pin" class="inline-form">${csrf}
        <button class="btn btn-ghost btn-sm" type="submit">${t.pinned ? 'Unpin' : 'Pin'}</button></form>
      <form method="post" action="/admin/threads/${esc(t.id)}/lock" class="inline-form">${csrf}
        <button class="btn btn-ghost btn-sm" type="submit">${t.locked ? 'Unlock' : 'Lock'}</button></form>` : '';
  const deleteThreadBtn = (staff || isOwner) ? `
      <form method="post" action="/forum/t/${esc(t.id)}/delete" class="inline-form"
            data-confirm="Delete this thread and all its replies?">${csrf}
        <button class="btn btn-danger btn-sm" type="submit">Delete</button></form>` : '';
  const canEditTitle = canEditPost(ctx.user, { user_id: t.user_id, created_at: t.created_at });
  const titleEdit = canEditTitle ? `
      <details class="title-edit"><summary class="btn btn-ghost btn-sm">Rename</summary>
        <form method="post" action="/forum/t/${esc(t.id)}/edit-title" class="title-edit-form">${csrf}
          <input type="text" name="title" required minlength="3" maxlength="120" value="${esc(t.title)}"
                 aria-label="New thread title">
          <button class="btn btn-primary btn-sm" type="submit">Save</button>
        </form>
      </details>` : '';
  const threadActions = (modActions || deleteThreadBtn || titleEdit)
    ? `<div class="thread-actions">${titleEdit}${modActions}${deleteThreadBtn}</div>` : '';

  const postList = map(posts, (p, i) => {
    const canDelete = (staff || (ctx.user && ctx.user.id === p.user_id)) && p.id !== firstPostId;
    const canEdit = canEditPost(ctx.user, p);
    const canReport = ctx.user && ctx.user.id !== p.user_id;
    const edited = p.edited_at
      ? `<span class="muted post-edited" title="edited by ${esc(p.edited_by || 'unknown')}">· edited ${esc(timeAgo(p.edited_at))}${p.edited_by && p.edited_by !== p.username ? ` by ${esc(p.edited_by)}` : ''}</span>`
      : '';
    const reportForm = canReport ? `<details class="report-box">
          <summary class="muted">Report</summary>
          <form method="post" action="/forum/posts/${esc(p.id)}/report" class="report-form">${csrf}
            <input type="text" name="reason" required minlength="3" maxlength="500"
                   placeholder="What's wrong with this post?" aria-label="Report reason">
            <button class="btn btn-warn btn-xs" type="submit">Send report</button>
          </form>
        </details>` : '';
    return `<article class="post" id="post-${esc(p.id)}">
    <aside class="post-author">
      <span class="avatar avatar-lg" aria-hidden="true">${esc(String(p.username || '?')[0].toUpperCase())}</span>
      <span class="post-username">${memberLink(p.username)}${STAFF_TIERS.has(p.author_tier) ? ' <span class="tag tag-admin">STAFF</span>' : ''}</span>
      <span class="uid-badge${p.user_id <= 1001 ? ' uid-reserved' : ''}">UID ${esc(p.user_id)}</span>
      <span class="muted">joined ${esc(timeAgo(p.author_since))}</span>
      <span class="muted">${esc(p.author_posts)} posts</span>
    </aside>
    <div class="post-body">
      <div class="post-meta">
        <span class="muted">#${esc(postOffset + i + 1)} · ${esc(timeAgo(p.created_at))} ${edited}</span>
        <span class="post-actions">
          ${canEdit ? `<a class="btn btn-ghost btn-xs" href="/forum/posts/${esc(p.id)}/edit">Edit</a>` : ''}
          ${canDelete ? `<form method="post" action="/forum/posts/${esc(p.id)}/delete" class="inline-form" data-confirm="Delete this post?">${csrf}<button class="btn btn-danger btn-xs" type="submit">Delete</button></form>` : ''}
        </span>
      </div>
      <div class="post-text">${esc(p.body)}</div>
      ${reportForm}
    </div>
  </article>`;
  });

  let replyArea;
  if (t.locked && !staff) {
    replyArea = '<p class="muted locked-note">🔒 This thread is locked. New replies are disabled.</p>';
  } else if (ctx.user) {
    replyArea = `<div class="reply-box"><h2>Post a reply</h2>
      <form method="post" action="/forum/t/${esc(t.id)}/reply" class="stack">${csrf}
        <textarea name="body" rows="6" required maxlength="10000" placeholder="Write your reply…"></textarea>
        <button class="btn btn-primary" type="submit">Reply</button>
      </form></div>`;
  } else {
    replyArea = `<p class="muted locked-note">
      <a href="/auth/login?next=${encodeURIComponent(`/forum/t/${t.id}`)}">Log in</a> or
      <a href="/auth/signup">sign up</a> to join the conversation.</p>`;
  }

  const body = `
<div class="section forum-page">
  <div class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span>
      <a href="/forum/c/${esc(t.category_slug)}">${esc(t.category_name)}</a>
      <span aria-hidden="true">/</span> <span>${esc(t.title)}</span>
    </nav>
    <div class="page-head">
      <div>
        <h1 class="section-title thread-heading">
          ${t.pinned ? '<span class="tag tag-pin">PINNED</span>' : ''}
          ${t.locked ? '<span class="tag tag-lock">LOCKED</span>' : ''}
          ${esc(t.title)}
        </h1>
        <p class="muted">Started by ${memberLink(t.username)} · ${esc(timeAgo(t.created_at))} · ${esc(t.views)} views</p>
      </div>
      ${threadActions}
    </div>
    <div class="post-list">${postList}</div>
    ${pagination(current, pages, (p) => `/forum/t/${t.id}?page=${p}`, 'Post pages')}
    ${replyArea}
  </div>
</div>`;
  return page(ctx, { title: t.title, body });
}

function newThread(ctx, { categories, errors = [], values = {} }) {
  const body = `
<div class="section forum-page">
  <div class="container narrow">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span> <span>New thread</span>
    </nav>
    <h1 class="section-title">Start a new thread</h1>
    ${errorList(errors)}
    <form method="post" action="/forum/new" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <label><span>Category</span>
        <select name="category" required>
          ${map(categories, (c) => `<option value="${esc(c.slug)}" ${values.category === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`)}
        </select></label>
      <label><span>Title</span>
        <input type="text" name="title" required minlength="3" maxlength="120"
               placeholder="Be specific — good titles get better answers"
               value="${esc(values.title || '')}"></label>
      <label><span>Body</span>
        <textarea name="body" rows="10" required maxlength="10000"
                  placeholder="Details, settings, clips, logs…">${esc(values.body || '')}</textarea></label>
      <button class="btn btn-primary" type="submit">Create thread</button>
    </form>
  </div>
</div>`;
  return page(ctx, { title: 'New thread', body });
}

function editPost(ctx, { post, thread, errors = [] }) {
  const body = `
<div class="section forum-page">
  <div class="container narrow">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span>
      <a href="/forum/t/${esc(thread.id)}">${esc(thread.title)}</a>
      <span aria-hidden="true">/</span> <span>Edit post</span>
    </nav>
    <h1 class="section-title">Edit post</h1>
    <p class="muted">Edits are marked on the post with who edited it and when.</p>
    ${errorList(errors)}
    <form method="post" action="/forum/posts/${esc(post.id)}/edit" class="stack">
      <input type="hidden" name="_csrf" value="${esc(ctx.csrfToken)}">
      <label><span>Post</span>
        <textarea name="body" rows="10" required maxlength="10000">${esc(post.body)}</textarea></label>
      <div class="form-row">
        <button class="btn btn-primary" type="submit">Save changes</button>
        <a class="btn btn-ghost" href="/forum/t/${esc(thread.id)}#post-${esc(post.id)}">Cancel</a>
      </div>
    </form>
  </div>
</div>`;
  return page(ctx, { title: 'Edit post', body });
}

function searchResults(ctx, { q, threads, posts }) {
  const excerpt = (text, needle) => {
    const hay = String(text);
    const idx = hay.toLowerCase().indexOf(String(needle).toLowerCase());
    const start = Math.max(0, idx - 60);
    const slice = hay.slice(start, start + 180);
    return `${start > 0 ? '…' : ''}${slice}${start + 180 < hay.length ? '…' : ''}`;
  };

  const results = q.length < 2
    ? '<p class="muted empty-state">Type at least two characters to search.</p>'
    : (threads.length === 0 && posts.length === 0)
      ? `<p class="muted empty-state">No results for “${esc(q)}”.</p>`
      : `${threads.length ? `<h2 class="search-group">Threads (${esc(threads.length)})</h2>
          <div class="thread-list">${map(threads, (t) => `<a class="thread-row" href="/forum/t/${esc(t.id)}">
            <div class="thread-main">
              <span class="thread-title">${esc(t.title)}</span>
              <span class="muted">${esc(t.category)} · by ${esc(t.username)} · ${esc(timeAgo(t.updated_at))}</span>
            </div></a>`)}</div>` : ''}
        ${posts.length ? `<h2 class="search-group">Posts (${esc(posts.length)})</h2>
          <div class="thread-list">${map(posts, (p) => `<a class="thread-row" href="/forum/t/${esc(p.thread_id)}#post-${esc(p.id)}">
            <div class="thread-main">
              <span class="thread-title">${esc(p.thread_title)}</span>
              <span class="muted">${esc(excerpt(p.body, q))}</span>
              <span class="muted">by ${esc(p.username)} · ${esc(timeAgo(p.created_at))}</span>
            </div></a>`)}</div>` : ''}`;

  const body = `
<div class="section forum-page">
  <div class="container">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span> <span>Search</span>
    </nav>
    <h1 class="section-title">Search</h1>
    <form method="get" action="/forum/search" class="filter-bar" role="search">
      <input type="search" name="q" value="${esc(q)}" minlength="2" maxlength="100" required
             placeholder="Search threads and posts…" aria-label="Search the forum" autofocus>
      <button class="btn btn-outline" type="submit">Search</button>
    </form>
    ${results}
  </div>
</div>`;
  return page(ctx, { title: q ? `Search: ${q}` : 'Search', body });
}

function memberProfile(ctx, { member, stats, recentThreads, recentPosts }) {
  const tier = normalizeTier(member.tier);
  const body = `
<div class="section forum-page">
  <div class="container narrow">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/forum">Forum</a> <span aria-hidden="true">/</span> <span>Members</span>
      <span aria-hidden="true">/</span> <span>${esc(member.username)}</span>
    </nav>
    <div class="panel profile-card">
      <div class="profile-identity">
        <span class="avatar avatar-lg" aria-hidden="true">${esc(member.username[0].toUpperCase())}</span>
        <div>
          <div class="profile-name">${esc(member.username)}
            <span class="uid-badge${member.id <= 1001 ? ' uid-reserved' : ''}">UID ${esc(member.id)}</span>
            <span class="tag tag-tier tag-tier-${esc(tier)}">${esc(TIER_LABELS[tier])}</span>
            ${member.banned ? '<span class="tag tag-banned">BANNED</span>' : ''}</div>
          <div class="muted">Member since ${esc(timeAgo(member.created_at))}</div>
        </div>
      </div>
      <dl class="profile-facts">
        <div><dt>Threads</dt><dd>${esc(stats.threads)}</dd></div>
        <div><dt>Posts</dt><dd>${esc(stats.posts)}</dd></div>
      </dl>
    </div>
    <div class="panel profile-card">
      <h2>Recent threads</h2>
      ${recentThreads.length === 0 ? '<p class="muted">No threads yet.</p>'
        : map(recentThreads, (t) => `<a class="sidebar-thread" href="/forum/t/${esc(t.id)}">
            <span class="sidebar-title">${esc(t.title)}</span>
            <span class="muted">${esc(t.category)} · ${esc(timeAgo(t.updated_at))}</span></a>`)}
    </div>
    <div class="panel profile-card">
      <h2>Recent posts</h2>
      ${recentPosts.length === 0 ? '<p class="muted">No posts yet.</p>'
        : map(recentPosts, (p) => `<a class="sidebar-thread" href="/forum/t/${esc(p.thread_id)}#post-${esc(p.id)}">
            <span class="sidebar-title">${esc(p.thread_title)}</span>
            <span class="muted">${esc(String(p.body).slice(0, 120))}${String(p.body).length > 120 ? '…' : ''}</span>
            <span class="muted">${esc(timeAgo(p.created_at))}</span></a>`)}
    </div>
  </div>
</div>`;
  return page(ctx, { title: `${member.username} · Member`, body });
}

export { index, category, thread, newThread, editPost, searchResults, memberProfile };
