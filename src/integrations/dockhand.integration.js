import { BaseIntegration } from './_base.js';
import { runAllViews, viewCatalog, perPoll } from './_views.js';

// Dockhand (Docker/Compose manager, dockhand.pro). Verified live against fnsys/dockhand
// 1.0.51 with a socket environment. GET /api/dashboard/stats returns one entry per
// environment — containers {running, stopped, paused, total, pendingUpdates, …},
// stacks {running, total, …}, metrics {cpuPercent, memoryPercent} (null until metrics
// have been collected) — and is slow by design: per call it lists every container,
// image, volume, network and stack and runs a disk-usage scan, each step capped at 10s
// server-side, so it routinely takes ~10s and needs more than the default HTTP timeout.
// Pending updates per container come from GET /api/containers/pending-updates?env=<id>
// (env is required), which only reads Dockhand's cached check results.
// Auth is optional (off on a fresh install). When on: an API token (Profile -> API
// tokens, "dh_…") as a Bearer header, or local username/password via
// POST /api/auth/login, which sets a `dockhand_session` cookie (accounts with MFA, or
// LDAP/OIDC-only setups, need a token). Bad credentials are a plain 401 either way.
// Dockhand rate-limits repeated bad Bearer tokens per IP, so a token 401 is reported
// (as "rejected the API token") rather than retried.

const STATS_TIMEOUT_MS = 30_000;

const VIEWS = {
  stats: { label: 'Container stats', run: fetchStats },
  updates: { label: 'Pending updates', run: fetchUpdates },
  // Feeds the per-tile update badge (src/shared/containerUpdates.js), not a tile view.
  containerUpdates: { label: 'Container updates', hidden: true, run: fetchContainerUpdates },
};

export default class DockhandIntegration extends BaseIntegration {
  static key = 'dockhand';
  static title = 'Dockhand';
  static defaultInterval = 60;
  static views = viewCatalog(VIEWS);

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API token (or use username/password)', type: 'password', required: false },
      { name: 'username', label: 'Username', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
      { name: 'environment', label: 'Environment name or ID (blank = all)', type: 'text', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
// Keyed on the password too, so editing it in the config can't keep riding an old session.
const sessionKey = (config) => `${baseOf(config)}\n${config.username}\n${config.password || ''}`;
const cookieCache = new Map(); // base+credentials -> cookie
const loginInflight = new Map(); // base+credentials -> Promise<cookie>, dedupes the two views' first logins

async function doLogin({ config, http }) {
  const res = await http.fetch(`${baseOf(config)}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password || '', provider: 'local' }),
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('dockhand_session='));
  if (!res.ok || !cookie) {
    // 200 without a cookie = the account needs an MFA code, which a dashboard can't supply.
    throw new Error(res.ok ? 'Dockhand login needs MFA — use an API token instead' : 'Dockhand login failed — check username/password');
  }
  cookieCache.set(sessionKey(config), cookie);
  return cookie;
}

function login(ctx) {
  const key = sessionKey(ctx.config);
  if (!loginInflight.has(key)) {
    loginInflight.set(key, doLogin(ctx).finally(() => loginInflight.delete(key)));
  }
  return loginInflight.get(key);
}

async function authHeaders(ctx) {
  const { config } = ctx;
  if (config.apiKey) return { Authorization: `Bearer ${config.apiKey}` };
  if (!config.username) return {};
  return { Cookie: cookieCache.get(sessionKey(config)) || (await login(ctx)) };
}

async function apiGet(ctx, path, opts = {}) {
  const { config, http } = ctx;
  const doFetch = async () => http.fetchJson(`${baseOf(config)}${path}`, { ...opts, headers: await authHeaders(ctx) });
  try {
    return await doFetch();
  } catch (err) {
    if (!/\b401\b/.test(err.message)) throw err;
    if (config.apiKey) throw new Error('Dockhand rejected the API token');
    if (!config.username) throw new Error('Dockhand requires authentication — set an API token or username/password');
    // Expired/restarted session: log in again once.
    cookieCache.delete(sessionKey(config));
    return doFetch();
  }
}

// Narrows a list of {id, name} environments to the configured one (name, case-insensitive,
// or numeric id); all of them when unset. Unknown names are an error, not a silent zero.
function pickEnvironments(envs, wanted) {
  const w = String(wanted ?? '').trim();
  if (!w) return envs;
  const picked = envs.filter((e) => String(e.id) === w || String(e.name ?? '').toLowerCase() === w.toLowerCase());
  if (!picked.length) throw new Error(`Dockhand environment "${w}" not found`);
  return picked;
}

const num = (v) => Number(v) || 0;
const pct = (v) => `${v.toFixed(1)}%`;

async function fetchStats(ctx) {
  const raw = await apiGet(ctx, '/api/dashboard/stats', { timeout: STATS_TIMEOUT_MS });
  const envs = pickEnvironments(Array.isArray(raw) ? raw : raw ? [raw] : [], ctx.config.environment);
  const sum = (pick) => envs.reduce((n, e) => n + num(pick(e)), 0);
  // CPU/memory are per-host percentages: average across hosts that report metrics.
  const withMetrics = envs.filter((e) => e.metrics);
  const avg = (pick) => (withMetrics.length ? withMetrics.reduce((n, e) => n + num(pick(e.metrics)), 0) / withMetrics.length : 0);

  return {
    type: 'stats',
    items: [
      { label: 'Running', value: sum((e) => e.containers?.running) },
      { label: 'Stopped', value: sum((e) => e.containers?.stopped) },
      { label: 'Total', value: sum((e) => e.containers?.total) },
      { label: 'Updates', value: sum((e) => e.containers?.pendingUpdates) },
      { label: 'Stacks', value: `${sum((e) => e.stacks?.running)}/${sum((e) => e.stacks?.total)}` },
      { label: 'CPU', value: pct(avg((m) => m.cpuPercent)) },
      { label: 'Memory', value: pct(avg((m) => m.memoryPercent)) },
    ],
  };
}

// Raw pending-update rows for every selected environment, fetched once per poll.
function fetchPendingUpdates(ctx) {
  return perPoll(ctx, 'pendingUpdates', () => loadPendingUpdates(ctx));
}

async function loadPendingUpdates(ctx) {
  const all = await apiGet(ctx, '/api/environments');
  const envs = pickEnvironments(Array.isArray(all) ? all : [], ctx.config.environment);
  const perEnv = await Promise.all(
    envs.map(async (e) => {
      const res = await apiGet(ctx, `/api/containers/pending-updates?env=${encodeURIComponent(e.id)}`);
      const rows = Array.isArray(res?.pendingUpdates) ? res.pendingUpdates : [];
      return rows.filter((u) => u.hasImageUpdate !== false).map((u) => ({ ...u, environment: e.name }));
    }),
  );
  return { rows: perEnv.flat(), multiEnv: envs.length > 1 };
}

async function fetchUpdates(ctx) {
  const { rows, multiEnv } = await fetchPendingUpdates(ctx);
  return {
    type: 'list',
    items: rows.length
      ? rows.map((u) => ({
          title: u.containerName || u.containerId?.slice(0, 12) || 'container',
          subtitle: multiEnv ? `${u.currentImage ?? ''} · ${u.environment}` : u.currentImage ?? '',
        }))
      : [{ title: 'All containers up to date' }],
  };
}

async function fetchContainerUpdates(ctx) {
  const { rows } = await fetchPendingUpdates(ctx);
  return {
    type: 'containerUpdates',
    items: rows.filter((u) => u.containerName).map((u) => ({ name: u.containerName, image: u.currentImage ?? null, environment: u.environment ?? null })),
  };
}
