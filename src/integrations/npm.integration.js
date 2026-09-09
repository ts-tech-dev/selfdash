import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Nginx Proxy Manager. Auth: POST /api/tokens {identity, secret} -> a bearer token that
// lasts ~1 day. The token is cached per (url, email) and refreshed on expiry or a 401.

const VIEWS = {
  stats: { label: 'Host stats', run: fetchStats },
  certs: { label: 'Expiring certificates', run: fetchExpiringCerts },
};

export default class NpmIntegration extends BaseIntegration {
  static key = 'npm';
  static title = 'Nginx Proxy Manager';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'email', label: 'Admin email', type: 'text', required: true },
      { name: 'password', label: 'Admin password', type: 'password', required: true },
      { name: 'certDays', label: 'Cert expiry window (days)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const arr = (x) => (Array.isArray(x) ? x : []);
const cacheKey = (config) => `${baseOf(config)}::${config.email}`;

// Module-level so the token survives across polls (a new one each minute would be silly).
const tokenCache = new Map(); // key -> { token, expiresAt }
const inflight = new Map(); // key -> Promise<token> — dedupes the concurrent first-poll logins

async function login({ config, http }) {
  const res = await http.fetchJson(`${baseOf(config)}/api/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: config.email, secret: config.password }),
  });
  if (!res?.token) throw new Error('NPM login failed — check email/password');
  const expiresAt = res.expires ? new Date(res.expires).getTime() : Date.now() + 3600_000;
  tokenCache.set(cacheKey(config), { token: res.token, expiresAt });
  return res.token;
}

async function token(ctx) {
  const key = cacheKey(ctx.config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  if (!inflight.has(key)) inflight.set(key, login(ctx).finally(() => inflight.delete(key)));
  return inflight.get(key);
}

// GET with the bearer token, transparently re-authing once on a 401. The re-auth goes
// back through token() so parallel 401s on one poll still trigger just one new login.
async function apiGet(ctx, path) {
  const { config, http } = ctx;
  const url = `${baseOf(config)}${path}`;
  const tok = await token(ctx);
  try {
    return await http.fetchJson(url, { headers: { Authorization: `Bearer ${tok}` } });
  } catch (err) {
    if (!/\b401\b/.test(err.message)) throw err;
    const cached = tokenCache.get(cacheKey(config));
    if (cached && cached.token === tok) tokenCache.delete(cacheKey(config));
    const fresh = await token(ctx);
    return http.fetchJson(url, { headers: { Authorization: `Bearer ${fresh}` } });
  }
}

async function fetchStats(ctx) {
  const [proxy, redir, streams, dead] = await Promise.all([
    apiGet(ctx, '/api/nginx/proxy-hosts'),
    apiGet(ctx, '/api/nginx/redirection-hosts').catch(() => []),
    apiGet(ctx, '/api/nginx/streams').catch(() => []),
    apiGet(ctx, '/api/nginx/dead-hosts').catch(() => []),
  ]);

  const proxyList = arr(proxy);
  const offline = proxyList.filter((h) => h.meta && h.meta.nginx_online === false).length;
  const disabled = proxyList.filter((h) => h.enabled === false || h.enabled === 0).length;

  return {
    type: 'stats',
    items: [
      { label: 'Proxy hosts', value: proxyList.length },
      { label: 'Redirections', value: arr(redir).length },
      { label: 'Streams', value: arr(streams).length },
      { label: 'Disabled', value: disabled },
      { label: 'Offline', value: offline || arr(dead).length },
    ],
  };
}

async function fetchExpiringCerts(ctx) {
  const days = Number(ctx.config.certDays) > 0 ? Number(ctx.config.certDays) : 30;
  const horizon = Date.now() + days * 86400000;

  const rows = arr(await apiGet(ctx, '/api/nginx/certificates'))
    .map((c) => ({ c, ts: new Date(c.expires_on).getTime() }))
    .filter(({ ts }) => Number.isFinite(ts) && ts <= horizon)
    .sort((a, b) => a.ts - b.ts)
    .map(({ c, ts }) => {
      const left = Math.round((ts - Date.now()) / 86400000);
      const name = c.nice_name || arr(c.domain_names)[0] || `#${c.id}`;
      return {
        title: name,
        subtitle: `expires ${new Date(ts).toLocaleDateString()}${left < 0 ? ' (expired)' : ` (${left}d)`}`,
      };
    });

  return { type: 'list', items: rows };
}
