import { createHash } from 'node:crypto';
import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Navidrome (and other Subsonic-compatible servers). Subsonic API uses salted-token
// auth: t = md5(password + salt), sent alongside u / s / v / c / f=json on every call.
// `/rest/getScanStatus` carries the library media (song) + folder counts; there is no
// cheap album/artist count in the Subsonic surface, so `stats` reports what the server
// actually exposes. `nowplaying` reads `/rest/getNowPlaying`.

const VIEWS = {
  nowplaying: { label: 'Active streams', run: fetchNowPlaying },
  stats: { label: 'Library stats', run: fetchStats },
};

export default class NavidromeIntegration extends BaseIntegration {
  static key = 'navidrome';
  static title = 'Navidrome';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

// Subsonic wants the response body as `subsonic-response`; a failed call still returns
// 200 with `status: "failed"` and an `error` object, so check that explicitly.
async function subsonic({ config, http }, endpoint) {
  const base = config.url.replace(/\/+$/, '');
  const salt = Math.random().toString(36).slice(2, 12);
  const token = createHash('md5').update(config.password + salt).digest('hex');
  const qs = new URLSearchParams({
    u: config.username,
    t: token,
    s: salt,
    v: '1.16.1',
    c: 'selfdash',
    f: 'json',
  });
  const data = await http.fetchJson(`${base}/rest/${endpoint}?${qs}`);
  const resp = data['subsonic-response'] || {};
  if (resp.status === 'failed') {
    throw new Error(resp.error?.message || `Subsonic ${endpoint} failed`);
  }
  return resp;
}

async function fetchNowPlaying(ctx) {
  const resp = await subsonic(ctx, 'getNowPlaying');
  const entries = resp.nowPlaying?.entry;
  const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
  return {
    type: 'nowplaying',
    items: list.map((e) => ({
      title: e.title || 'Unknown track',
      subtitle: [e.artist, e.username].filter(Boolean).join(' · ') || undefined,
    })),
  };
}

async function fetchStats(ctx) {
  const resp = await subsonic(ctx, 'getScanStatus');
  const scan = resp.scanStatus || {};
  const items = [
    { label: 'Songs', value: Number(scan.count) || 0 },
  ];
  if (scan.folderCount != null) items.push({ label: 'Folders', value: Number(scan.folderCount) || 0 });
  items.push({ label: 'Scanning', value: scan.scanning ? 'yes' : 'no' });
  return { type: 'stats', items };
}
