import {
  TILE_TYPES,
  PANEL_TYPES,
  buildIframeConfig,
  sanitizeTileConfig,
  URL_RE,
} from '../shared/tileConfig.js';

const OPEN_MODES = new Set(['newtab', 'same', 'iframe']);

export default async function tilesRoutes(app) {
  const db = app.db;

  app.get('/api/pages/:pageId/tiles', async (req) => {
    const pageId = Number(req.params.pageId);
    return db
      .prepare('SELECT * FROM tiles WHERE page_id = ? ORDER BY position, id')
      .all(pageId)
      .map(mapTile);
  });

  app.post('/api/pages/:pageId/tiles', async (req, reply) => {
    const pageId = Number(req.params.pageId);
    const page = db.prepare('SELECT id FROM pages WHERE id = ?').get(pageId);
    if (!page) return reply.code(404).send({ error: 'page not found' });

    const body = req.body || {};
    const type = TILE_TYPES.has(body.type) ? body.type : 'link';

    let fields;
    try {
      fields = resolveTileFields(db, type, body, null);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }

    const w = clamp(Number(body.w) || 2, 1, 6);
    const h = clamp(Number(body.h) || 1, 1, 6);
    const maxPos = db
      .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM tiles WHERE page_id = ?')
      .get(pageId).m;

    const info = db
      .prepare(
        `INSERT INTO tiles (page_id, type, title, url, icon, description, open_mode, integration_id, w, h, position, config_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        pageId,
        type,
        body.title || null,
        fields.url,
        body.icon || null,
        body.description || null,
        fields.open_mode,
        fields.integration_id,
        w,
        h,
        maxPos + 1,
        JSON.stringify(fields.config)
      );

    return reply.code(201).send(mapTile(db.prepare('SELECT * FROM tiles WHERE id = ?').get(info.lastInsertRowid)));
  });

  app.patch('/api/tiles/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM tiles WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'not found' });

    const body = req.body || {};
    const type = body.type !== undefined && TILE_TYPES.has(body.type) ? body.type : existing.type;

    let fields;
    try {
      fields = resolveTileFields(db, type, body, existing);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }

    const next = {
      title: body.title !== undefined ? body.title : existing.title,
      icon: body.icon !== undefined ? body.icon : existing.icon,
      description: body.description !== undefined ? body.description : existing.description,
      w: body.w !== undefined ? clamp(Number(body.w), 1, 6) : existing.w,
      h: body.h !== undefined ? clamp(Number(body.h), 1, 6) : existing.h,
    };

    db.prepare(
      `UPDATE tiles SET type = ?, title = ?, url = ?, icon = ?, description = ?, open_mode = ?,
       integration_id = ?, w = ?, h = ?, config_json = ?
       WHERE id = ?`
    ).run(
      type,
      next.title,
      fields.url,
      next.icon,
      next.description,
      fields.open_mode,
      fields.integration_id,
      next.w,
      next.h,
      JSON.stringify(fields.config),
      id
    );

    return mapTile(db.prepare('SELECT * FROM tiles WHERE id = ?').get(id));
  });

  app.delete('/api/tiles/:id', async (req, reply) => {
    const info = db.prepare('DELETE FROM tiles WHERE id = ?').run(Number(req.params.id));
    if (info.changes === 0) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });

  app.post('/api/pages/:pageId/tiles/reorder', async (req, reply) => {
    const pageId = Number(req.params.pageId);
    const order = (req.body || {}).order;
    if (!Array.isArray(order)) {
      return reply.code(400).send({ error: 'order must be an array of tile ids' });
    }

    const update = db.prepare('UPDATE tiles SET position = ? WHERE id = ? AND page_id = ?');
    db.exec('BEGIN');
    try {
      order.forEach((id, index) => update.run(index, Number(id), pageId));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true };
  });
}

// Works out { url, open_mode, integration_id, config } for a given tile type from the
// request body, falling back to `existing` (a DB row) for fields the caller omitted.
function resolveTileFields(db, type, body, existing) {
  const existingConfig = existing ? JSON.parse(existing.config_json || '{}') : {};

  if (type === 'widget') {
    let integrationId = existing ? existing.integration_id : null;
    if (body.integration_id !== undefined) integrationId = Number(body.integration_id);
    const integration = integrationId
      ? db.prepare('SELECT id FROM integrations WHERE id = ?').get(integrationId)
      : null;
    if (!integration) throw new Error('integration_id must reference an existing integration');
    return { url: null, open_mode: 'newtab', integration_id: integrationId, config: {} };
  }

  if (PANEL_TYPES.has(type)) {
    const raw = body.config !== undefined ? body.config : existingConfig;
    return { url: null, open_mode: 'newtab', integration_id: null, config: sanitizeTileConfig(type, raw) };
  }

  // link (incl. iframe open mode)
  let url = existing ? existing.url : null;
  if (body.url !== undefined) {
    if (!URL_RE.test(body.url)) throw new Error('url must start with http:// or https://');
    url = body.url;
  }
  if (!url) throw new Error('url is required and must start with http:// or https://');

  const open_mode = body.open_mode !== undefined ? normalizeOpenMode(body.open_mode) : existing?.open_mode || 'newtab';
  const configSource = body.config !== undefined ? body.config : existingConfig;
  const config = open_mode === 'iframe' ? buildIframeConfig(configSource) : {};
  return { url, open_mode, integration_id: null, config };
}

function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeOpenMode(value) {
  return OPEN_MODES.has(value) ? value : 'newtab';
}

function mapTile(row) {
  const { config_json, ...rest } = row;
  return { ...rest, config: JSON.parse(config_json || '{}') };
}
