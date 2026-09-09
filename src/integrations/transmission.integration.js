import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';
import { fmtRate } from '../shared/format.js';

// Transmission RPC (default path /transmission/rpc). Any request without a valid
// X-Transmission-Session-Id gets a 409 carrying the current one in a response header —
// cache it per URL and retry once. Basic auth only when rpc-authentication-required is on.

const VIEWS = {
  queue: { label: 'Torrent queue', run: fetchQueue },
  stats: { label: 'Transfer stats', run: fetchStats },
};

// Transmission's numeric torrent status codes.
const STATUS_LABELS = {
  0: 'stopped',
  1: 'check pending',
  2: 'checking',
  3: 'download pending',
  4: 'downloading',
  5: 'seed pending',
  6: 'seeding',
};

export default class TransmissionIntegration extends BaseIntegration {
  static key = 'transmission';
  static title = 'Transmission';
  static mergeGroup = 'download';
  static defaultInterval = 30;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Username (if RPC auth is on)', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const sessionIdCache = new Map(); // rpcUrl -> X-Transmission-Session-Id

const rpcUrl = (config) => `${config.url.replace(/\/+$/, '')}/transmission/rpc`;

function authHeaders(config) {
  if (!config.username) return {};
  const basic = Buffer.from(`${config.username}:${config.password || ''}`).toString('base64');
  return { Authorization: `Basic ${basic}` };
}

async function rpcCall({ config, http }, method, args = {}) {
  const url = rpcUrl(config);
  const headers = { 'Content-Type': 'application/json', ...authHeaders(config) };
  const body = JSON.stringify({ method, arguments: args });

  const send = () => {
    const sid = sessionIdCache.get(url);
    return http.fetch(url, { method: 'POST', headers: sid ? { ...headers, 'X-Transmission-Session-Id': sid } : headers, body });
  };

  let res = await send();
  if (res.status === 409) {
    const sid = res.headers.get('x-transmission-session-id');
    if (!sid) throw new Error('Transmission RPC 409 without a session id header');
    sessionIdCache.set(url, sid);
    res = await send();
  }
  if (!res.ok) throw new Error(`Transmission RPC ${method} responded ${res.status}`);
  const data = await res.json();
  if (data.result !== 'success') throw new Error(`Transmission RPC ${method}: ${data.result}`);
  return data.arguments;
}

async function fetchTorrents(ctx) {
  const data = await rpcCall(ctx, 'torrent-get', {
    fields: ['name', 'status', 'percentDone', 'rateDownload', 'rateUpload'],
  });
  return data.torrents || [];
}

async function fetchQueue(ctx) {
  const torrents = await fetchTorrents(ctx);
  return {
    type: 'queue',
    items: torrents.map((t) => ({
      title: t.name,
      status: STATUS_LABELS[t.status] ?? String(t.status),
      progress: typeof t.percentDone === 'number' ? t.percentDone : undefined,
    })),
  };
}

async function fetchStats(ctx) {
  const torrents = await fetchTorrents(ctx);
  const dlRate = torrents.reduce((sum, t) => sum + (t.rateDownload || 0), 0);
  const upRate = torrents.reduce((sum, t) => sum + (t.rateUpload || 0), 0);
  return {
    type: 'stats',
    items: [
      { label: 'Torrents', value: torrents.length },
      { label: 'Downloading', value: torrents.filter((t) => t.status === 4).length },
      { label: 'Seeding', value: torrents.filter((t) => t.status === 6).length },
      { label: 'DL Speed', value: fmtRate(dlRate) },
      { label: 'UL Speed', value: fmtRate(upRate) },
    ],
  };
}
