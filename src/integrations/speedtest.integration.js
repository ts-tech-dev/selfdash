import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Speedtest Tracker (alexjustesen/speedtest-tracker). Its public API docs are thin —
// GET /api/v1/results/latest for the most recent run, GET /api/v1/results for the
// history (used to compute a 24h average). A Sanctum API token is optional; many
// installs leave the API open on the LAN. Falls back to the latest reading when the
// history call doesn't return a usable list.

const VIEWS = {
  stats: { label: 'Speed stats', run: fetchStats },
};

export default class SpeedtestIntegration extends BaseIntegration {
  static key = 'speedtest';
  static title = 'Speedtest Tracker';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API token', type: 'password', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => (config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {});
const unwrap = (data) => (Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);

async function fetchLatest({ config, http }) {
  const data = await http.fetchJson(`${baseOf(config)}/api/v1/results/latest`, {
    headers: { Accept: 'application/json', ...authHeaders(config) },
  });
  return data?.data || data || {};
}

async function fetchRecent({ config, http }) {
  const data = await http
    .fetchJson(`${baseOf(config)}/api/v1/results`, { headers: { Accept: 'application/json', ...authHeaders(config) } })
    .catch(() => null);
  const cutoff = Date.now() - 24 * 3600 * 1000;
  return unwrap(data).filter((r) => {
    const t = new Date(r.created_at || r.updated_at || 0).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
}

function avg(list, key) {
  const nums = list.map((r) => Number(r[key])).filter((n) => Number.isFinite(n));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
}

async function fetchStats(ctx) {
  const [latest, recent] = await Promise.all([fetchLatest(ctx), fetchRecent(ctx)]);
  const latestDown = Number(latest.download) || 0;
  const latestUp = Number(latest.upload) || 0;
  const avgDown = avg(recent, 'download') ?? latestDown;
  const avgUp = avg(recent, 'upload') ?? latestUp;

  return {
    type: 'stats',
    items: [
      { label: 'Download', value: `${latestDown.toFixed(1)} Mbps` },
      { label: 'Upload', value: `${latestUp.toFixed(1)} Mbps` },
      { label: 'Ping', value: `${Math.round(Number(latest.ping) || 0)} ms` },
      { label: 'Avg DL (24h)', value: `${avgDown.toFixed(1)} Mbps` },
      { label: 'Avg UL (24h)', value: `${avgUp.toFixed(1)} Mbps` },
    ],
  };
}
