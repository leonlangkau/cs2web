/**
 * Public status page and its machine-readable twin.
 *
 * Deliberately open to everyone, including logged-out visitors and banned
 * accounts: the people who most need to know whether sign-in is broken are the
 * ones who cannot sign in. Nothing here reads a session beyond deciding whether
 * to show staff a "Manage" link.
 */
import * as views from "./views/status.js";
import { isStaff } from "./tiers.js";
import { statusSnapshot, publicSnapshot } from "./status.js";

function register(app) {
  app.get('/status', async (c) => {
    const snapshot = await statusSnapshot(c.get('db'), { history: true });
    // A status page must never be served from a cache that outlives the
    // incident it is reporting.
    c.header('Cache-Control', 'no-store');
    return c.html(views.statusPage(c.get('view'), {
      snapshot,
      canEdit: isStaff(c.get('user')),
    }));
  });

  /**
   * The same data as JSON — for uptime monitors, the desktop app, and the
   * page's own live poll. CORS is open because a status endpoint that only
   * this origin can read defeats the point of publishing one.
   */
  app.get('/status.json', async (c) => {
    const snapshot = await statusSnapshot(c.get('db'));
    c.header('Cache-Control', 'no-store');
    c.header('Access-Control-Allow-Origin', '*');
    return c.json(publicSnapshot(snapshot));
  });

  // Older/alternate spellings people try before finding the real one.
  app.get('/status/', (c) => c.redirect('/status', 301));
  app.get('/uptime', (c) => c.redirect('/status', 301));
}

export { register };
