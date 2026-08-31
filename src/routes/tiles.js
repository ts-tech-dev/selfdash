const URL_RE = /^https?:\/\//i;
const OPEN_MODES = new Set(['newtab', 'same', 'iframe']);
const ASPECT_RE = /^\d{1,3}\s*\/\s*\d{1,3}$/;
const DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';
const VALID_SANDBOX_TOKENS = new Set([
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-orientation-lock',
  'allow-pointer-lock',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-presentation',
  'allow-same-origin',
  'allow-scripts',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
]);

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
    const type = body.type === 'widget' ? 'widget' : 'link';

    let url = null;
    let open_mode = 'newtab';
    let config = {};
    let integrationId = null;

    if (type === 'widget') {
      integrationId = Number(body.integration_id);
      const integration = db.prepare('SELECT id FROM integrations WHERE id = ?').get(integrationId);
      if (!integration) return reply.code(400).send({ error: 'integration_id must reference an existing integration' });
    } else {
      if (!body.url || typeof body.url !== 'string' || !URL_RE.test(body.url)) {
        return reply.code(400).send({ error: 'url is required and must start with http:// or https://' });
      }
      url = body.url;
      open_mode = normalizeOpenMode(body.open_mode);
      config = open_mode === 'iframe' ? buildIframeConfig(body.config) : {};
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
        url,
        body.icon || null,
        body.description || null,
        open_mode,
        integrationId,
        w,
        h,
        maxPos + 1,
        JSON.stringify(config)
      );

    return reply.code(201).send(mapTile(db.prepare('SELECT * FROM tiles WHERE id = ?').get(info.lastInsertRowid)));
  });

  app.patch('/api/tiles/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM tiles WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'not found' });

    const body = req.body || {};
    const type = body.type !== undefined ? (body.type === 'widget' ? 'widget' : 'link') : existing.type;

    let url = existing.url;
    let open_mode = existing.open_mode;
    let config = JSON.parse(existing.config_json || '{}');
    let integrationId = existing.integration_id;

    if (type === 'widget') {
      if (body.integration_id !== undefined) integrationId = Number(body.integration_id);
      const integration = integrationId ? db.prepare('SELECT id FROM integrations WHERE id = ?').get(integrationId) : null;
      if (!integration) return reply.code(400).send({ error: 'integration_id must reference an existing integration' });
      url = null;
      open_mode = 'newtab';
      config = {};
    } else {
      if (body.url !== undefined) {
        if (!URL_RE.test(body.url)) return reply.code(400).send({ error: 'url must start with http:// or https://' });
        url = body.url;
      }
      open_mode = body.open_mode !== undefined ? normalizeOpenMode(body.open_mode) : open_mode;
      const configSource = body.config !== undefined ? body.config : config;
      config = open_mode === 'iframe' ? buildIframeConfig(configSource) : {};
      integrationId = null;
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
      url,
      next.icon,
      next.description,
      open_mode,
      integrationId,
      next.w,
      next.h,
      JSON.stringify(config),
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

function clamp(n, min, max) {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeOpenMode(value) {
  return OPEN_MODES.has(value) ? value : 'newtab';
}

function buildIframeConfig(raw) {
  const cfg = raw || {};
  const sizing = cfg.sizing === 'height' ? 'height' : 'aspect';
  const aspectRatio = typeof cfg.aspectRatio === 'string' && ASPECT_RE.test(cfg.aspectRatio.trim())
    ? cfg.aspectRatio.trim()
    : '16/9';
  const rawHeight = Number(cfg.height);
  const height = Number.isFinite(rawHeight) ? clamp(rawHeight, 100, 2000) : 400;
  const tokens = (typeof cfg.sandbox === 'string' ? cfg.sandbox.split(/\s+/) : DEFAULT_SANDBOX.split(' ')).filter(
    (t) => VALID_SANDBOX_TOKENS.has(t)
  );
  const sandbox = tokens.length ? tokens.join(' ') : DEFAULT_SANDBOX;
  return { sizing, aspectRatio, height, sandbox };
}

function mapTile(row) {
  const { config_json, ...rest } = row;
  return { ...rest, config: JSON.parse(config_json || '{}') };
}
