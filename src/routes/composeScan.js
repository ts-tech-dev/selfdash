import { scanComposeDir } from '../lib/composeScan.js';

const CACHE_TTL_MS = 15_000; // dashboards poll this; don't re-walk the tree every few seconds
let cache = null; // { dir, at, value }

export default async function composeScanRoutes(app) {
  const db = app.db;

  const readCfg = () => {
    const rows = db.prepare("SELECT key, value_json FROM settings WHERE key IN ('compose_scan_enabled', 'compose_scan_dir')").all();
    const map = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value_json)]));
    return { enabled: map.compose_scan_enabled === true, dir: map.compose_scan_dir || null };
  };

  app.get('/api/compose-scan', async (req) => {
    const { enabled, dir } = readCfg();
    if (!enabled) return { enabled: false, dir, result: null };
    if (!dir) return { enabled: true, dir: null, result: { error: 'no directory configured', stacks: [], errors: [] } };

    const force = req.query?.refresh === '1' || req.query?.refresh === 'true';
    if (!force && cache && cache.dir === dir && Date.now() - cache.at < CACHE_TTL_MS) {
      return { enabled: true, dir, result: cache.value, cached: true };
    }

    const result = scanComposeDir(dir);
    cache = { dir, at: Date.now(), value: result };
    return { enabled: true, dir, result };
  });
}

// Called by the settings route after compose_scan_* changes so the next fetch is fresh.
export function invalidateComposeScanCache() {
  cache = null;
}
