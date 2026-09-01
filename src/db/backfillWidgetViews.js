// One-time backfill for the view-selection move from integration -> tile (see
// _views.js / tileConfig.js). Before this, "which view(s) to show" was a `views`
// (or legacy `view`) field on the *integration*, shared by every tile that used it.
// Every widget tile without its own `config.views` yet inherits its bound
// integration's old selection, so upgrading doesn't silently change what's on
// screen. Guarded by a sentinel row in the migrations table so it runs exactly once.
const SENTINEL = 'js:backfill-widget-views-1';

export function backfillWidgetViews(db) {
  const already = db.prepare('SELECT 1 FROM migrations WHERE id = ?').get(SENTINEL);
  if (already) return;

  const tiles = db
    .prepare("SELECT id, integration_id, config_json FROM tiles WHERE type = 'widget' AND integration_id IS NOT NULL")
    .all();
  const integrationConfigCache = new Map();
  const setConfig = db.prepare('UPDATE tiles SET config_json = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const t of tiles) {
      let cfg;
      try {
        cfg = JSON.parse(t.config_json || '{}');
      } catch {
        cfg = {};
      }
      if (Array.isArray(cfg.views) && cfg.views.length) continue; // already has its own selection

      if (!integrationConfigCache.has(t.integration_id)) {
        const row = db.prepare('SELECT config_json FROM integrations WHERE id = ?').get(t.integration_id);
        let iCfg = {};
        try {
          iCfg = row ? JSON.parse(row.config_json || '{}') : {};
        } catch {
          iCfg = {};
        }
        integrationConfigCache.set(t.integration_id, iCfg);
      }
      const iCfg = integrationConfigCache.get(t.integration_id);
      const legacyViews = Array.isArray(iCfg.views) && iCfg.views.length ? iCfg.views : iCfg.view ? [iCfg.view] : [];
      if (!legacyViews.length) continue;

      setConfig.run(JSON.stringify({ ...cfg, views: legacyViews }), t.id);
    }
    db.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, datetime('now'))").run(SENTINEL);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
