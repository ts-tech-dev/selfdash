import { invalidateComposeScanCache } from './composeScan.js';

const DEFAULTS = {
  site_title: 'selfdash',
  favicon: null,
  theme: 'minimal',
  dark_mode: 'system',
  accent: '#5b8def',
  font_family: '',
  locale: 'en',
  custom_css: '',
  custom_js: '',
  custom_js_enabled: false,
  global_background: null,
  compose_scan_enabled: false,
  compose_scan_dir: null,
  compose_scan_page_id: null,
};

const THEMES = new Set(['minimal', 'glass', 'terminal', 'gradient', 'nord', 'rosepine']);
const FONTS = new Set(['', 'system', 'inter', 'serif', 'mono', 'rounded']);
const MODES = new Set(['light', 'dark', 'system']);
const ACCENT_RE = /^#[0-9a-f]{6}$/i;
const MAX_CUSTOM = 40_000;

export default async function settingsRoutes(app) {
  const db = app.db;

  app.get('/api/settings', async () => readSettings(db));

  app.patch('/api/settings', async (req, reply) => {
    const body = req.body || {};
    const next = {};

    if (body.site_title !== undefined) {
      const title = String(body.site_title).trim();
      if (!title) return reply.code(400).send({ error: 'site_title cannot be empty' });
      next.site_title = title;
    }
    if (body.theme !== undefined) {
      if (!THEMES.has(body.theme)) return reply.code(400).send({ error: `theme must be one of ${[...THEMES].join(', ')}` });
      next.theme = body.theme;
    }
    if (body.dark_mode !== undefined) {
      if (!MODES.has(body.dark_mode)) return reply.code(400).send({ error: `dark_mode must be one of ${[...MODES].join(', ')}` });
      next.dark_mode = body.dark_mode;
    }
    if (body.accent !== undefined) {
      if (!ACCENT_RE.test(body.accent)) return reply.code(400).send({ error: 'accent must be a #rrggbb hex color' });
      next.accent = body.accent;
    }
    if (body.font_family !== undefined) {
      if (!FONTS.has(body.font_family)) return reply.code(400).send({ error: `font_family must be one of ${[...FONTS].join(', ')}` });
      next.font_family = body.font_family;
    }
    if (body.locale !== undefined) {
      if (!/^[a-z]{2}(-[a-z]{2})?$/i.test(body.locale)) return reply.code(400).send({ error: 'locale must be a language code like "en"' });
      next.locale = body.locale;
    }
    if (body.custom_css !== undefined) {
      next.custom_css = String(body.custom_css || '').slice(0, MAX_CUSTOM);
    }
    if (body.custom_js !== undefined) {
      next.custom_js = String(body.custom_js || '').slice(0, MAX_CUSTOM);
    }
    if (body.custom_js_enabled !== undefined) {
      next.custom_js_enabled = Boolean(body.custom_js_enabled);
    }
    if (body.global_background !== undefined) {
      next.global_background = body.global_background || null;
    }
    if (body.favicon !== undefined) {
      next.favicon = body.favicon || null;
    }
    if (body.compose_scan_enabled !== undefined) {
      next.compose_scan_enabled = Boolean(body.compose_scan_enabled);
    }
    if (body.compose_scan_dir !== undefined) {
      const dir = body.compose_scan_dir ? String(body.compose_scan_dir).trim() : null;
      if (dir && !dir.startsWith('/')) {
        return reply.code(400).send({ error: 'compose_scan_dir must be an absolute path' });
      }
      next.compose_scan_dir = dir;
    }
    if (body.compose_scan_page_id !== undefined) {
      const raw = body.compose_scan_page_id;
      if (raw === null || raw === '' || raw === 'all') {
        next.compose_scan_page_id = null; // shown on every page
      } else if (Number.isInteger(Number(raw)) && Number(raw) > 0) {
        next.compose_scan_page_id = Number(raw);
      } else {
        return reply.code(400).send({ error: 'compose_scan_page_id must be a page id or "all"' });
      }
    }

    const upsert = db.prepare(
      `INSERT INTO settings (key, value_json) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
    );
    db.exec('BEGIN');
    try {
      for (const [key, value] of Object.entries(next)) {
        upsert.run(key, JSON.stringify(value));
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    if (next.compose_scan_enabled !== undefined || next.compose_scan_dir !== undefined) {
      invalidateComposeScanCache();
    }

    return readSettings(db);
  });
}

function readSettings(db) {
  const rows = db.prepare('SELECT key, value_json FROM settings').all();
  const stored = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value_json)]));
  return { ...DEFAULTS, ...stored };
}
