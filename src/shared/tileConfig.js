// Per-type validation / sanitation for tile.config. Shared by the tiles route and
// backup import so the rules live in one place. Each sanitizer takes the raw config
// object and returns a clean one; unknown keys are dropped.

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
    links: (Array.isArray(c.links) ? c.links : []).slice(0, 60).map((l) => ({
      title: str(l?.title, 120),
      url: str(l?.url, 500),
      icon: str(l?.icon, 500),
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

// Fields valid on any tile regardless of type (group heading + per-tile appearance).
export function commonConfig(raw) {
  const out = {};
  if (typeof raw?.group === 'string' && raw.group.trim()) out.group = raw.group.trim().slice(0, 60);
  const a = raw?.appearance;
  if (a && typeof a === 'object') {
    const app = {};
    if (/^#[0-9a-f]{6}$/i.test(a.accent || '')) app.accent = a.accent;
    if (/^#[0-9a-f]{6}$/i.test(a.iconBg || '')) app.iconBg = a.iconBg;
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
