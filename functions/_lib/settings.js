/**
 * Tiny admin-editable key/value settings store (announcement banner, etc.),
 * so content-level changes don't need a redeploy.
 */

const ANNOUNCEMENT_KEY = 'announcement';
const MAX_VALUE = 500;

async function getSetting(db, key) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : '';
}

async function setSetting(db, key, value) {
  const trimmed = String(value || '').trim().slice(0, MAX_VALUE);
  if (!trimmed) {
    await db.run('DELETE FROM settings WHERE key = ?', key);
    return '';
  }
  await db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key, trimmed
  );
  return trimmed;
}

export { getSetting, setSetting, ANNOUNCEMENT_KEY };
