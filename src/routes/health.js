import { httpClient } from '../lib/httpClient.js';

const PROBE_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 15_000; // dashboards poll this every ~30s; don't re-hit a target on every render
const MAX_URLS = 100;
const URL_RE = /^https?:\/\//i;

const cache = new Map(); // url -> { at, value }

// A tile URL points at a self-hosted service (often a LAN address). Any HTTP response —
// including 401/403/500 or a redirect to a login page — means the host is up and serving,
// so it counts as "online". Only a DNS failure, refused connection, TLS error, or timeout
// is "offline".
async function probe(url) {
  try {
    const res = await httpClient.fetch(url, { method: 'GET', redirect: 'manual', timeout: PROBE_TIMEOUT_MS });
    res.body?.cancel?.().catch(() => {});
    return { status: 'online', code: res.status };
  } catch {
    return { status: 'offline' };
  }
}

export default async function healthRoutes(app) {
  app.post('/api/health/check', async (req) => {
    const raw = Array.isArray(req.body?.urls) ? req.body.urls : [];
    const urls = [...new Set(raw.filter((u) => typeof u === 'string' && URL_RE.test(u)))].slice(0, MAX_URLS);

    const now = Date.now();
    const out = {};
    await Promise.all(
      urls.map(async (url) => {
        const hit = cache.get(url);
        if (hit && now - hit.at < CACHE_TTL_MS) {
          out[url] = hit.value;
          return;
        }
        const value = { ...(await probe(url)), at: new Date().toISOString() };
        cache.set(url, { at: now, value });
        out[url] = value;
      })
    );
    return out;
  });
}
