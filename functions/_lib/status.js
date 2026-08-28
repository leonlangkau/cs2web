/**
 * Status page domain: component health, incidents and the one verdict the
 * whole page hangs off.
 *
 * The rule that keeps this honest: the overall status is DERIVED, never
 * stored. There is no "everything is fine" switch an admin can leave on while
 * a component sits in `major` — the worst visible component wins, always. The
 * same derivation feeds the page, the JSON endpoint, the nav badge and the
 * banner on the support form, so the four can never disagree.
 */
import { notifySupport } from "./webhooks.js";

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

/**
 * Component states, ORDERED BY SEVERITY. The order is the API: `worstOf()`
 * and the overall verdict both index into it, so adding a state means putting
 * it in the right place here and nowhere else.
 */
const COMPONENT_STATES = ['operational', 'maintenance', 'degraded', 'partial', 'major'];

const COMPONENT_LABELS = {
  operational: 'Operational',
  maintenance: 'Under maintenance',
  degraded: 'Degraded performance',
  partial: 'Partial outage',
  major: 'Major outage',
};

/** Short form for the dense component list. */
const COMPONENT_SHORT = {
  operational: 'Operational',
  maintenance: 'Maintenance',
  degraded: 'Degraded',
  partial: 'Partial outage',
  major: 'Major outage',
};

/** Which visual family a state belongs to — drives the pulse colour. */
const COMPONENT_TONE = {
  operational: 'ok',
  maintenance: 'info',
  degraded: 'warn',
  partial: 'warn',
  major: 'down',
};

/** Headline shown across the top of /status for each overall verdict. */
const OVERALL_HEADLINE = {
  operational: 'All systems operational',
  maintenance: 'Maintenance in progress',
  degraded: 'Degraded performance',
  partial: 'Partial outage',
  major: 'Major outage',
};

const OVERALL_BLURB = {
  operational: 'Everything is running normally. If something is broken for you, that is worth a ticket.',
  maintenance: 'Planned work is underway. Some things may be briefly unavailable.',
  degraded: 'Something is slower or flakier than it should be. We are on it.',
  partial: 'Part of the service is down. The rest is unaffected.',
  major: 'A core part of the service is down. We are working on it right now.',
};

const INCIDENT_STATES = ['investigating', 'identified', 'monitoring', 'resolved'];
const MAINTENANCE_STATES = ['scheduled', 'in_progress', 'completed'];
const ALL_INCIDENT_STATES = [...INCIDENT_STATES, ...MAINTENANCE_STATES];

const STATE_LABELS = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
};

const IMPACTS = ['none', 'minor', 'major', 'critical'];
const IMPACT_LABELS = { none: 'No impact', minor: 'Minor', major: 'Major', critical: 'Critical' };

/** States that mean the incident is over. */
const CLOSED_STATES = new Set(['resolved', 'completed']);

const MAX_TITLE = 120;
const MAX_UPDATE = 4000;

const normalizeComponentState = (v) => (COMPONENT_STATES.includes(v) ? v : 'operational');
const normalizeIncidentState = (v) => (ALL_INCIDENT_STATES.includes(v) ? v : 'investigating');
const normalizeImpact = (v) => (IMPACTS.includes(v) ? v : 'minor');
const isClosed = (incident) => CLOSED_STATES.has(incident.state) || Boolean(incident.resolved_at);

/** The more severe of two component states. */
const worstOf = (a, b) =>
  (COMPONENT_STATES.indexOf(normalizeComponentState(a)) >= COMPONENT_STATES.indexOf(normalizeComponentState(b))
    ? normalizeComponentState(a) : normalizeComponentState(b));

/**
 * The single verdict for the whole site: the worst visible component. Derived
 * on every read rather than stored, so it cannot drift from what the page
 * below it is showing.
 */
function overallStatus(components) {
  return components.reduce((worst, c) => (c.visible ? worstOf(worst, c.status) : worst), 'operational');
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

const listComponents = (db, { includeHidden = false } = {}) => db.all(
  `SELECT * FROM status_components ${includeHidden ? '' : 'WHERE visible = 1'} ORDER BY position, id`
);

/** Open incidents, newest first, each with its full update trail. */
async function openIncidents(db) {
  const rows = await db.all(
    `SELECT * FROM status_incidents WHERE resolved_at IS NULL
      ORDER BY started_at DESC LIMIT 20`
  );
  return withUpdates(db, rows);
}

/** Everything that has happened in the last `days`, closed or not. */
async function recentIncidents(db, { days = 90, limit = 30 } = {}) {
  const since = Date.now() - days * 86_400_000;
  const rows = await db.all(
    `SELECT * FROM status_incidents WHERE started_at > ? ORDER BY started_at DESC LIMIT ?`,
    since, limit
  );
  return withUpdates(db, rows);
}

/** Maintenance that has not started yet. */
const upcomingMaintenance = (db) => db.all(
  `SELECT * FROM status_incidents
    WHERE kind = 'maintenance' AND resolved_at IS NULL
      AND scheduled_for IS NOT NULL AND scheduled_for > ?
    ORDER BY scheduled_for LIMIT 10`,
  Date.now()
);

/**
 * Attaches each incident's updates. One query for the lot rather than one per
 * incident — D1 charges a round-trip per statement, and a busy week could
 * otherwise turn the status page into thirty of them.
 */
async function withUpdates(db, incidents) {
  if (!incidents.length) return [];
  const ids = incidents.map((i) => i.id);
  // D1 caps bound parameters at 100 per query; the callers above cap the
  // incident count well below that, but chunk anyway so a future caller
  // raising a LIMIT cannot silently break this.
  const updates = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    updates.push(...await db.all(
      `SELECT * FROM status_updates WHERE incident_id IN (${chunk.map(() => '?').join(',')})
        ORDER BY id DESC`,
      ...chunk
    ));
  }
  return incidents.map((incident) => ({
    ...incident,
    updates: updates.filter((u) => Number(u.incident_id) === Number(incident.id)),
  }));
}

/**
 * Ninety days of history per component, derived from the incident log rather
 * than from a daily snapshot table. One less thing to write on a schedule that
 * does not exist, and it cannot disagree with the incidents printed below it.
 *
 * Each day gets the worst state any incident touching that component reached,
 * mapped from incident impact; a day with no incident is operational.
 */
function uptimeHistory(components, incidents, { days = 90, now = Date.now() } = {}) {
  const DAY = 86_400_000;
  const IMPACT_TO_STATE = { critical: 'major', major: 'partial', minor: 'degraded', none: 'maintenance' };
  const startOfToday = Math.floor(now / DAY) * DAY;

  return components.map((component) => {
    const mine = incidents.filter((i) => incidentTouches(i, component.slug));
    const timeline = [];
    for (let d = days - 1; d >= 0; d -= 1) {
      const dayStart = startOfToday - d * DAY;
      const dayEnd = dayStart + DAY;
      let state = 'operational';
      for (const incident of mine) {
        const from = Number(incident.started_at);
        const to = incident.resolved_at ? Number(incident.resolved_at) : now;
        if (from < dayEnd && to >= dayStart) {
          state = worstOf(state, incident.kind === 'maintenance'
            ? 'maintenance'
            : (IMPACT_TO_STATE[incident.impact] || 'degraded'));
        }
      }
      timeline.push({ at: dayStart, state });
    }
    const bad = timeline.filter((d) => d.state !== 'operational' && d.state !== 'maintenance').length;
    return {
      component,
      timeline,
      // Days, not minutes: the incident log has day-level honesty at best, so
      // quoting "99.98%" from it would be inventing precision we do not have.
      uptimePct: (((days - bad) / days) * 100).toFixed(days >= 90 ? 1 : 0),
    };
  });
}

const componentList = (raw) => String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
const incidentTouches = (incident, slug) => componentList(incident.components).includes(slug);

/** Normalises a submitted component list against what actually exists. */
function normalizeComponents(raw, components) {
  const known = new Set(components.map((c) => c.slug));
  const seen = [];
  for (const slug of componentList(raw)) {
    if (known.has(slug) && !seen.includes(slug)) seen.push(slug);
    if (seen.length >= 20) break;
  }
  return seen.join(',');
}

/* ------------------------------------------------------------------ *
 * The shape the page, the JSON endpoint and the banners all share
 * ------------------------------------------------------------------ */

/**
 * One read of everything the status surfaces need. Called by /status, by
 * /status.json, and by the help centre and ticket form when they show "we
 * already know about this" — so all four can never tell a different story.
 */
async function statusSnapshot(db, { history = false } = {}) {
  const components = await listComponents(db);
  const open = await openIncidents(db);
  const overall = overallStatus(components);
  const snapshot = {
    overall,
    headline: OVERALL_HEADLINE[overall],
    components,
    open,
    upcoming: await upcomingMaintenance(db),
    checkedAt: Date.now(),
  };
  if (history) {
    const recent = await recentIncidents(db, { days: 90, limit: 60 });
    snapshot.recent = recent;
    snapshot.history = uptimeHistory(components, recent);
  }
  return snapshot;
}

/** Trimmed shape for /status.json and the live poll — no internal ids. */
const publicSnapshot = (snapshot) => ({
  status: snapshot.overall,
  headline: snapshot.headline,
  updatedAt: new Date(snapshot.checkedAt).toISOString(),
  components: snapshot.components.map((c) => ({
    slug: c.slug, name: c.name, status: c.status,
    label: COMPONENT_LABELS[c.status] || c.status,
  })),
  incidents: snapshot.open.map((i) => ({
    id: i.id, title: i.title, kind: i.kind, impact: i.impact, state: i.state,
    components: componentList(i.components),
    startedAt: new Date(Number(i.started_at)).toISOString(),
    latest: i.updates && i.updates.length ? i.updates[0].body : null,
  })),
});

/**
 * The cheap version, for pages that are not the status page: two statements,
 * and null when there is nothing to say.
 *
 * This is what puts a known outage in front of someone on the help centre and
 * on the ticket form — the moment before they describe a problem we already
 * know about is the only moment that saves anyone any work.
 */
async function statusHeadsUp(db) {
  const degraded = await db.all(
    "SELECT status FROM status_components WHERE visible = 1 AND status != 'operational'"
  );
  const incidents = await db.all(
    `SELECT id, title, kind, impact FROM status_incidents
      WHERE resolved_at IS NULL AND (kind = 'incident' OR state = 'in_progress')
      ORDER BY started_at DESC LIMIT 3`
  );
  if (!degraded.length && !incidents.length) return null;

  const overall = degraded.reduce((worst, c) => worstOf(worst, c.status), 'operational');
  return {
    overall: overall === 'operational' ? 'maintenance' : overall,
    headline: OVERALL_HEADLINE[overall === 'operational' ? 'maintenance' : overall],
    incidents,
  };
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/** Appends an update to an incident and moves the incident's own state with it. */
async function addUpdate(db, incident, { state, body, authorName }) {
  const next = normalizeIncidentState(state);
  await db.run(
    'INSERT INTO status_updates (incident_id, state, body, author_name) VALUES (?, ?, ?, ?)',
    incident.id, next, body, authorName
  );
  const closing = CLOSED_STATES.has(next);
  await db.run(
    `UPDATE status_incidents
        SET state = ?, resolved_at = ?, updated_at = datetime('now')
      WHERE id = ?`,
    next, closing ? (incident.resolved_at || Date.now()) : null, incident.id
  );
  return next;
}

/**
 * Sets the components an incident names back to operational when it closes —
 * but only the ones no OTHER open incident still claims, so resolving one of
 * two overlapping incidents cannot declare a still-broken component healthy.
 */
async function releaseComponents(db, incident) {
  const slugs = componentList(incident.components);
  if (!slugs.length) return [];
  const stillOpen = await db.all(
    'SELECT components FROM status_incidents WHERE resolved_at IS NULL AND id != ?', incident.id
  );
  const claimed = new Set(stillOpen.flatMap((i) => componentList(i.components)));
  const freed = slugs.filter((slug) => !claimed.has(slug));
  for (const slug of freed) {
    await db.run(
      `UPDATE status_components SET status = 'operational', changed_at = ?, updated_at = datetime('now')
        WHERE slug = ? AND status != 'operational'`,
      Date.now(), slug
    );
  }
  return freed;
}

/** Applies a component state to every component an incident names. */
async function applyComponentState(db, slugs, state) {
  const next = normalizeComponentState(state);
  for (const slug of componentList(slugs)) {
    await db.run(
      `UPDATE status_components SET status = ?, changed_at = ?, updated_at = datetime('now')
        WHERE slug = ? AND status != ?`,
      next, Date.now(), slug, next
    );
  }
}

/** Fire-and-forget staff alert. Never throws — see webhooks.js. */
async function alertStatus(env, kind, incident, extra = {}) {
  if (!env.SUPPORT_WEBHOOK_URL) return { ok: false, error: 'not_configured' };
  const siteUrl = String(env.SITE_URL || '').replace(/\/+$/, '');
  return notifySupport(env, kind, {
    ref: incident.kind === 'maintenance' ? 'Maintenance' : `Incident #${incident.id}`,
    subject: incident.title,
    priority: IMPACT_LABELS[incident.impact] || incident.impact,
    category: componentList(incident.components).join(', ') || 'site-wide',
    requester: incident.created_by || 'staff',
    url: siteUrl ? `${siteUrl}/status` : '/status',
    ...extra,
  });
}

/* ------------------------------------------------------------------ *
 * First-run content
 * ------------------------------------------------------------------ */

const SEED_COMPONENTS = [
  ['website', 'Website', 'goyhub.st — the site you are reading.', 0],
  ['accounts', 'Accounts & sign-in', 'Signing in on the site and in the app.', 1],
  ['app', 'GoyHub desktop app', 'The Windows companion app itself.', 2],
  ['stats', 'Match tracking', 'Reading finished matches and building stats.', 3],
  ['forum', 'Community forum', 'Threads, replies and the shoutbox.', 4],
  ['payments', 'Payments & upgrades', 'Checkout and crediting a membership.', 5],
  ['support', 'Support desk', 'The help centre and support tickets.', 6],
];

async function seedStatus(db) {
  if (await db.get('SELECT id FROM status_components LIMIT 1')) return false;
  for (const [slug, name, description, position] of SEED_COMPONENTS) {
    await db.run(
      'INSERT INTO status_components (slug, name, description, position) VALUES (?, ?, ?, ?)',
      slug, name, description, position
    );
  }
  return true;
}

export {
  COMPONENT_STATES, COMPONENT_LABELS, COMPONENT_SHORT, COMPONENT_TONE,
  OVERALL_HEADLINE, OVERALL_BLURB,
  INCIDENT_STATES, MAINTENANCE_STATES, ALL_INCIDENT_STATES, STATE_LABELS,
  IMPACTS, IMPACT_LABELS, CLOSED_STATES, MAX_TITLE, MAX_UPDATE,
  normalizeComponentState, normalizeIncidentState, normalizeImpact, normalizeComponents,
  isClosed, worstOf, overallStatus, componentList, incidentTouches,
  listComponents, openIncidents, recentIncidents, upcomingMaintenance, uptimeHistory,
  statusSnapshot, publicSnapshot, statusHeadsUp,
  addUpdate, releaseComponents, applyComponentState, alertStatus, seedStatus,
};
