import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// FreshRSS via its Google Reader-compatible API (`/api/greader.php`). Auth is a two step
// handshake: POST .../accounts/ClientLogin (form body) returns a plain-text `Auth=<token>`
// line, then every call carries `Authorization: GoogleLogin auth=<token>`. The token is
// cached per (url, user) and re-fetched on expiry or a 401.

const VIEWS = {
  stats: { label: 'Reader stats', run: fetchStats },
};

export default class FreshRssIntegration extends BaseIntegration {
  static key = 'freshrss';
  static title = 'FreshRSS';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'apiPassword', label: 'API Password', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const greaderBase = (config) => `${config.url.replace(/\/+$/, '')}/api/greader.php`;
const cacheKey = (config) => `${greaderBase(config)}::${config.username}`;

const tokenCache = new Map(); // key -> token
const inflight = new Map();

async function clientLogin({ config, http }) {
  const body = new URLSearchParams({ Email: config.username, Passwd: config.apiPassword }).toString();
  const res = await http.fetch(`${greaderBase(config)}/accounts/ClientLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`FreshRSS ClientLogin responded ${res.status}`);
  const text = await res.text();
  const auth = text.split(/\r?\n/).map((l) => l.match(/^Auth=(.+)$/)).find(Boolean);
  if (!auth) throw new Error('FreshRSS ClientLogin returned no Auth token — check credentials / API access');
  tokenCache.set(cacheKey(config), auth[1]);
  return auth[1];
}

async function token(ctx) {
  const key = cacheKey(ctx.config);
  if (tokenCache.has(key)) return tokenCache.get(key);
  if (!inflight.has(key)) inflight.set(key, clientLogin(ctx).finally(() => inflight.delete(key)));
  return inflight.get(key);
}

async function apiGet(ctx, path) {
  const { config, http } = ctx;
  const url = `${greaderBase(config)}${path}`;
  const doGet = (tok) => http.fetchJson(url, { headers: { Authorization: `GoogleLogin auth=${tok}` } });
  try {
    return await doGet(await token(ctx));
  } catch (err) {
    if (!/\b401\b/.test(err.message)) throw err;
    tokenCache.delete(cacheKey(config));
    return doGet(await token(ctx));
  }
}

async function fetchStats(ctx) {
  const [counts, subs] = await Promise.all([
    apiGet(ctx, '/reader/api/0/unread-count?output=json'),
    apiGet(ctx, '/reader/api/0/subscription/list?output=json').catch(() => ({ subscriptions: [] })),
  ]);
  const rows = Array.isArray(counts.unreadcounts) ? counts.unreadcounts : [];
  const readingList = rows.find((r) => r.id === 'user/-/state/com.google/reading-list');
  const totalUnread = readingList
    ? Number(readingList.count) || 0
    : rows.filter((r) => String(r.id).startsWith('feed/')).reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  return {
    type: 'stats',
    items: [
      { label: 'Unread', value: totalUnread },
      { label: 'Subscriptions', value: Array.isArray(subs.subscriptions) ? subs.subscriptions.length : 0 },
    ],
  };
}
