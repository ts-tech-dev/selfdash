export default async function pagesRoutes(app) {
  const db = app.db;

  app.get('/api/pages', async () => {
    return db.prepare('SELECT * FROM pages ORDER BY position, id').all().map(mapPage);
  });

  app.post('/api/pages', async (req, reply) => {
    const name = (req.body || {}).name;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }
    const slug = uniqueSlug(db, slugify(name));
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM pages').get().m;
    const info = db
      .prepare('INSERT INTO pages (name, slug, position) VALUES (?, ?, ?)')
      .run(name.trim(), slug, maxPos + 1);
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(info.lastInsertRowid);
    return reply.code(201).send(mapPage(page));
  });

  app.patch('/api/pages/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM pages WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'not found' });

    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    if (!name) return reply.code(400).send({ error: 'name cannot be empty' });
    const background = body.background !== undefined ? body.background : existing.background;
    const position = body.position !== undefined ? Number(body.position) : existing.position;

    let optionsJson = existing.options_json || '{}';
    if (body.options !== undefined) {
      const merged = { ...JSON.parse(optionsJson), ...(body.options || {}) };
      optionsJson = JSON.stringify(sanitizePageOptions(merged));
    }

    db.prepare('UPDATE pages SET name = ?, background = ?, position = ?, options_json = ? WHERE id = ?').run(
      name,
      background,
      position,
      optionsJson,
      id
    );
    return mapPage(db.prepare('SELECT * FROM pages WHERE id = ?').get(id));
  });

  app.delete('/api/pages/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const count = db.prepare('SELECT COUNT(*) AS c FROM pages').get().c;
    if (count <= 1) return reply.code(400).send({ error: 'cannot delete the last page' });
    const info = db.prepare('DELETE FROM pages WHERE id = ?').run(id);
    if (info.changes === 0) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'page'
  );
}

function uniqueSlug(db, base) {
  const exists = (slug) => db.prepare('SELECT 1 FROM pages WHERE slug = ?').get(slug);
  let slug = base;
  let n = 2;
  while (exists(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

function mapPage(row) {
  const { options_json, ...rest } = row;
  return { ...rest, options: JSON.parse(options_json || '{}') };
}

const clampN = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

// Keep only known page-option keys, bounded.
function sanitizePageOptions(o = {}) {
  const out = {};
  if (o.grid && typeof o.grid === 'object') {
    out.grid = {
      columns: clampN(o.grid.columns, 1, 12, 6),
      gap: clampN(o.grid.gap, 0, 48, 14),
      rowHeight: clampN(o.grid.rowHeight, 40, 240, 96),
      maxWidth: clampN(o.grid.maxWidth, 600, 2400, 1100),
    };
  }
  if (o.background && typeof o.background === 'object') {
    const b = o.background;
    out.background = {
      url: typeof b.url === 'string' ? b.url.slice(0, 1000) : '',
      blur: clampN(b.blur, 0, 40, 0),
      dim: clampN(b.dim, 0, 100, 0),
      opacity: clampN(b.opacity, 0, 100, 100),
    };
  }
  if (typeof o.customCss === 'string') out.customCss = o.customCss.slice(0, 40_000);
  return out;
}
