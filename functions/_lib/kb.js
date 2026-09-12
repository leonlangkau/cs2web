/**
 * Help centre ("try this first").
 *
 * Articles are stored as a tiny, deliberately incomplete markup dialect and
 * rendered by renderArticle() below — NEVER as raw HTML. Everything is
 * escaped before a single tag is introduced, so an admin (or anyone who ever
 * gets write access to the table) cannot smuggle script into a page that the
 * site's CSP would otherwise have to defend against.
 *
 * Supported syntax:
 *   ## Heading                 -> <h2>
 *   ### Heading                -> <h3>
 *   - bullet                   -> <ul><li>
 *   1. step                    -> <ol><li>
 *   > note                     -> callout box
 *   ```                        -> fenced code block
 *   `code`  **bold**  *italic* -> inline
 *   [label](/path)             -> link (internal paths and https:// only)
 *   blank line                 -> paragraph break
 */
import { esc } from "./views/util.js";

const MAX_ARTICLE_BODY = 20000;

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

/** Inline formatting, applied to text that is ALREADY HTML-escaped. */
function inline(escaped) {
  return escaped
    // `code`
    .replace(/`([^`]{1,200})`/g, '<code>$1</code>')
    // **bold**
    .replace(/\*\*([^*]{1,200})\*\*/g, '<strong>$1</strong>')
    // *italic* (single asterisks not adjacent to another)
    .replace(/(^|[\s(])\*([^*\s][^*]{0,200})\*(?=[\s.,)!?]|$)/g, '$1<em>$2</em>')
    // [label](target) — internal paths and https:// only; anything else is
    // rendered as plain text so a javascript:/data: URL can never become a link.
    .replace(/\[([^\]]{1,120})\]\(([^)\s]{1,300})\)/g, (whole, label, href) => {
      // Browsers normalise a backslash to a slash inside a URL, so "/\evil.com"
      // resolves protocol-relative and leaves the site. Require a plain path.
      if (href === '/' || (/^\/[^/\\]/.test(href) && !href.includes('\\'))) {
        return `<a href="${href}">${label}</a>`;
      }
      if (/^https:&#x2F;&#x2F;/.test(href) || /^https:\/\//.test(href)) {
        const clean = href.replace(/&#x2F;/g, '/');
        return `<a href="${clean}" rel="noopener noreferrer nofollow" target="_blank">${label}</a>`;
      }
      return whole;
    });
}

/**
 * Renders the article body to HTML. Input is untrusted; output is safe to
 * interpolate into a page.
 */
function renderArticle(body) {
  const lines = String(body || '').slice(0, MAX_ARTICLE_BODY).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;      // 'ul' | 'ol' | null
  let paragraph = [];
  let code = null;      // array of raw code lines while inside a fence

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inline(esc(paragraph.join(' ')))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };
  const openList = (kind) => {
    if (list === kind) return;
    closeList();
    out.push(`<${kind}>`);
    list = kind;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (code !== null) {
      if (/^```/.test(line.trim())) {
        out.push(`<pre class="code-block"><code>${esc(code.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code.push(raw);
      }
      continue;
    }

    if (/^```/.test(line.trim())) { flushParagraph(); closeList(); code = []; continue; }

    if (line.trim() === '') { flushParagraph(); closeList(); continue; }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(); closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(esc(heading[2].trim()))}</h${level}>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph(); closeList();
      out.push(`<p class="kb-note">${inline(esc(quote[1].trim()))}</p>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph(); openList('ul');
      out.push(`<li>${inline(esc(bullet[1].trim()))}</li>`);
      continue;
    }

    const step = /^\d+[.)]\s+(.*)$/.exec(line);
    if (step) {
      flushParagraph(); openList('ol');
      out.push(`<li>${inline(esc(step[1].trim()))}</li>`);
      continue;
    }

    if (list) { closeList(); }
    paragraph.push(line.trim());
  }

  if (code !== null) out.push(`<pre class="code-block"><code>${esc(code.join('\n'))}</code></pre>`);
  flushParagraph();
  closeList();
  return out.join('\n');
}

/** First ~180 characters of prose, for a card blurb when summary is empty. */
function excerpt(body, max = 180) {
  const text = String(body || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^[#>\-*]+\s*/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that', 'have', 'has',
  'was', 'were', 'can', 'cant', 'cannot', 'wont', 'from', 'when', 'what', 'how', 'why', 'does',
  'doesnt', 'didnt', 'its', 'it', 'my', 'me', 'i', 'a', 'an', 'is', 'to', 'of', 'in', 'on', 'at',
  'be', 'do', 'get', 'got', 'please', 'help', 'hi', 'hello', 'thanks', 'issue', 'problem',
]);

/** Meaningful lowercase terms from a query or a whole ticket body. */
function terms(text, max = 12) {
  const seen = [];
  for (const word of String(text || '').toLowerCase().split(/[^a-z0-9+#]+/)) {
    const w = word.trim();
    if (w.length < 3 || STOP_WORDS.has(w) || seen.includes(w)) continue;
    seen.push(w);
    if (seen.length >= max) break;
  }
  return seen;
}

/**
 * Keyword search over published articles.
 *
 * Deliberately plain scoring in JS rather than FTS5. Both backends could do
 * FTS5, but it would mean a virtual table to keep in sync on every article
 * edit, a second code path for the two adapters, and BM25 ranking we cannot
 * tune — when what actually matters here is that a curated `keywords` field
 * outweighs the body, so "crash on launch" finds the launch-crash article
 * rather than every page that happens to say "launch". At help-centre scale
 * (tens of articles) one scan is cheaper than the machinery. Revisit if this
 * ever grows into the hundreds.
 */
async function searchArticles(db, query, { limit = 6, includeUnpublished = false } = {}) {
  const words = terms(query);
  const where = includeUnpublished ? '1 = 1' : 'a.published = 1';
  const rows = await db.all(
    `SELECT a.id, a.slug, a.title, a.summary, a.keywords, a.body, a.views, a.pinned,
            a.helpful_yes, a.helpful_no, s.name AS section_name, s.slug AS section_slug
       FROM help_articles a JOIN help_sections s ON s.id = a.section_id
      WHERE ${where}`
  );
  if (!words.length) {
    return rows
      .sort((a, b) => (b.pinned - a.pinned) || (b.views - a.views))
      .slice(0, limit);
  }

  const scored = rows.map((row) => {
    const title = String(row.title || '').toLowerCase();
    const keywords = String(row.keywords || '').toLowerCase();
    const summary = String(row.summary || '').toLowerCase();
    const body = String(row.body || '').toLowerCase();
    let score = 0;
    for (const word of words) {
      if (title.includes(word)) score += 8;
      if (keywords.includes(word)) score += 6;
      if (summary.includes(word)) score += 3;
      if (body.includes(word)) score += 1;
    }
    // Phrase hit in the title is worth more than any pile of single words.
    const phrase = String(query || '').toLowerCase().trim();
    if (phrase.length > 6 && title.includes(phrase)) score += 12;
    if (row.pinned) score += 2;
    return { row, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (b.row.views - a.row.views))
    .slice(0, limit)
    .map((s) => s.row);
}

/* ------------------------------------------------------------------ *
 * Seed content — the "try this first" library the site ships with
 * ------------------------------------------------------------------ */

const SECTIONS = [
  ['getting-started', 'Getting started', 'Install GoyHub, sign in and get your first match tracked.', '🚀', 0],
  ['account', 'Account & login', 'Passwords, email verification, sessions and closing your account.', '🔑', 1],
  ['membership', 'Membership & payments', 'Upgrading, crypto checkout, what Paid unlocks and when it renews.', '💳', 2],
  ['app', 'App problems', 'Crashes, updates, stats that will not appear and other bugs.', '🛠️', 3],
  ['performance', 'In-game & performance', 'FPS presets, configs, crosshairs and overlay behaviour.', '🎯', 4],
  ['safety', 'Safety & anti-cheat', 'VAC, trust factor, what GoyHub does and does not touch.', '🛡️', 5],
];

/**
 * Every article is written as a "try this first" runbook: the fix comes
 * before the explanation, and the last line always says what to do if none
 * of it worked, so the page itself is the deflection.
 */
const ARTICLES = [
  ['getting-started', 'install-goyhub', 'Installing GoyHub on Windows',
    'Download, run the installer and sign in — plus what to do if Windows blocks it.',
    'install setup download windows smartscreen defender installer setup.exe', 1, 0,
    `## Before you start

GoyHub runs on Windows 10 and 11 (64-bit) and needs Counter-Strike 2 installed through Steam. The download is a members' benefit, so sign in first.

## Install it

1. Sign in on the website, then open [Download](/download).
2. Run **GoyHub-Setup.exe** and accept the installer's prompts.
3. Launch GoyHub and sign in with the *same* username and password you use on this site — there is no separate licence key.
4. Start CS2. Your next match appears in GoyHub within a minute of it ending.

## If Windows blocks the installer

SmartScreen warns about any installer it has not seen thousands of times yet. That is a reputation score, not a virus verdict.

1. Click **More info**, then **Run anyway**.
2. If your antivirus quarantined the file, restore it and add an exclusion for the GoyHub install folder.
3. Re-download rather than reusing a partially downloaded file — a truncated download fails in exactly this way.

> Only ever download GoyHub from this website while signed in. Any "GoyHub" build from a forum mirror, Discord DM or torrent is not ours.

## Still stuck?

Open a ticket with the exact error text (or a screenshot), your Windows version, and whether the installer failed to download or failed to run.`],

  ['getting-started', 'first-match-not-tracked', 'My first match did not show up',
    'Matches take a few minutes to appear. Here is the order to check things in.',
    'stats match tracking not showing missing heatmap demo history sync', 2, 0,
    `## Try this first

1. Finish the match completely and return to the CS2 main menu — GoyHub reads the match after it is written, not while you are playing.
2. Wait five minutes and press **Refresh** on the Matches tab.
3. Check that GoyHub is signed in: your username shows in the top right of the app.
4. Make sure your Steam profile and *Game details* are set to **Public** in Steam → Privacy Settings. A private profile hides your match history from every third-party tool, including this one.
5. Restart GoyHub once. It re-reads your match history on launch.

## Things that legitimately never appear

- Casual, Deathmatch and community-server games — only Premier, Competitive and Wingman are tracked.
- Matches you left before the end.
- Matches played on an account other than the Steam account GoyHub is linked to.

## Still stuck?

Open a ticket and include the match's date and mode, your Steam profile privacy setting, and whether *any* matches show up or none at all.`],

  ['account', 'reset-password', 'Reset or change your password',
    'Change it from your profile if you are signed in; use the reset link if you are locked out.',
    'password reset forgot login locked out change password email', 1, 1,
    `## If you are still signed in somewhere

Open [your profile](/profile) and use **Change password**. Everything else stays as it is, and you can end your other sessions from the same page.

## If you are locked out

1. Go to [Forgot password](/auth/forgot) and enter your username or email address.
2. Open the link in the email within one hour — the link is single-use and expires.
3. Check spam and promotions folders before assuming it did not arrive.

## No email arriving?

- The address on the account may be an old one. Support can verify ownership another way — open a ticket **from the email address on the account** if you still have it.
- Some deployments of this site have outbound email switched off. If [Forgot password](/auth/forgot) tells you resets are unavailable, that is why: open a ticket instead.

> Support will never ask you for your password. Nobody at GoyHub needs it, and any message that asks for it is not from us.`],

  ['account', 'delete-account', 'Delete your account and your data',
    'Self-serve deletion from your profile, what is removed and what is kept.',
    'delete account close remove data gdpr privacy erase', 2, 0,
    `## Delete it yourself

1. Open [your profile](/profile).
2. Scroll to **Danger zone** → **Delete account**.
3. Confirm with your password.

Deletion is immediate and cannot be undone.

## What is removed

Your username, email address, password hash, sessions, licences and IP history.

## What is kept

Forum threads and replies stay, reattributed to a reserved **[deleted]** account, so other members' conversations are not destroyed by one person leaving. Nothing in them identifies you.

Support tickets are kept while we still need them to handle a dispute or a payment, then removed. See the [Privacy Policy](/privacy) for the retention detail.

## Paid membership

Deleting the account ends the membership immediately. There is no partial refund of a period already paid for.`],

  ['membership', 'what-paid-unlocks', 'What a Paid membership unlocks',
    'The forum, the app download and the desktop app itself — and what free accounts get.',
    'paid membership upgrade free tier benefits what do i get subscription', 1, 1,
    `## Free account

- Sign in on the website and in the app
- The full help centre and support desk — free members get exactly the same support queue as paid members
- Read-only access to public pages

## Paid membership

- The community [forum](/forum), including the shoutbox and member profiles
- The [app download](/download) and the desktop app's tracking features
- Priority in the support queue when the ticket is about a paid feature

## How the app knows

The desktop app signs in with your website account and receives a short-lived signed licence. Upgrades, downgrades and bans apply on the next launch. There is no licence key to copy anywhere.

See [Upgrade](/upgrade) for current pricing and lengths.`],

  ['membership', 'crypto-payment-pending', 'I paid but I am still on Free',
    'What to check before opening a billing ticket — most payments settle on their own.',
    'payment crypto btc eth sol usdt pending not credited confirmations invoice order', 2, 1,
    `## Try this first

1. Open [Upgrade](/upgrade) while signed in. An unfinished payment is re-checked every time that page loads, and most upgrades complete here without anyone doing anything.
2. Give it time. On-chain payments only count once they have enough confirmations — that is minutes on Solana, and can be an hour or more on Ethereum when the network is busy.
3. Check you sent the **exact amount quoted**. Each order is quoted a unique amount to the last few decimals; that is how an anonymous transfer is matched to your account. Rounding it changes what arrives.
4. Check you sent the right asset on the right network. USDT on the wrong chain does not arrive at all.
5. Sign out and back in — the tier is read fresh on sign-in.

## Then open a ticket

If it still has not credited after an hour, open a **Payments & membership** ticket with:

- the transaction hash,
- the asset and network you sent on,
- the exact amount sent,
- the order reference from the checkout page.

> Never send your wallet's seed phrase or private key to anyone, including us. Support only ever needs a public transaction hash.`],

  ['app', 'app-wont-start', 'GoyHub will not start or crashes on launch',
    'The five checks that fix nearly every launch failure, in order.',
    'crash crashing wont start launch error freeze hang startup not opening', 1, 1,
    `## Try this first

1. **Restart Windows.** Genuinely — a half-updated runtime is the single most common cause.
2. **Run as administrator** once: right-click GoyHub → *Run as administrator*.
3. **Reinstall over the top.** Download a fresh installer from [Download](/download) and run it without uninstalling first; it repairs a damaged install and keeps your settings.
4. **Check your antivirus quarantine.** If GoyHub vanished from disk, that is where it went. Restore it and add an exclusion.
5. **Update your GPU drivers.** A crash on the very first frame is usually the overlay meeting a stale driver.

## Collect a log before opening a ticket

Press <kbd>Win</kbd>+<kbd>R</kbd>, paste this and press Enter:

\`\`\`
%APPDATA%\\GoyHub\\logs
\`\`\`

Attach the newest \`.log\` file to your ticket — that one file usually turns a week of back-and-forth into a single reply.

## Still stuck?

Open an **App bugs & crashes** ticket with the log file, your Windows version and your GPU.`],

  ['app', 'update-failed', 'An update failed or GoyHub is stuck on an old version',
    'Force the update, or reinstall over the top without losing your settings.',
    'update updating failed stuck old version outdated patch upgrade app', 2, 0,
    `## Try this first

1. Close GoyHub completely — check the system tray, it may still be running there.
2. Reopen it and let the updater finish without switching networks.
3. If it fails again, download the current installer from [Download](/download) and run it over the top. Your settings, presets and history are kept.
4. If the installer will not run, see [GoyHub will not start or crashes on launch](/help/a/app-wont-start).

## Why it usually fails

- A VPN or corporate proxy interrupting the download
- Antivirus locking the file mid-write
- Not enough free disk space on the system drive

## Still stuck?

Open a ticket with the version shown in GoyHub → Settings → About, and the exact updater error.`],

  ['performance', 'fps-drop-with-overlay', 'My FPS dropped after installing GoyHub',
    'What GoyHub actually costs in frames, and how to get them back.',
    'fps performance lag stutter frames overlay slow drop', 1, 1,
    `## Try this first

1. Open GoyHub → **Settings → In-game** and turn the overlay **off**. Play one match and compare.
2. Turn off *background match parsing while in-game* — it moves the work to when you are in the menu instead.
3. Cap your frame rate a few frames below your monitor's refresh rate. An uncapped CS2 competing with any other process is where most "stutter" reports come from.
4. Check you are not running two overlays at once. Steam, Discord, GeForce Experience, RivaTuner and GoyHub all drawing at once is the actual problem more often than any one of them.

## What it should cost

Under 1% of frames with the overlay off, and low single digits with it on. If you are seeing more than that, it is a bug and we want the ticket.

## Still stuck?

Open an **In-game & performance** ticket with your CPU, GPU, monitor refresh rate, and your FPS with GoyHub closed versus open.`],

  ['performance', 'config-not-applying', 'A config or crosshair will not apply',
    'CS2 rewrites some settings on exit — here is the order that makes changes stick.',
    'config crosshair autoexec settings not applying reverting launch options cfg', 2, 0,
    `## Try this first

1. Apply the config from GoyHub while CS2 is **closed**. CS2 overwrites its own config files when it exits, so anything written while it is running is lost.
2. Start CS2 and check in-game.
3. If it reverted, remove \`-autoconfig\` from your Steam launch options — it forces CS2 to redetect settings on every start.
4. Make sure the config is not read-only. Right-click the file → Properties → uncheck **Read-only**.

## Crosshairs specifically

Use the crosshair *share code* rather than editing the cfg by hand — the code is applied by the game itself and cannot be overwritten by a config reset.

## Still stuck?

Open a ticket with the config you are applying and what it looks like after CS2 restarts.`],

  ['safety', 'is-goyhub-vac-safe', 'Is GoyHub safe to use with VAC?',
    'What GoyHub reads, what it never touches, and why that matters for your account.',
    'vac ban anticheat safe trust factor cheat injection memory legal', 1, 1,
    `## The short answer

Yes. GoyHub does not read or write game memory, does not inject code into CS2, and does not automate anything in the game. It reads the same public match data Valve exposes to every third-party stats site, plus your own local config files that you own.

That is the line VAC cares about, and GoyHub stays on the safe side of it.

## What GoyHub does

- Reads finished match data from your public Steam profile
- Reads and writes your local CS2 config files, when you ask it to
- Draws an optional overlay in the menu and scoreboard

## What GoyHub never does

- Read or modify the game's memory
- Inject a DLL into the game process
- Give any in-game advantage — no walls, no aim assistance, no radar hacks

> If anyone offers you a "GoyHub premium build" with in-game advantages, it is malware wearing our name. Report it and do not run it.

## Still worried?

Open a **Anti-cheat & safety** ticket and ask. We would rather answer it twice than have you guess.`],

  ['safety', 'report-security-issue', 'Report a security or privacy issue',
    'How to report a vulnerability, an account takeover or a data concern.',
    'security vulnerability report hack breach compromised account phishing disclosure', 2, 0,
    `## If your account is compromised right now

1. Reset your password immediately at [Forgot password](/auth/forgot).
2. Open [your profile](/profile) and use **Sign out everywhere** — that kills every other session.
3. Then open a ticket at **Urgent** priority so we can check the account's IP history with you.

## Reporting a vulnerability

Open a **Anti-cheat & safety** ticket, or email the address on our [Privacy Policy](/privacy), with:

- what you found and where,
- the steps to reproduce it,
- what an attacker could do with it.

Please give us a reasonable window to fix it before publishing. We do not run a paid bounty programme, but we do credit reporters who ask to be credited.

> Do not include working credentials, tokens or other people's personal data in the report. Describe where they are instead — a support ticket is not a safe place to store them.`],
];

/**
 * Seeds the help centre once. Idempotent: an operator who has since edited or
 * deleted an article never has it silently reinstated, because the whole seed
 * is skipped as soon as any section exists.
 */
/**
 * Which ticket topic a help section belongs to, so an article that failed to
 * deflect opens a ticket already filed correctly. Unknown sections fall
 * through to 'other', which is what a custom section should do.
 */
const SECTION_CATEGORY = {
  'getting-started': 'install',
  account: 'account',
  membership: 'billing',
  app: 'app',
  performance: 'ingame',
  safety: 'safety',
};

const categoryForSection = (slug) => SECTION_CATEGORY[String(slug || '')] || 'other';

async function seedHelpCentre(db) {
  if (await db.get('SELECT id FROM help_sections LIMIT 1')) return false;

  const sectionIds = {};
  for (const [slug, name, description, icon, position] of SECTIONS) {
    const res = await db.run(
      'INSERT INTO help_sections (slug, name, description, icon, position) VALUES (?, ?, ?, ?, ?)',
      slug, name, description, icon, position
    );
    sectionIds[slug] = Number(res.lastInsertRowid);
  }

  for (const [section, slug, title, summary, keywords, position, pinned, body] of ARTICLES) {
    const sectionId = sectionIds[section];
    if (!sectionId) continue;
    await db.run(
      `INSERT INTO help_articles (section_id, slug, title, summary, keywords, position, pinned, body)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      sectionId, slug, title, summary, keywords, position, pinned, body
    );
  }
  return true;
}

/** Canned replies the desk starts with; same one-shot rule as the articles. */
const MACROS = [
  ['Ask for the app log', 'app',
    'Thanks for the report — to get to the bottom of this I need the log file.\n\n'
    + '1. Press Win+R, paste %APPDATA%\\GoyHub\\logs and press Enter.\n'
    + '2. Attach the newest .log file to this ticket.\n\n'
    + 'Your Windows version and GPU would help too.\n\n— GoyHub Support',
    'pending', null, 'needs-info'],
  ['Payment: ask for the transaction hash', 'billing',
    'Thanks — I can chase this down with a few details:\n\n'
    + '1. The transaction hash\n'
    + '2. The asset and network you sent on\n'
    + '3. The exact amount sent\n'
    + '4. The order reference from the checkout page\n\n'
    + 'Please never send a seed phrase or private key — only the public transaction hash.\n\n— GoyHub Support',
    'pending', null, 'billing,needs-info'],
  ['Payment credited', 'billing',
    'Found it — the payment is confirmed and your membership is now active. '
    + 'Sign out and back in (or restart the app) and the Paid features will be there.\n\n'
    + 'Sorry for the wait, and thanks for the detail you sent through.\n\n— GoyHub Support',
    'solved', null, 'billing'],
  ['Holding reply', '',
    'Thanks for getting in touch — I have your ticket and I am looking into it now. '
    + 'I will come back to you here as soon as I have something concrete.\n\n— GoyHub Support',
    'pending', null, ''],
  ['Solved — anything else?', '',
    'Glad that sorted it. I will leave this ticket open for a few days in case anything else comes '
    + 'up — just reply here and it reopens automatically.\n\n— GoyHub Support',
    'solved', null, ''],
  ['Not a GoyHub build (malware warning)', 'safety',
    'That build did not come from us. GoyHub is only ever distributed from the members-only download '
    + 'page on our site — anything from a mirror, a Discord DM or a torrent is malware using our name.\n\n'
    + 'Please uninstall it, run a full antivirus scan, and change your Steam and GoyHub passwords from '
    + 'a machine you trust.\n\n— GoyHub Support',
    'answered', 'high', 'safety,malware'],
];

async function seedMacros(db) {
  if (await db.get('SELECT id FROM support_macros LIMIT 1')) return false;
  let position = 0;
  for (const [title, category, body, setStatus, setPriority, setTags] of MACROS) {
    await db.run(
      `INSERT INTO support_macros (title, category, body, set_status, set_priority, set_tags, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      title, category, body, setStatus, setPriority, setTags, position
    );
    position += 1;
  }
  return true;
}

export {
  renderArticle, excerpt, searchArticles, terms, categoryForSection,
  seedHelpCentre, seedMacros, SECTIONS, ARTICLES, MACROS, MAX_ARTICLE_BODY,
};
