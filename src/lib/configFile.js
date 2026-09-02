import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { decodeConfig, encodeConfig, validateConfig } from '../integrations/configCodec.js';
import { TILE_TYPES, resolveTileFields, clampInt } from '../shared/tileConfig.js';
import { sanitizePageOptions } from '../shared/pageOptions.js';
import { DEFAULTS as SETTING_DEFAULTS } from '../routes/settings.js';

const SETTING_KEYS = new Set(Object.keys(SETTING_DEFAULTS));

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'x';

const secretVar = (ref, field) =>
  `\${SELFDASH_SECRET_${slugify(ref).replace(/-/g, '_').toUpperCase()}_${String(field).toUpperCase()}}`;

// Replace ${ENV_VAR} tokens in any string/array/object with process.env values;
// records the names it couldn't resolve.
function resolveVars(value, unresolved) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) => {
      if (process.env[name] != null && process.env[name] !== '') return process.env[name];
      unresolved.add(name);
      return '';
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveVars(v, unresolved));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveVars(v, unresolved);
    return out;
  }
  return value;
}

// ---- export ---------------------------------------------------------------

export function buildConfigDoc(db, crypto, registry) {
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value_json FROM settings').all().map((r) => [r.key, JSON.parse(r.value_json)])
  );

  const integRows = db.prepare('SELECT * FROM integrations ORDER BY id').all();
  const refById = new Map();
  const usedRefs = new Set();
  const integrations = integRows.map((row) => {
    let ref = slugify(row.name);
    const base = ref;
    let n = 2;
    while (usedRefs.has(ref)) ref = `${base}-${n++}`;
    usedRefs.add(ref);
    refById.set(row.id, ref);

    let config = {};
    try {
      config = decodeConfig(row.config_json, crypto);
    } catch {
      config = {};
    }
    const Cls = registry.get(row.key);
    const pwFields = new Set(
      (Cls?.configSchema?.fields || []).filter((f) => f.type === 'password').map((f) => f.name)
    );
    const outConfig = {};
    for (const [k, v] of Object.entries(config)) {
      outConfig[k] = pwFields.has(k) && v ? secretVar(ref, k) : v;
    }
    return {
      ref,
      key: row.key,
      name: row.name,
      interval: row.interval,
      enabled: Boolean(row.enabled),
      config: outConfig,
    };
  });

  const pages = db
    .prepare('SELECT * FROM pages ORDER BY position, id')
    .all()
    .map((p) => {
      const tiles = db
        .prepare('SELECT * FROM tiles WHERE page_id = ? ORDER BY position, id')
        .all(p.id)
        .map((t) => {
          const cfg = JSON.parse(t.config_json || '{}');
          const out = { type: t.type };
          if (t.title) out.title = t.title;
          if (t.x) out.x = t.x;
          if (t.y) out.y = t.y;
          out.w = t.w;
          out.h = t.h;
          if (t.type === 'widget') {
            if (refById.has(t.integration_id)) out.integration = refById.get(t.integration_id);
            // moreIntegrationIds is a list of *this database's* integration row ids —
            // meaningless after a re-import elsewhere, so translate to the same portable
            // "ref" strings used for the primary integration.
            if (Array.isArray(cfg.moreIntegrationIds)) {
              const refs = cfg.moreIntegrationIds.map((id) => refById.get(id)).filter(Boolean);
              if (refs.length) cfg.moreIntegrationIds = refs;
              else delete cfg.moreIntegrationIds;
            }
            // A widget tile's link fields are optional (see resolveTileFields).
            if (t.url) out.url = t.url;
            if (t.icon) out.icon = t.icon;
            if (t.open_mode && t.open_mode !== 'newtab') out.open_mode = t.open_mode;
          } else {
            if (t.url) out.url = t.url;
            if (t.icon) out.icon = t.icon;
            if (t.description) out.description = t.description;
            if (t.open_mode && t.open_mode !== 'newtab') out.open_mode = t.open_mode;
          }
          if (Object.keys(cfg).length) out.config = cfg;
          return out;
        });
      const out = { name: p.name, slug: p.slug };
      const opts = JSON.parse(p.options_json || '{}');
      if (Object.keys(opts).length) out.options = opts;
      if (p.background) out.background = p.background;
      out.tiles = tiles;
      return out;
    });

  return { version: 1, exportedAt: new Date().toISOString(), settings, integrations, pages };
}

export function exportConfigYaml(db, crypto, registry) {
  return stringifyYaml(buildConfigDoc(db, crypto, registry), { lineWidth: 0 });
}

// ---- import -------------------------------------------------------------------

// Replaces all pages/tiles/integrations (and known settings) from a parsed config
// doc, transactionally. Returns { pages, tiles, integrations, unresolvedSecrets }.
export function importConfigDoc(app, doc, { includeSettings = true } = {}) {
  const db = app.db;
  const crypto = app.integrationCrypto;
  const registry = app.integrationRegistry;

  if (!doc || typeof doc !== 'object') throw new Error('config is empty or not a mapping');
  if (doc.version !== 1) throw new Error(`unsupported config version: ${doc.version ?? '(none)'}`);
  const pagesIn = Array.isArray(doc.pages) ? doc.pages : [];
  const integIn = Array.isArray(doc.integrations) ? doc.integrations : [];
  if (!pagesIn.length) throw new Error('config has no pages');

  const unresolved = new Set();
  const warnings = [];

  app.poller.stopAll();
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM tiles');
    db.exec('DELETE FROM pages');
    db.exec('DELETE FROM integrations');

    const refToId = new Map();
    const insInteg = db.prepare(
      `INSERT INTO integrations (key, name, config_json, interval, enabled, last_status)
       VALUES (?, ?, ?, ?, ?, 'unknown')`
    );
    for (const it of integIn) {
      if (!it || !it.key || !it.ref) throw new Error('each integration needs "ref" and "key"');
      const localUnres = new Set();
      const cfg = resolveVars(it.config || {}, localUnres);
      for (const v of localUnres) unresolved.add(v);
      const Cls = registry.get(it.key);
      if (Cls) {
        // Config validation is advisory on import — a missing secret or a config that
        // was undecryptable at export time shouldn't abort the whole import. The
        // integration lands and shows an error status until it's fixed in the UI.
        const errs = validateConfig(Cls, cfg);
        if (errs.length) warnings.push(`integration "${it.ref}": ${errs.join('; ')}`);
      } else {
        warnings.push(`integration "${it.ref}": type "${it.key}" is not installed`);
      }
      const info = insInteg.run(
        String(it.key),
        String(it.name || it.ref),
        encodeConfig(cfg, crypto),
        clampInt(it.interval ?? 60, 5, 86400),
        it.enabled === false ? 0 : 1
      );
      if (refToId.has(it.ref)) throw new Error(`duplicate integration ref "${it.ref}"`);
      refToId.set(it.ref, info.lastInsertRowid);
    }

    const insPage = db.prepare(
      'INSERT INTO pages (name, slug, position, background, options_json) VALUES (?, ?, ?, ?, ?)'
    );
    const insTile = db.prepare(
      `INSERT INTO tiles (page_id, type, title, url, icon, description, open_mode, integration_id, x, y, w, h, position, config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const usedSlugs = new Set();
    pagesIn.forEach((p, pi) => {
      let slug = slugify(p.slug || p.name || `page-${pi + 1}`);
      const base = slug;
      let n = 2;
      while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
      usedSlugs.add(slug);

      const pageInfo = insPage.run(
        String(p.name || slug),
        slug,
        pi,
        p.background || null,
        JSON.stringify(sanitizePageOptions(p.options || {}))
      );
      const pageId = pageInfo.lastInsertRowid;

      (Array.isArray(p.tiles) ? p.tiles : []).forEach((t, ti) => {
        const type = TILE_TYPES.has(t.type) ? t.type : 'link';
        const body = {
          type,
          config: resolveVars(t.config || {}, unresolved),
          url: t.url,
          open_mode: t.open_mode,
        };
        if (type === 'widget') {
          if (!refToId.has(t.integration)) {
            throw new Error(`tile on page "${p.name}" references unknown integration "${t.integration}"`);
          }
          body.integration_id = refToId.get(t.integration);
          // Reverse of the export-side translation: moreIntegrationIds travels as ref
          // strings in the doc, resolve them to this import's freshly-assigned ids.
          if (body.config && Array.isArray(body.config.moreIntegrationIds)) {
            body.config = {
              ...body.config,
              moreIntegrationIds: body.config.moreIntegrationIds
                .map((ref) => refToId.get(ref))
                .filter((id) => id !== undefined),
            };
          }
        }
        const f = resolveTileFields(db, type, body, null);
        insTile.run(
          pageId,
          type,
          t.title || null,
          f.url,
          t.icon || null,
          type === 'widget' ? null : t.description || null,
          f.open_mode,
          f.integration_id,
          clampInt(t.x ?? 0, 0, 11),
          clampInt(t.y ?? 0, 0, 4096),
          clampInt(t.w ?? 2, 1, 6),
          clampInt(t.h ?? 1, 1, 6),
          ti,
          JSON.stringify(f.config)
        );
      });
    });

    let settingsApplied = 0;
    if (includeSettings && doc.settings && typeof doc.settings === 'object') {
      const upsert = db.prepare(
        `INSERT INTO settings (key, value_json) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
      );
      for (const [k, v] of Object.entries(doc.settings)) {
        if (!SETTING_KEYS.has(k)) continue;
        upsert.run(k, JSON.stringify(v));
        settingsApplied++;
      }
    }

    db.exec('COMMIT');
    app.poller.initAll();

    return {
      pages: db.prepare('SELECT COUNT(*) c FROM pages').get().c,
      tiles: db.prepare('SELECT COUNT(*) c FROM tiles').get().c,
      integrations: db.prepare('SELECT COUNT(*) c FROM integrations').get().c,
      settingsApplied,
      unresolvedSecrets: [...unresolved],
      warnings,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    app.poller.initAll(); // resume polling the unchanged data
    throw err;
  }
}

export function importConfigYaml(app, text, opts) {
  let doc;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new Error(`invalid YAML: ${err.message}`);
  }
  return importConfigDoc(app, doc, opts);
}
