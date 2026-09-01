import { TILE_TYPES, resolveTileFields, clampInt } from '../shared/tileConfig.js';

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

    const w = clampInt(Number(body.w) || 2, 1, 12);
    const h = clampInt(Number(body.h) || 1, 1, 12);
    const x = clampInt(Number(body.x) || 0, 0, 11);
    const y = clampInt(Number(body.y) || 0, 0, 4096);
    const maxPos = db
      .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM tiles WHERE page_id = ?')
      .get(pageId).m;

    const info = db
      .prepare(
        `INSERT INTO tiles (page_id, type, title, url, icon, description, open_mode, integration_id, x, y, w, h, position, config_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        x,
        y,
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
      x: body.x !== undefined ? clampInt(Number(body.x), 0, 11) : existing.x,
      y: body.y !== undefined ? clampInt(Number(body.y), 0, 4096) : existing.y,
      w: body.w !== undefined ? clampInt(Number(body.w), 1, 12) : existing.w,
      h: body.h !== undefined ? clampInt(Number(body.h), 1, 12) : existing.h,
    };

    db.prepare(
      `UPDATE tiles SET type = ?, title = ?, url = ?, icon = ?, description = ?, open_mode = ?,
       integration_id = ?, x = ?, y = ?, w = ?, h = ?, config_json = ?
       WHERE id = ?`
    ).run(
      type,
      next.title,
      fields.url,
      next.icon,
      next.description,
      fields.open_mode,
      fields.integration_id,
      next.x,
      next.y,
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

function mapTile(row) {
  const { config_json, ...rest } = row;
  return { ...rest, config: JSON.parse(config_json || '{}') };
}
