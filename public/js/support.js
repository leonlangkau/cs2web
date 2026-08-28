/* GoyHub support desk: live ticket chat, "try this first" lookahead and the
   ticket-link copy button.

   Same philosophy as the shoutbox in main.js — "live" is fast polling while
   the tab is visible, paused when it is hidden, with an immediate catch-up
   when it comes back. Every feature here is an enhancement: with JavaScript
   off, the chat is a normal form post and the page still works end to end. */
(function () {
  'use strict';

  var ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) { return ESCAPES[ch]; });
  }

  /* ---------- Copy the guest ticket link ---------- */
  document.querySelectorAll('.pay-copy[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var text = button.getAttribute('data-copy') || '';
      var done = function () {
        var original = button.textContent;
        button.textContent = button.getAttribute('data-copied') || 'Copied';
        setTimeout(function () { button.textContent = original; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this link:', text); });
        return;
      }
      window.prompt('Copy this link:', text);
    });
  });

  /* ---------- Live ticket chat ---------- */
  var chat = document.getElementById('ticket-chat');
  if (chat) {
    var log = document.getElementById('chat-log');
    var composer = document.getElementById('ticket-composer');
    var liveBadge = document.getElementById('chat-live');
    var pollUrl = chat.getAttribute('data-poll');
    var lastId = parseInt(chat.getAttribute('data-last-id'), 10) || 0;
    var polling = false;
    var failures = 0;

    var scrollToEnd = function () { log.scrollTop = log.scrollHeight; };
    scrollToEnd();

    function fileChip(f) {
      var href = '/support/attachments/' + encodeURIComponent(f.id);
      return '<a class="attach-item' + (f.image ? ' attach-image' : '') + '" href="' + href + '"'
        + (f.image ? '' : ' download') + '>'
        + '<span class="attach-icon" aria-hidden="true">' + (f.image ? '&#128444;' : '&#128196;') + '</span>'
        + '<span class="attach-name">' + escapeHtml(f.name) + '</span>'
        + '<span class="muted attach-size">' + escapeHtml(f.kb) + ' KB</span></a>';
    }

    /* Mirrors chatMessage() in functions/_lib/views/support.js, so a message
       that arrived by poll is indistinguishable from one that was rendered
       server-side on the next reload. */
    function renderMessage(m) {
      var role = (m.role === 'staff' || m.role === 'system') ? m.role : 'user';
      var row = document.createElement('div');
      row.className = 'chat-msg chat-msg-' + role + ' chat-msg-new';
      row.setAttribute('data-id', m.id);
      row.id = 'msg-' + m.id;
      var files = (m.files || []).map(fileChip).join('');
      row.innerHTML = '<div class="chat-head">'
        + '<span class="chat-who">' + escapeHtml(m.author)
        + (role === 'staff' ? ' <span class="tag tag-admin">SUPPORT</span>' : '') + '</span>'
        + '<span class="chat-time muted">just now</span></div>'
        + '<div class="chat-body post-text">' + escapeHtml(m.body) + '</div>'
        + (files ? '<div class="attach-list">' + files + '</div>' : '');
      return row;
    }

    function poll() {
      if (polling) return;
      polling = true;
      var sep = pollUrl.indexOf('?') >= 0 ? '&' : '?';
      fetch(pollUrl + sep + 'after=' + lastId, { headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.ok) { failures += 1; return; }
          failures = 0;
          if (liveBadge) liveBadge.hidden = false;
          if (!data.messages || !data.messages.length) return;
          var empty = log.querySelector('.chat-empty');
          if (empty) empty.remove();
          var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
          data.messages.forEach(function (m) {
            if (m.id <= lastId) return;
            log.appendChild(renderMessage(m));
            lastId = m.id;
          });
          // A ticket left open all day should not grow an unbounded DOM.
          while (log.children.length > 120) log.removeChild(log.firstChild);
          if (atBottom) scrollToEnd();
          // A staff member closing the ticket removes the composer on reload;
          // until then, say so rather than letting a reply fail on submit.
          if (data.canReply === false && composer) {
            composer.insertAdjacentHTML('beforebegin',
              '<p class="muted locked-note">This ticket has been closed. Reload the page to see the final state.</p>');
            composer.remove();
            composer = null;
          }
        })
        .catch(function () { failures += 1; })
        .then(function () { polling = false; });
    }

    poll();
    /* 3s while visible; back off to 15s after repeated failures so a broken
       connection (or a rate limit) does not turn into a retry storm. */
    setInterval(function () {
      if (document.hidden) return;
      if (failures > 3 && (Date.now() / 1000 | 0) % 5 !== 0) return;
      poll();
    }, 3000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) poll();
    });

    var fileInput = composer ? composer.querySelector('input[type="file"]') : null;

    if (composer) {
      composer.addEventListener('submit', function (e) {
        var textarea = composer.querySelector('textarea[name="body"]');
        var hasFiles = fileInput && fileInput.files && fileInput.files.length > 0;
        if (!textarea.value.trim() && !hasFiles) return;
        // Let the browser do a normal multipart POST when files are attached:
        // the redirect response re-renders the thread with them in place.
        if (hasFiles) return;

        e.preventDefault();
        var button = composer.querySelector('button[type="submit"]');
        button.disabled = true;
        fetch(composer.getAttribute('action'), {
          method: 'POST',
          headers: { 'X-Requested-With': 'fetch' },
          credentials: 'same-origin',
          body: new FormData(composer),
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            if (res.ok && res.data && res.data.ok) {
              textarea.value = '';
              poll();
            } else {
              window.alert((res.data && res.data.error) || 'Could not send. Try again.');
            }
          })
          .catch(function () { window.alert('Network error — your message was not sent.'); })
          .then(function () {
            button.disabled = false;
            textarea.focus();
          });
      });
    }
  }

  /* ---------- Show the chosen filename next to any Attach button ---------- */
  document.querySelectorAll('.chat-attach').forEach(function (wrapper) {
    var input = wrapper.querySelector('input[type="file"]');
    var label = wrapper.querySelector('.chat-attach-name');
    if (!input || !label) return;
    input.addEventListener('change', function () {
      var n = input.files ? input.files.length : 0;
      label.textContent = n === 0 ? '' : (n === 1 ? input.files[0].name : n + ' files');
    });
  });

  /* ---------- "Try this first" lookahead on the new-ticket form ---------- */
  var ticketForm = document.querySelector('.ticket-form');
  if (ticketForm && document.getElementById('deflect-note')) {
    var subject = ticketForm.querySelector('input[name="subject"]');
    var problem = ticketForm.querySelector('textarea[name="body"]');
    var panel = document.getElementById('try-first');
    var timer = null;
    var lastQuery = '';

    function ensurePanel() {
      if (panel) return panel;
      panel = document.createElement('div');
      panel.className = 'try-first';
      panel.id = 'try-first';
      ticketForm.parentNode.insertBefore(panel, ticketForm);
      return panel;
    }

    function render(suggestions) {
      var box = ensurePanel();
      if (!suggestions.length) { box.innerHTML = ''; box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<h2>Try this first</h2>'
        + '<p class="muted">These look like they cover what you described. '
        + 'Opening one does not lose your draft.</p>'
        + suggestions.map(function (s) {
          return '<a class="try-first-item" href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener">'
            + '<span class="try-first-title">' + escapeHtml(s.title) + '</span>'
            + '<span class="muted">' + escapeHtml(s.why || '') + '</span></a>';
        }).join('');
    }

    function lookahead() {
      var text = (subject ? subject.value : '') + '\n' + (problem ? problem.value : '');
      if (text.trim().length < 25 || text === lastQuery) return;
      lastQuery = text;
      var payload = new FormData();
      payload.append('_csrf', (ticketForm.querySelector('input[name="_csrf"]') || {}).value || '');
      payload.append('subject', subject ? subject.value : '');
      payload.append('body', problem ? problem.value : '');
      fetch('/support/suggest', {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch' },
        credentials: 'same-origin',
        body: payload,
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { if (data && data.ok) render(data.suggestions || []); })
        .catch(function () { /* the panel just stays as it is */ });
    }

    [subject, problem].forEach(function (field) {
      if (!field) return;
      field.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(lookahead, 900);
      });
      field.addEventListener('blur', lookahead);
    });
  }

  /* ---------- Admin: insert a macro into the reply box ---------- */
  document.querySelectorAll('[data-macro-body]').forEach(function (button) {
    button.addEventListener('click', function () {
      var target = document.querySelector(button.getAttribute('data-macro-target') || '#staff-reply');
      if (!target) return;
      var text = button.getAttribute('data-macro-body') || '';
      target.value = target.value.trim() ? target.value.replace(/\s*$/, '\n\n') + text : text;
      target.focus();
      target.setSelectionRange(target.value.length, target.value.length);
    });
  });
})();
