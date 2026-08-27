import * as views from "./views/profile.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import {
  requireAuth, destroySession, destroyUserSessions, createSession,
  audit, formBody, setFlash,
} from "./middleware.js";
import { issueLicense } from "./license.js";
import { meetsTier, isFullAdmin } from "./tiers.js";
import { EMAIL_RE, sendVerificationEmail, isDisposableEmail } from "./routes-auth.js";
import { isEmailConfigured } from "./email.js";
import * as limits from "./limits.js";
import { tooMany } from "./routes-main.js";
import { DELETED_USERNAME, deletedUserId } from "./bootstrap.js";

function register(app) {
  app.get('/profile', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');

    const one = async (sql, ...args) => Number((await db.get(sql, ...args))?.n || 0);
    const stats = {
      threads: await one('SELECT COUNT(*) AS n FROM threads WHERE user_id = ?', user.id),
      posts: await one('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', user.id),
      sessions: await one("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > datetime('now')", user.id),
    };
    const account = await db.get(
      'SELECT id, username, email, tier, email_verified_at, created_at, last_login_at, last_login_ip FROM users WHERE id = ?',
      user.id
    );
    const sessions = await db.all(
      `SELECT id, ip, user_agent, created_at FROM sessions
       WHERE user_id = ? AND expires_at > datetime('now') ORDER BY id DESC LIMIT 20`,
      user.id
    );
    // The license is shown to every signed-in member — the loader needs a
    // verifiable "this account is Free" just as much as "this is Paid".
    const license = await issueLicense(user, c.get('cfg'));
    // Recent crypto payments (if any), newest first, so a member can see an
    // in-flight or past purchase and its status.
    const payments = await db.all(
      `SELECT amount, currency, period_days, status, credited_at, created_at
       FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 5`,
      user.id
    );
    return c.html(views.profile(c.get('view'), {
      account, stats, license, isPaid: meetsTier(user, 'paid'),
      sessions, currentSessionId: c.get('sessionId'), payments,
      isAdminAccount: isFullAdmin(user),
      emailConfigured: isEmailConfigured(c.get('cfg')),
    }));
  });

  // Re-send the verification email (rate-limited per user).
  app.post('/profile/verify-email', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    if (user.email_verified_at) {
      setFlash(c, 'success', 'Your email is already verified.');
      return c.redirect('/profile', 302);
    }
    if (!isEmailConfigured(c.get('cfg'))) {
      setFlash(c, 'error', 'Email sending is not configured on this site yet.');
      return c.redirect('/profile', 302);
    }
    const verdict = await limits.check(db, 'verify', String(user.id), c.get('cfg'));
    if (!verdict.ok) return tooMany(c, verdict.retryAfterSec);
    await sendVerificationEmail(c, user);
    setFlash(c, 'success', `Verification email sent to ${user.email}.`);
    return c.redirect('/profile', 302);
  });

  app.post('/profile/email', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const body = await formBody(c);
    const password = String(body.password || '');
    const email = String(body.email || '').trim();

    const row = await db.get('SELECT password_hash, email FROM users WHERE id = ?', user.id);
    if (!(await verifyPassword(password, row.password_hash))) {
      setFlash(c, 'error', 'Your password was incorrect.');
      return c.redirect('/profile', 302);
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      setFlash(c, 'error', 'Enter a valid email address.');
      return c.redirect('/profile', 302);
    }
    if (isDisposableEmail(email, c.get('cfg'))) {
      setFlash(c, 'error', 'Disposable email addresses cannot be used — use a real inbox.');
      return c.redirect('/profile', 302);
    }
    const taken = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', email, user.id);
    if (taken) {
      setFlash(c, 'error', 'That email is already in use by another account.');
      return c.redirect('/profile', 302);
    }
    // A changed address is unverified until proven; send a fresh link.
    await db.run('UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?', email, user.id);
    await audit(c, 'email_changed', { userId: user.id, username: user.username, detail: `${row.email} -> ${email}` });
    await sendVerificationEmail(c, { id: user.id, username: user.username, email });
    setFlash(c, 'success', isEmailConfigured(c.get('cfg'))
      ? 'Email updated — check your inbox for a new verification link.'
      : 'Email updated.');
    return c.redirect('/profile', 302);
  });

  // Revoke one session (a lost device) without signing out everywhere.
  app.post('/profile/sessions/:id/revoke', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const id = Number.parseInt(c.req.param('id'), 10);
    const session = Number.isInteger(id)
      ? await db.get('SELECT id FROM sessions WHERE id = ? AND user_id = ?', id, user.id)
      : null;
    if (!session) {
      setFlash(c, 'error', 'No such session.');
      return c.redirect('/profile', 302);
    }
    await db.run('DELETE FROM sessions WHERE id = ?', session.id);
    if (session.id === c.get('sessionId')) {
      // They revoked the session they're on — that's a logout.
      await destroySession(c);
      return c.redirect('/auth/login', 302);
    }
    setFlash(c, 'success', 'Session revoked — that device is signed out.');
    return c.redirect('/profile', 302);
  });

  // Self-serve account deletion (Privacy Policy s9): content is reattributed
  // to [deleted], everything identifying the member is removed. The seeded
  // admin can't delete itself here — ADMIN_PASSWORD would just recreate it,
  // and a site must never lose its last admin by accident.
  app.post('/profile/delete', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const body = await formBody(c);

    if (isFullAdmin(user)) {
      setFlash(c, 'error', 'Admin accounts cannot self-delete. Demote the account first (or have another admin delete it).');
      return c.redirect('/profile', 302);
    }
    const row = await db.get('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!(await verifyPassword(String(body.password || ''), row.password_hash))) {
      setFlash(c, 'error', 'Your password was incorrect.');
      return c.redirect('/profile', 302);
    }
    if (String(body.confirm_phrase || '').trim().toUpperCase() !== 'DELETE') {
      setFlash(c, 'error', 'Type DELETE in the confirmation box to close your account.');
      return c.redirect('/profile', 302);
    }

    await audit(c, 'account_deleted', { userId: user.id, username: user.username, detail: 'self-service deletion' });
    const placeholder = await deletedUserId(db);
    await db.run('UPDATE threads SET user_id = ? WHERE user_id = ?', placeholder, user.id);
    await db.run('UPDATE posts SET user_id = ? WHERE user_id = ?', placeholder, user.id);
    await db.run('DELETE FROM shouts WHERE user_id = ?', user.id);
    await destroyUserSessions(db, user.id);
    await db.run('DELETE FROM users WHERE id = ?', user.id);
    await destroySession(c); // clears the cookie; the session row is already gone
    setFlash(c, 'success', `Your account has been deleted. Your posts remain, attributed to ${DELETED_USERNAME}.`);
    return c.redirect('/', 302);
  });

  app.post('/profile/password', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const db = c.get('db');
    const user = c.get('user');
    const body = await formBody(c);

    const current = String(body.current || '');
    const password = String(body.password || '');
    const confirm = String(body.confirm || '');

    const row = await db.get('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!(await verifyPassword(current, row.password_hash))) {
      setFlash(c, 'error', 'Your current password was incorrect.');
      return c.redirect('/profile', 302);
    }
    if (password.length < 8 || password.length > 128) {
      setFlash(c, 'error', 'New password must be 8–128 characters.');
      return c.redirect('/profile', 302);
    }
    if (password !== confirm) {
      setFlash(c, 'error', 'New passwords do not match.');
      return c.redirect('/profile', 302);
    }

    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(password), user.id);
    // Changing the password invalidates every other device's session; this
    // browser gets a fresh session so the user stays signed in.
    await destroyUserSessions(db, user.id);
    await createSession(c, user.id);
    await audit(c, 'password_changed', { userId: user.id, username: user.username });
    setFlash(c, 'success', 'Password updated. Other devices have been signed out.');
    return c.redirect('/profile', 302);
  });

  app.post('/profile/logout-all', async (c) => {
    const gate = requireAuth(c);
    if (gate) return gate;
    const user = c.get('user');
    await destroyUserSessions(c.get('db'), user.id);
    await destroySession(c); // clears this browser's cookie too
    await audit(c, 'logout', { userId: user.id, username: user.username, detail: 'signed out everywhere' });
    setFlash(c, 'success', 'Signed out on every device.');
    return c.redirect('/auth/login', 302);
  });
}

export { register };
