import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Kavita: exchange the account's API key for a short-lived JWT via
// POST /api/Plugin/authenticate?apiKey=<key>&pluginName=selfdash, then send it as a
// bearer token. `/api/Stats/server/stats` is admin-only (best-effort); `/api/Stats/user/read`
// carries the words-read total for the key's own user.

const VIEWS = {
  stats: { label: 'Library stats', run: fetchStats },
};

export default class KavitaIntegration extends BaseIntegration {
  static key = 'kavita';
  static title = 'Kavita';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');

const tokenCache = new Map(); // base::apiKey -> { token, expiresAt }
const inflight = new Map();

async function authenticate({ config, http }) {
  const base = baseOf(config);
  const qs = new URLSearchParams({ apiKey: config.apiKey, pluginName: 'selfdash' });
  const data = await http.fetchJson(`${base}/api/Plugin/authenticate?${qs}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!data?.token) throw new Error('Kavita authenticate returned no token — check the API key');
  // Kavita JWTs last a week; refresh well before then.
  tokenCache.set(`${base}::${config.apiKey}`, { token: data.token, expiresAt: Date.now() + 6 * 86400_000 });
  return data.token;
}

async function token(ctx) {
  const key = `${baseOf(ctx.config)}::${ctx.config.apiKey}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 3600_000) return cached.token;
  if (!inflight.has(key)) inflight.set(key, authenticate(ctx).finally(() => inflight.delete(key)));
  return inflight.get(key);
}

async function apiGet(ctx, path) {
  const tok = await token(ctx);
  return ctx.http.fetchJson(`${baseOf(ctx.config)}${path}`, {
    headers: { Authorization: `Bearer ${tok}`, Accept: 'application/json' },
  });
}

async function fetchStats(ctx) {
  // Resolve the token up front so an auth failure fails the poll outright, rather than
  // being swallowed by the per-endpoint `.catch` below and rendering as all-zeros.
  await token(ctx);
  const [server, read] = await Promise.all([
    apiGet(ctx, '/api/Stats/server/stats').catch(() => ({})),
    apiGet(ctx, '/api/Stats/user/read').catch(() => ({})),
  ]);
  const items = [];
  if (server.seriesCount != null) items.push({ label: 'Series', value: Number(server.seriesCount) || 0 });
  if (server.volumeCount != null) items.push({ label: 'Volumes', value: Number(server.volumeCount) || 0 });
  if (server.chapterCount != null) items.push({ label: 'Chapters', value: Number(server.chapterCount) || 0 });
  items.push({ label: 'Words read', value: Number(read.totalWordsRead) || 0 });
  if (read.totalPagesRead != null) items.push({ label: 'Pages read', value: Number(read.totalPagesRead) || 0 });
  return { type: 'stats', items };
}
