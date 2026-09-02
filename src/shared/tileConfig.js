// Per-type validation / sanitation for tile.config. Shared by the tiles route and
// backup import so the rules live in one place. Each sanitizer takes the raw config
// object and returns a clean one; unknown keys are dropped.

import { isHexColor } from './color.js';

const ASPECT_RE = /^\d{1,3}\s*\/\s*\d{1,3}$/;
const URL_RE = /^https?:\/\//i;
const DEFAULT_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';
const VALID_SANDBOX_TOKENS = new Set([
  'allow-downloads', 'allow-forms', 'allow-modals', 'allow-orientation-lock',
  'allow-pointer-lock', 'allow-popups', 'allow-popups-to-escape-sandbox',
  'allow-presentation', 'allow-same-origin', 'allow-scripts', 'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
]);

// Every built-in info/data tile type, plus the three "core" ones.
export const TILE_TYPES = new Set([
  'link', 'widget', 'iframe',
  'clock', 'weather', 'notes', 'search', 'rss', 'calendar', 'bookmarks', 'customapi', 'resources',
]);

// Types that render their own body and don't use url / integration_id.
export const PANEL_TYPES = new Set([
  'clock', 'weather', 'notes', 'search', 'rss', 'calendar', 'bookmarks', 'customapi', 'resources',
]);

const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, min, max, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
};
const bool = (v) => Boolean(v);
const oneOf = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

export function buildIframeConfig(raw) {
  const cfg = raw || {};
  const sizing = cfg.sizing === 'height' ? 'height' : 'aspect';
  const aspectRatio =
    typeof cfg.aspectRatio === 'string' && ASPECT_RE.test(cfg.aspectRatio.trim())
      ? cfg.aspectRatio.trim()
      : '16/9';
  const height = num(cfg.height, 100, 2000, 400);
  const tokens = (typeof cfg.sandbox === 'string' ? cfg.sandbox.split(/\s+/) : DEFAULT_SANDBOX.split(' '))
    .filter((t) => VALID_SANDBOX_TOKENS.has(t));
  const sandbox = tokens.length ? tokens.join(' ') : DEFAULT_SANDBOX;
  return { sizing, aspectRatio, height, sandbox };
}

const PANEL_SANITIZERS = {
  clock: (c) => ({
    format: oneOf(c.format, ['12h', '24h'], '24h'),
    showDate: c.showDate === undefined ? true : bool(c.showDate),
    showSeconds: bool(c.showSeconds),
    timezone: str(c.timezone, 64),
    label: str(c.label, 64),
  }),
  weather: (c) => ({
    latitude: num(c.latitude, -90, 90, 0),
    longitude: num(c.longitude, -180, 180, 0),
    label: str(c.label, 64),
    units: oneOf(c.units, ['metric', 'imperial'], 'metric'),
  }),
  notes: (c) => ({ markdown: str(c.markdown, 20000) }),
  search: (c) => ({
    provider: oneOf(c.provider, ['duckduckgo', 'google', 'bing', 'brave', 'startpage', 'custom'], 'duckduckgo'),
    customUrl: str(c.customUrl, 500),
    placeholder: str(c.placeholder, 120),
    bangs: c.bangs === undefined ? true : bool(c.bangs),
  }),
  rss: (c) => ({
    url: str(c.url, 500),
    limit: num(c.limit, 1, 50, 8),
    showDate: c.showDate === undefined ? true : bool(c.showDate),
  }),
  calendar: (c) => ({
    url: str(c.url, 500),
    limit: num(c.limit, 1, 50, 10),
    daysAhead: num(c.daysAhead, 1, 365, 30),
  }),
  bookmarks: (c) => ({
    columns: num(c.columns, 1, 4, 1),
    // column is 1-indexed and only meaningful once columns > 1; kept independent of
    // the current columns count here (BookmarksTile clamps at render time) so
    // lowering columns and raising it back doesn't lose each link's assignment.
    links: (Array.isArray(c.links) ? c.links : []).slice(0, 60).map((l) => ({
      title: str(l?.title, 120),
      url: str(l?.url, 500),
      icon: str(l?.icon, 500),
      column: num(l?.column, 1, 4, 1),
    })).filter((l) => l.url),
  }),
  customapi: (c) => ({
    url: str(c.url, 1000),
    method: oneOf((c.method || 'GET').toUpperCase(), ['GET', 'POST'], 'GET'),
    headers: (Array.isArray(c.headers) ? c.headers : []).slice(0, 20).map((h) => ({
      k: str(h?.k, 120),
      v: str(h?.v, 1000),
    })).filter((h) => h.k),
    body: str(c.body, 4000),
    refreshSec: num(c.refreshSec, 5, 3600, 60),
    display: oneOf(c.display, ['stats', 'list'], 'stats'),
    // mappings: list of { label, path } for stats; or { titlePath, subtitlePath, listPath } for list
    listPath: str(c.listPath, 300),
    titlePath: str(c.titlePath, 300),
    subtitlePath: str(c.subtitlePath, 300),
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 20).map((m) => ({
      label: str(m?.label, 80),
      path: str(m?.path, 300),
    })).filter((m) => m.label && m.path),
  }),
  resources: (c) => {
    // accept the old single `diskPath` / `netIface` and fold them into arrays
    const paths = Array.isArray(c.diskPaths) ? c.diskPaths : c.diskPath ? [c.diskPath] : ['/'];
    const ifaces = Array.isArray(c.netIfaces) ? c.netIfaces : c.netIface ? [c.netIface] : [];
    return {
      show: (Array.isArray(c.show) ? c.show : ['cpu', 'mem', 'disk']).filter((s) =>
        ['cpu', 'mem', 'disk', 'net'].includes(s)
      ),
      diskPaths: paths
        .map((p) => str(p, 200))
        .filter(Boolean)
        .slice(0, 8),
      netIfaces: ifaces
        .map((p) => str(p, 32))
        .filter(Boolean)
        .slice(0, 8),
    };
  },
};

// Widget-tile-only config: which of the bound integration's views to show, and which
// *other* integrations to merge in alongside it. View selection lives here (on the
// tile) rather than on the integration, so two tiles pointed at the same integration
// can each show something different. `db` is used to drop dangling integration ids
// (deleted, or typo'd from a hand-edited YAML import) rather than trusting the client.
export function widgetConfig(db, raw, primaryIntegrationId) {
  const c = raw || {};
  const out = {};

  const views = [
    ...new Set(
      (Array.isArray(c.views) ? c.views : [])
        .filter((v) => typeof v === 'string' && v.trim())
        .map((v) => v.trim().slice(0, 40))
    ),
  ].slice(0, 8);
  if (views.length) out.views = views;

  // Merging in other integrations' data only makes sense for a single, unambiguous
  // view (see WidgetTile.jsx's mergeModel) — enforced here too, not just in the tile
  // modal's UI, so a YAML import or a raw API call can't smuggle in a nonsensical combo.
  const extraIds =
    views.length === 1
      ? [
          ...new Set(
            (Array.isArray(c.moreIntegrationIds) ? c.moreIntegrationIds : [])
              .map((v) => Number(v))
              .filter((n) => Number.isInteger(n) && n > 0 && n !== primaryIntegrationId)
          ),
        ].slice(0, 12)
      : [];
  if (extraIds.length) {
    const placeholders = extraIds.map(() => '?').join(',');
    const found = new Set(
      db.prepare(`SELECT id FROM integrations WHERE id IN (${placeholders})`).all(...extraIds).map((r) => r.id)
    );
    const kept = extraIds.filter((id) => found.has(id));
    if (kept.length) out.moreIntegrationIds = kept;
  }

  return out;
}

// Fields valid on any tile regardless of type (group heading + per-tile appearance).
export function commonConfig(raw) {
  const out = {};
  if (typeof raw?.group === 'string' && raw.group.trim()) out.group = raw.group.trim().slice(0, 60);
  const a = raw?.appearance;
  if (a && typeof a === 'object') {
    const app = {};
    if (isHexColor(a.accent)) app.accent = a.accent;
    if (isHexColor(a.iconBg)) app.iconBg = a.iconBg;
    if (isHexColor(a.textColor)) app.textColor = a.textColor;
    if (a.hideTitle) app.hideTitle = true;
    if (Object.keys(app).length) out.appearance = app;
  }
  return out;
}

// Returns the sanitized config for a given tile type (excluding iframe, which the
// route handles via buildIframeConfig on its own).
export function sanitizeTileConfig(type, raw) {
  const c = raw || {};
  const base = commonConfig(c);
  const fn = PANEL_SANITIZERS[type];
  return fn ? { ...fn(c), ...base } : base;
}

export { URL_RE };

const OPEN_MODES = new Set(['newtab', 'same', 'iframe']);

export function normalizeOpenMode(value) {
  return OPEN_MODES.has(value) ? value : 'newtab';
}

export function clampInt(n, min, max) {
  const v = Number(n);
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

// Works out { url, open_mode, integration_id, config } for a given tile type from a
// request body, falling back to `existing` (a DB row, or null) for omitted fields.
// Shared by the tiles route and the YAML config importer.
export function resolveTileFields(db, type, body, existing) {
  const existingConfig = existing ? JSON.parse(existing.config_json || '{}') : {};
  const rawConfig = body.config !== undefined ? body.config : existingConfig;
  // group heading + per-tile appearance apply to every tile type. When the caller
  // sends `config` it is authoritative (so clearing group/appearance sticks); when
  // it omits `config` entirely we keep whatever was stored.
  const common = commonConfig(body.config !== undefined ? body.config || {} : existingConfig);

  if (type === 'widget') {
    let integrationId = existing ? existing.integration_id : null;
    if (body.integration_id !== undefined) integrationId = Number(body.integration_id);
    const integration = integrationId
      ? db.prepare('SELECT id FROM integrations WHERE id = ?').get(integrationId)
      : null;
    if (!integration) throw new Error('integration_id must reference an existing integration');
    return {
      url: null,
      open_mode: 'newtab',
      integration_id: integrationId,
      config: { ...widgetConfig(db, rawConfig, integrationId), ...common },
    };
  }

  if (PANEL_TYPES.has(type)) {
    return { url: null, open_mode: 'newtab', integration_id: null, config: sanitizeTileConfig(type, rawConfig) };
  }

  // link (incl. iframe open mode)
  let url = existing ? existing.url : null;
  if (body.url !== undefined) {
    if (!URL_RE.test(body.url)) throw new Error('url must start with http:// or https://');
    url = body.url;
  }
  if (!url) throw new Error('url is required and must start with http:// or https://');

  // A link tile can optionally also carry an attached integration, whose live data
  // renders below the icon/title (see widgetConfig for the views/moreIntegrationIds
  // it can carry) — unlike a widget tile's integration, this one is optional.
  let integrationId = existing ? existing.integration_id : null;
  if (body.integration_id !== undefined) {
    integrationId = body.integration_id ? Number(body.integration_id) : null;
    if (integrationId) {
      const integration = db.prepare('SELECT id FROM integrations WHERE id = ?').get(integrationId);
      if (!integration) throw new Error('integration_id must reference an existing integration');
    }
  }

  let open_mode = body.open_mode !== undefined ? normalizeOpenMode(body.open_mode) : existing?.open_mode || 'newtab';
  // An attached integration renders its data in the tile body — no room left for an
  // iframe embed of the link itself, so fall back to a normal newtab link.
  if (integrationId && open_mode === 'iframe') open_mode = 'newtab';

  const config =
    open_mode === 'iframe'
      ? { ...buildIframeConfig(rawConfig), ...common }
      : { ...(integrationId ? widgetConfig(db, rawConfig, integrationId) : {}), ...common };

  return { url, open_mode, integration_id: integrationId, config };
}
