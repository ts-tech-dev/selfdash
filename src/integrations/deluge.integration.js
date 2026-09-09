import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';
import { fmtRate } from '../shared/format.js';

// Deluge Web UI JSON-RPC (`/json`). `auth.login` [password] sets a `_session_id` cookie;
// every other call needs it attached. The cookie is cached per URL and re-fetched once
// on any RPC error (Deluge reports "not authenticated" inside a 200 body, not via HTTP
// status, so there's no status code to branch on the way NPM's bearer-token retry does).
//
// Verified live (linuxserver/deluge): the web UI process starts out disconnected from its
// daemon — after a restart, or on a install that's never been opened in a browser — until
// something calls `web.connect`. A disconnected `web.update_ui` doesn't error, it just
// returns `torrents: null`, which would otherwise look exactly like "no torrents" forever.
// `updateUi` below checks `result.connected` and, if false, connects to the first
// configured host (`web.get_hosts`) and retries once.

const VIEWS = {
  queue: { label: 'Torrent queue', run: fetchQueue },
  stats: { label: 'Transfer stats', run: fetchStats },
};

export default class DelugeIntegration extends BaseIntegration {
  static key = 'deluge';
  static title = 'Deluge';
  static mergeGroup = 'download';
  static defaultInterval = 30;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'password', label: 'Web UI password', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const sessionCache = new Map(); // base -> cookie
const inflight = new Map(); // base -> Promise<cookie>
const connectInflight = new Map(); // base -> Promise<void>, dedupes concurrent web.connect calls

let requestId = 1;

async function rpc({ config, http }, method, params, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await http.fetch(`${baseOf(config)}/json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method, params, id: requestId++ }),
  });
  if (!res.ok) throw new Error(`Deluge ${method} responded ${res.status}`);
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || `Deluge ${method} failed`);
  return { result: data.result, cookie: setCookie[0]?.split(';')[0] };
}

async function login(ctx) {
  const { result, cookie } = await rpc(ctx, 'auth.login', [ctx.config.password || '']);
  if (!result) throw new Error('Deluge login failed — check the web UI password');
  if (!cookie) throw new Error('Deluge login did not return a session cookie');
  sessionCache.set(baseOf(ctx.config), cookie);
  return cookie;
}

async function session(ctx) {
  const key = baseOf(ctx.config);
  const cached = sessionCache.get(key);
  if (cached) return cached;
  if (!inflight.has(key)) inflight.set(key, login(ctx).finally(() => inflight.delete(key)));
  return inflight.get(key);
}

async function ensureConnected(ctx) {
  const key = baseOf(ctx.config);
  if (!connectInflight.has(key)) {
    connectInflight.set(
      key,
      (async () => {
        const cookie = await session(ctx);
        const { result: hosts } = await rpc(ctx, 'web.get_hosts', [], cookie);
        const hostId = hosts?.[0]?.[0];
        if (!hostId) throw new Error('Deluge web UI has no daemon host configured to connect to');
        await rpc(ctx, 'web.connect', [hostId], cookie);
      })().finally(() => connectInflight.delete(key))
    );
  }
  return connectInflight.get(key);
}

async function updateUi(ctx) {
  const key = baseOf(ctx.config);
  const keys = ['name', 'state', 'progress', 'download_payload_rate', 'upload_payload_rate'];

  const run = async () => {
    const cookie = await session(ctx);
    return (await rpc(ctx, 'web.update_ui', [keys, {}], cookie)).result;
  };

  let result;
  try {
    result = await run();
  } catch {
    sessionCache.delete(key);
    result = await run();
  }

  if (result && result.connected === false) {
    await ensureConnected(ctx);
    result = await run();
  }

  return result;
}

async function fetchTorrents(ctx) {
  const result = await updateUi(ctx);
  return Object.values(result?.torrents || {});
}

async function fetchQueue(ctx) {
  const torrents = await fetchTorrents(ctx);
  return {
    type: 'queue',
    items: torrents.map((t) => ({
      title: t.name,
      status: t.state,
      // Deluge reports progress 0-100, the WidgetModel expects 0-1.
      progress: typeof t.progress === 'number' ? t.progress / 100 : undefined,
    })),
  };
}

async function fetchStats(ctx) {
  const torrents = await fetchTorrents(ctx);
  const dlRate = torrents.reduce((sum, t) => sum + (t.download_payload_rate || 0), 0);
  const upRate = torrents.reduce((sum, t) => sum + (t.upload_payload_rate || 0), 0);
  return {
    type: 'stats',
    items: [
      { label: 'Torrents', value: torrents.length },
      { label: 'Downloading', value: torrents.filter((t) => t.state === 'Downloading').length },
      { label: 'Seeding', value: torrents.filter((t) => t.state === 'Seeding').length },
      { label: 'DL Speed', value: fmtRate(dlRate) },
      { label: 'UL Speed', value: fmtRate(upRate) },
    ],
  };
}
