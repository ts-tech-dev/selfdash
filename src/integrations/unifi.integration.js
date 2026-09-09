import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// UniFi Network (self-hosted "Network Application", or a UniFi OS console — for the
// latter, include the `/proxy/network` prefix in the server URL). Two auth paths: a
// local API key (`X-API-Key`, newer controllers) if configured, else the classic
// cookie login `POST /api/login {username,password}`. Either way, stats come from the
// classic controller API: `/api/s/{site}/stat/sta` (clients) + `/api/s/{site}/stat/device`
// (access points, switches, gateways). Self-signed by default, hence insecure-TLS.

const VIEWS = {
  stats: { label: 'Network stats', run: fetchStats },
};

export default class UnifiIntegration extends BaseIntegration {
  static key = 'unifi';
  static title = 'UniFi Network';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Controller URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key (skips username/password if set)', type: 'password', required: false },
      { name: 'username', label: 'Username', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
      { name: 'site', label: 'Site name', type: 'text', required: false },
      { name: 'allowInsecureTLS', label: 'Allow self-signed / insecure TLS certificate', type: 'checkbox', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const siteOf = (config) => config.site || 'default';
const cookieCache = new Map(); // base -> cookie
const loginInflight = new Map(); // base -> Promise<cookie>, dedupes concurrent first-poll logins

async function doLogin(ctx) {
  const { config, http } = ctx;
  const res = await http.fetch(`${baseOf(config)}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password || '' }),
    insecureTLS: config.allowInsecureTLS,
  });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  if (!res.ok || !cookie) throw new Error('UniFi login failed — check username/password');
  cookieCache.set(baseOf(config), cookie);
  return cookie;
}

async function login(ctx) {
  const key = baseOf(ctx.config);
  if (!loginInflight.has(key)) {
    loginInflight.set(key, doLogin(ctx).finally(() => loginInflight.delete(key)));
  }
  return loginInflight.get(key);
}

async function authHeaders(ctx) {
  if (ctx.config.apiKey) return { 'X-API-Key': ctx.config.apiKey };
  const key = baseOf(ctx.config);
  const cached = cookieCache.get(key);
  return { Cookie: cached || (await login(ctx)) };
}

async function apiGet(ctx, path) {
  const { config, http } = ctx;
  const url = `${baseOf(config)}${path}`;
  const doFetch = async () =>
    http.fetchJson(url, { headers: await authHeaders(ctx), insecureTLS: config.allowInsecureTLS });

  try {
    return await doFetch();
  } catch (err) {
    if (config.apiKey || !/\b401\b/.test(err.message)) throw err;
    cookieCache.delete(baseOf(config));
    return doFetch();
  }
}

async function fetchNetwork(ctx) {
  const site = siteOf(ctx.config);
  const [clientsRes, devicesRes] = await Promise.all([
    apiGet(ctx, `/api/s/${site}/stat/sta`),
    apiGet(ctx, `/api/s/${site}/stat/device`),
  ]);
  return {
    clients: Array.isArray(clientsRes.data) ? clientsRes.data : [],
    devices: Array.isArray(devicesRes.data) ? devicesRes.data : [],
  };
}

async function fetchStats(ctx) {
  const { clients, devices } = await fetchNetwork(ctx);
  const wired = clients.filter((c) => c.is_wired).length;
  const aps = devices.filter((d) => d.type === 'uap');
  const apsUp = aps.filter((d) => d.state === 1).length;
  const gateway = devices.find((d) => d.type === 'ugw' || d.type === 'udm');
  const wanUp = gateway ? gateway.state === 1 : undefined;

  return {
    type: 'stats',
    items: [
      { label: 'Wired clients', value: wired },
      { label: 'WiFi clients', value: clients.length - wired },
      { label: 'APs up', value: `${apsUp}/${aps.length}` },
      { label: 'WAN', value: wanUp === undefined ? 'unknown' : wanUp ? 'up' : 'down' },
    ],
  };
}
