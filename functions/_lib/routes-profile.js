import * as views from "./views/profile.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import {
  requireAuth, destroySession, destroyUserSessions, createSession,
  audit, formBody, setFlash,
} from "./middleware.js";
import { issueLicense } from "./license.js";
import { meetsTier } from "./tiers.js";

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
      'SELECT username, email, tier, created_at, last_login_at, last_login_ip FROM users WHERE id = ?',
      user.id
    );
    // The license is shown to every signed-in member — the loader needs a
    // verifiable "this account is Free" just as much as "this is Paid".
    const license = await issueLicense(user, c.get('cfg'));
    return c.html(views.profile(c.get('view'), {
      account, stats, license, isPaid: meetsTier(user, 'paid'),
    }));
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
