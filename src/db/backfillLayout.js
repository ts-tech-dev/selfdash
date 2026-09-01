import { placeBox } from '../shared/gridPack.js';

// One-time layout backfill. Before free placement, tiles.x / tiles.y were always
// 0 and the grid packed everything top-left via CSS auto-flow. Switching to
// explicit grid coordinates would stack every tile on cell (0,0) until the user
// dragged them apart, so here we reproduce the old visual order: first-fit each
// named group's tiles (in their saved position order) into a `columns`-wide grid
// and write the resulting x / group-relative y. Guarded by a sentinel row in the
// migrations table so it runs exactly once.
const SENTINEL = 'js:backfill-tile-xy-1';

export function backfillTileLayout(db) {
  const already = db.prepare('SELECT 1 FROM migrations WHERE id = ?').get(SENTINEL);
  if (already) return;

  const pages = db.prepare('SELECT id, options_json FROM pages').all();
  const tilesForPage = db.prepare(
    'SELECT id, w, h, position, config_json FROM tiles WHERE page_id = ? ORDER BY position, id'
  );
  const setLayout = db.prepare('UPDATE tiles SET x = ?, y = ?, w = ?, h = ?, position = ? WHERE id = ?');

  db.exec('BEGIN');
  try {
    for (const page of pages) {
      let columns = 6;
      try {
        const opts = JSON.parse(page.options_json || '{}');
        const c = Number(opts?.grid?.columns);
        if (Number.isFinite(c)) columns = Math.min(12, Math.max(1, Math.trunc(c)));
      } catch {
        /* keep default */
      }

      const occByGroup = new Map();
      let position = 0;
      for (const row of tilesForPage.all(page.id)) {
        let group = '';
        try {
          group = JSON.parse(row.config_json || '{}').group || '';
        } catch {
          /* ungrouped */
        }
        if (!occByGroup.has(group)) occByGroup.set(group, []);

        const w = Math.min(columns, Math.max(1, row.w || 1));
        const h = Math.max(1, row.h || 1);
        const { x, y } = placeBox(occByGroup.get(group), columns, w, h);
        setLayout.run(x, y, w, h, position++, row.id);
      }
    }
    db.prepare('INSERT INTO migrations (id) VALUES (?)').run(SENTINEL);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
