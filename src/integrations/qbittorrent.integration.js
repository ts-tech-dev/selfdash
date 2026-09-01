import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';
import { fmtRate } from '../shared/format.js';

const VIEWS = {
  queue: { label: 'Download queue', run: fetchQueue },
  stats: { label: 'Transfer stats', run: fetchStats },
};

// Exact-match, not substring — "downloading" itself doesn't contain "DL", so a naive
// .includes('DL') check misses the plain states while still matching the compound ones below.
const DOWNLOADING_STATES = new Set([
  'downloading',
  'metaDL',
  'stalledDL',
  'queuedDL',
  'pausedDL',
  'forcedDL',
  'checkingDL',
  'allocating',
]);
const UPLOADING_STATES = new Set(['uploading', 'stalledUP', 'queuedUP', 'pausedUP', 'forcedUP', 'checkingUP']);

export default class QbittorrentIntegration extends BaseIntegration {
  static key = 'qbittorrent';
  static title = 'qBittorrent';
  static mergeGroup = 'download';
  static defaultInterval = 30;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchTorrents({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const headers = await login({ base, config, http });
  return http.fetchJson(`${base}/api/v2/torrents/info`, { headers });
}

async function fetchQueue(ctx) {
  const torrents = await fetchTorrents(ctx);
  return {
    type: 'queue',
    items: torrents.map((t) => ({
      title: t.name,
      status: t.state,
      progress: typeof t.progress === 'number' ? t.progress : undefined,
    })),
  };
}

async function fetchStats(ctx) {
  const torrents = await fetchTorrents(ctx);
  return {
    type: 'stats',
    items: [
      { label: 'Torrents', value: torrents.length },
      { label: 'Downloading', value: torrents.filter((t) => DOWNLOADING_STATES.has(t.state)).length },
      { label: 'Seeding', value: torrents.filter((t) => UPLOADING_STATES.has(t.state)).length },
      { label: 'DL Speed', value: fmtRate(torrents.reduce((sum, t) => sum + (t.dlspeed || 0), 0)) },
    ],
  };
}

async function login({ base, config, http }) {
  const headers = {};

  // Auth is optional — many qBittorrent setups whitelist the docker network
  // and disable the login prompt entirely. Only log in if credentials are given.
  if (config.username) {
    const loginRes = await http.fetch(`${base}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: base },
      body: new URLSearchParams({ username: config.username, password: config.password || '' }).toString(),
    });
    const setCookie = loginRes.headers.getSetCookie
      ? loginRes.headers.getSetCookie()
      : [loginRes.headers.get('set-cookie')].filter(Boolean);
    // Success = "we got a session cookie" — not a specific status/body. Observed in the wild:
    // older qBittorrent returns 200 + body "Ok."; newer builds return 204 + empty body. The
    // cookie name varies too (classic "SID" vs port-suffixed "QBT_SID_<port>" on newer builds),
    // so take whatever auth/login actually set rather than matching a specific name — that
    // endpoint's only job is setting the session cookie.
    const sid = setCookie[0]?.split(';')[0];
    if (!loginRes.ok || !sid) {
      throw new Error('qBittorrent login failed — check username/password');
    }
    headers.Cookie = sid;
  }

  return headers;
}
