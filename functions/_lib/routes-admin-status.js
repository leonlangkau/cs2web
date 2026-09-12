/**
 * Admin → Status.
 *
 * Staff-level, like the rest of the support desk: telling customers the truth
 * about an outage is day-to-day work, not a full-admin power. Deleting a
 * component or an incident is not — that rewrites published history, so it is
 * gated to a full admin and resolving is offered as the answer instead.
 */
import * as views from "./views/admin-status.js";
import * as site from "./views/site.js";
import { audit, formBody, setFlash, defer, requireStaff, requireAdmin } from "./middleware.js";
import {
  COMPONENT_STATES, COMPONENT_LABELS, MAX_TITLE, MAX_UPDATE,
  normalizeComponentState, normalizeImpact,
  statusSnapshot, openIncidents, recentIncidents, listComponents,
  addUpdate, releaseComponents, applyComponentState, alertStatus,
} from "./status.js";
import { cleanLine, cleanBody } from "./support.js";

const intParam = (value, fallback = 0) => {
  const n = parseInt(value, 10);
  return Number.isInteger(n) ? n : fallback;
};

function notFound(c, message = 'This page does not exist.') {
  return c.html(site.errorPage(c.get('view'), { code: 404, title: 'Not found', message }), 404);
}

const adminAudit = (c, detail) => audit(c, 'admin_action', {
  userId: c.get('user').id, username: c.get('user').username, detail,
});

/**
 * `<input type="datetime-local">` posts local wall-clock with no zone. The
 * form labels it UTC and this reads it as UTC, so the two agree — a status
 * page that quietly reinterprets a maintenance window in the admin's timezone
 * would publish the wrong hour to everyone else.
 */
function readUtcDateTime(raw) {
  const value = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const ms = Date.parse(`${value.length === 16 ? `${value}:00` : value}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function register(app) {
  app.use('/admin/status/*', async (c, next) => {
    const gate = requireStaff(c);
    if (gate) return gate;
    await next();
  });

  const render = async (c) => {
    const db = c.get('db');
    return c.html(views.statusAdmin(c.get('view'), {
      snapshot: await statusSnapshot(db),
      components: await listComponents(db, { includeHidden: true }),
      open: await openIncidents(db),
      recent: await recentIncidents(db, { days: 90, limit: 40 }),
    }));
  };

  app.get('/admin/status', async (c) => {
    const gate = requireStaff(c);
    if (gate) return gate;
    return render(c);
  });

  /* ---------------- Components ---------------- */

  app.post('/admin/status/components', async (c) => {
    const db = c.get('db');
    const body = await formBody(c);
    const name = cleanLine(body.name, 60);
    if (!name) {
      setFlash(c, 'error', 'Give the component a name.');
      return c.redirect('/admin/status', 302);
    }
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'component';
    let slug = base;
    for (let n = 2; await db.get('SELECT id FROM status_components WHERE slug = ?', slug); n += 1) slug = `${base}-${n}`;

    await db.run(
      'INSERT INTO status_components (slug, name, description, position) VALUES (?, ?, ?, ?)',
      slug, name, cleanLine(body.description, 200), intParam(body.position, 0)
    );
    await adminAudit(c, `added status component "${name}"`);
    setFlash(c, 'success', `Added “${name}”.`);
    return c.redirect('/admin/status', 302);
  });

  app.post('/admin/status/components/reset', async (c) => {
    const db = c.get('db');
    const { changes } = await db.run(
      `UPDATE status_components SET status = 'operational', changed_at = ?, updated_at = datetime('now')
        WHERE status != 'operational'`,
      Date.now()
    );
    await adminAudit(c, `set ${changes} status component(s) back to operational`);
    setFlash(c, 'success', changes
      ? `All clear — ${changes} component${changes === 1 ? '' : 's'} back to operational.`
      : 'Everything was already operational.');
    return c.redirect('/admin/status', 302);
  });

  const componentFor = async (c) => {
    const id = intParam(c.req.param('id'), 0);
    return id > 0 ? c.get('db').get('SELECT * FROM status_components WHERE id = ?', id) : null;
  };

  app.post('/admin/status/components/:id/state', async (c) => {
    const db = c.get('db');
    const component = await componentFor(c);
    if (!component) return notFound(c);
    const status = normalizeComponentState(String((await formBody(c)).status || ''));

    if (status !== component.status) {
      await db.run(
        `UPDATE status_components SET status = ?, changed_at = ?, updated_at = datetime('now') WHERE id = ?`,
        status, Date.now(), component.id
      );
      await adminAudit(c, `set status component "${component.name}" to ${status}`);
      setFlash(c, 'success', `${component.name}: ${COMPONENT_LABELS[status]}.`);
    }
    return c.redirect('/admin/status', 302);
  });

  app.post('/admin/status/components/:id/edit', async (c) => {
    const db = c.get('db');
    const component = await componentFor(c);
    if (!component) return notFound(c);
    const body = await formBody(c);
    const name = cleanLine(body.name, 60) || component.name;

    await db.run(
      `UPDATE status_components SET name = ?, description = ?, position = ?, visible = ?,
              updated_at = datetime('now') WHERE id = ?`,
      name, cleanLine(body.description, 200), intParam(body.position, component.position),
      body.visible ? 1 : 0, component.id
    );
    await adminAudit(c, `edited status component #${component.id} ("${name}")`);
    return c.redirect('/admin/status', 302);
  });

  app.post('/admin/status/components/:id/delete', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const component = await componentFor(c);
    if (!component) return notFound(c);
    await c.get('db').run('DELETE FROM status_components WHERE id = ?', component.id);
    await adminAudit(c, `deleted status component #${component.id} ("${component.name}")`);
    setFlash(c, 'success', `Deleted “${component.name}”. Past incidents still name it.`);
    return c.redirect('/admin/status', 302);
  });

  /* ---------------- Incidents ---------------- */

  app.post('/admin/status/incidents', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const user = c.get('user');
    const body = await formBody(c);

    const title = cleanLine(body.title, MAX_TITLE);
    const first = cleanBody(body.body, MAX_UPDATE);
    if (title.length < 4 || first.length < 4) {
      setFlash(c, 'error', 'An incident needs a title and a first update — an empty incident is worse than none.');
      return c.redirect('/admin/status', 302);
    }

    const kind = body.kind === 'maintenance' ? 'maintenance' : 'incident';
    const impact = normalizeImpact(String(body.impact || ''));
    const components = await listComponents(db, { includeHidden: true });
    const known = new Set(components.map((x) => x.slug));
    const affected = c.req.all('components').filter((slug) => known.has(slug));

    const scheduledFor = kind === 'maintenance' ? readUtcDateTime(body.scheduled_for) : null;
    const scheduledUntil = kind === 'maintenance' ? readUtcDateTime(body.scheduled_until) : null;
    const state = kind === 'maintenance' && scheduledFor && scheduledFor > Date.now()
      ? 'scheduled' : (kind === 'maintenance' ? 'in_progress' : 'investigating');

    const created = await db.run(
      `INSERT INTO status_incidents
         (title, kind, impact, state, components, started_at, scheduled_for, scheduled_until, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, kind, impact, state, affected.join(','),
      scheduledFor && state === 'scheduled' ? scheduledFor : Date.now(),
      scheduledFor, scheduledUntil, user.username
    );
    const id = Number(created.lastInsertRowid);
    await db.run(
      'INSERT INTO status_updates (incident_id, state, body, author_name) VALUES (?, ?, ?, ?)',
      id, state, first, user.username
    );

    // Only move components for something happening now — a maintenance window
    // scheduled for Tuesday must not mark anything degraded today.
    const componentStatus = COMPONENT_STATES.includes(String(body.component_status))
      ? String(body.component_status) : null;
    if (componentStatus && state !== 'scheduled') {
      await applyComponentState(db, affected.join(','), componentStatus);
    }

    await adminAudit(c, `opened ${kind} #${id} ("${title}") on ${affected.join(', ') || 'no components'}`);
    const incident = await db.get('SELECT * FROM status_incidents WHERE id = ?', id);
    await defer(c, alertStatus(env, impact === 'critical' ? 'ticket_urgent' : 'ticket_new', incident,
      { note: first.slice(0, 300) }));

    setFlash(c, 'success', `Published. ${kind === 'maintenance' ? 'Maintenance' : 'Incident'} is live on /status.`);
    return c.redirect('/admin/status', 302);
  });

  const incidentFor = async (c) => {
    const id = intParam(c.req.param('id'), 0);
    return id > 0 ? c.get('db').get('SELECT * FROM status_incidents WHERE id = ?', id) : null;
  };

  app.post('/admin/status/incidents/:id/update', async (c) => {
    const db = c.get('db');
    const env = c.get('cfg') || {};
    const user = c.get('user');
    const incident = await incidentFor(c);
    if (!incident) return notFound(c);

    const body = await formBody(c);
    const text = cleanBody(body.body, MAX_UPDATE);
    if (text.length < 4) {
      setFlash(c, 'error', 'Write the update before posting it.');
      return c.redirect('/admin/status', 302);
    }

    const wasOpen = !incident.resolved_at;
    const state = await addUpdate(db, incident, { state: body.state, body: text, authorName: user.username });

    const componentStatus = COMPONENT_STATES.includes(String(body.component_status))
      ? String(body.component_status) : null;
    if (componentStatus) await applyComponentState(db, incident.components, componentStatus);

    // Closing hands the components back — but only the ones no other open
    // incident still claims, so resolving one of two overlapping incidents
    // cannot declare a still-broken component healthy.
    let freed = [];
    if (wasOpen && (state === 'resolved' || state === 'completed')) {
      const closed = await db.get('SELECT * FROM status_incidents WHERE id = ?', incident.id);
      freed = await releaseComponents(db, closed);
      await defer(c, alertStatus(env, 'ticket_new', closed,
        { note: `Resolved: ${text.slice(0, 250)}` }));
    }

    await adminAudit(c, `posted a ${state} update on status incident #${incident.id}`);
    setFlash(c, 'success', freed.length
      ? `Update posted. ${freed.length} component${freed.length === 1 ? '' : 's'} back to operational.`
      : 'Update posted — it is live on /status.');
    return c.redirect('/admin/status', 302);
  });

  app.post('/admin/status/incidents/:id/delete', async (c) => {
    const gate = requireAdmin(c);
    if (gate) return gate;
    const incident = await incidentFor(c);
    if (!incident) return notFound(c);
    await c.get('db').run('DELETE FROM status_incidents WHERE id = ?', incident.id);
    await adminAudit(c, `deleted status incident #${incident.id} ("${incident.title}")`);
    setFlash(c, 'success', 'Incident deleted.');
    return c.redirect('/admin/status', 302);
  });
}

export { register, readUtcDateTime };
