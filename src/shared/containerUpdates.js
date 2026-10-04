// Per-tile "container update available" badge: which tiles map to a container with a
// pending image update. Update data comes from integrations that publish a hidden
// `containerUpdates` view (Dockhand, What's Up Docker — see src/integrations/_views.js),
// shaped { type: 'containerUpdates', items: [{ name, image, environment }] }.
//
// A tile's link to containers is its `config.containers` setting:
//   blank -> auto: match the tile's title (or, for an untitled widget tile, its
//            integration's name) against container names, see containerKeys()
//   "-"   -> never show the badge on this tile
//   "a, b" -> exactly these container names (case-insensitive), comma-separated
// Auto-matching compares normalized names (lowercase, letters/digits only), so
// "DVD Burner" matches `dvd-burner` and "CloudCmd" matches compose's
// `adminapps-cloudcmd-1`; a stack's helpers count for its app ("Immich" matches
// `immich_server`, `immich_redis`, …) because an outdated database is the app's update too.

const MIN_AUTO_KEY = 3; // a 1–2 letter title is too ambiguous to auto-match on

export const normalizeName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Every normalized key a container name answers to for auto-matching.
export function containerKeys(name) {
  const raw = String(name ?? '').trim().toLowerCase();
  const keys = new Set([normalizeName(raw)]);
  // Compose's default naming is <project>-<service>-<replica>: drop the replica, and
  // also offer each trailing hyphen-run as the service (projects can contain hyphens).
  const replica = raw.match(/^(.+)-\d+$/);
  if (replica) {
    const base = replica[1];
    keys.add(normalizeName(base));
    const parts = base.split('-');
    for (let i = 1; i < parts.length; i++) keys.add(normalizeName(parts.slice(i).join('-')));
  }
  // Stack prefix: `immich_server` / `mealie-postgres` also answer to `immich` / `mealie`.
  const first = raw.split(/[-_.]/)[0];
  if (first && first !== raw) keys.add(normalizeName(first));
  keys.delete('');
  return keys;
}

// integrations (as served by GET /api/integrations, with parsed `data`) -> flat list of
// { name, image, environment, source } for enabled integrations' last-good data.
export function collectContainerUpdates(integrations) {
  const out = [];
  const seen = new Set();
  for (const integ of integrations || []) {
    if (!integ?.enabled) continue;
    const model = integ.data?.hidden?.containerUpdates;
    if (!model || model.type !== 'containerUpdates' || !Array.isArray(model.items)) continue;
    for (const u of model.items) {
      if (!u?.name) continue;
      // Dockhand and WUD watching the same host both report it — one badge entry is enough.
      const dedupe = `${String(u.name).toLowerCase()}\n${u.environment ?? ''}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ name: u.name, image: u.image ?? null, environment: u.environment ?? null, source: integ.name });
    }
  }
  return out;
}

// Parses the tile's config.containers setting (see header).
export function parseContainerSetting(value) {
  const s = String(value ?? '').trim();
  if (!s) return { mode: 'auto', names: [] };
  if (s === '-') return { mode: 'off', names: [] };
  return {
    mode: 'explicit',
    names: s.split(',').map((n) => n.trim().toLowerCase()).filter(Boolean),
  };
}

// Panel tiles (clock, weather, notes, …) are never about one service.
const BADGE_TILE_TYPES = new Set(['link', 'widget']);

// tile + collectContainerUpdates() output -> the updates that apply to this tile ([] = no badge).
// `fallbackTitle` is used for auto-matching when the tile has no title of its own
// (untitled widget tiles display their integration's data, so its name stands in).
export function tileContainerUpdates(tile, updates, fallbackTitle = '') {
  if (!tile || !BADGE_TILE_TYPES.has(tile.type) || !updates?.length) return [];
  const setting = parseContainerSetting(tile.config?.containers);
  if (setting.mode === 'off') return [];
  if (setting.mode === 'explicit') {
    const wanted = new Set(setting.names);
    return updates.filter((u) => wanted.has(String(u.name).toLowerCase()));
  }
  const key = normalizeName(tile.title || fallbackTitle);
  if (key.length < MIN_AUTO_KEY) return [];
  return updates.filter((u) => containerKeys(u.name).has(key));
}

// Tooltip / accessible label for a tile's badge.
export function updateBadgeLabel(matches) {
  if (!matches?.length) return '';
  const describe = (u) => `${u.name}${u.image ? ` (${u.image})` : ''}${u.environment ? ` on ${u.environment}` : ''}`;
  const sources = [...new Set(matches.map((u) => u.source).filter(Boolean))].join(', ');
  const head = matches.length === 1 ? 'Container update available' : `${matches.length} container updates available`;
  return `${head}: ${matches.map(describe).join(', ')}${sources ? ` — via ${sources}` : ''}`;
}
