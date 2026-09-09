import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Speedtest Tracker (alexjustesen/speedtest-tracker). Verified live: the only read
// endpoint is `GET /api/speedtest/latest` — no `/api/v1` prefix, and no list/history
// endpoint at all (`route:list` shows only `speedtest/latest`, `healthcheck`, `user`),
// so a rolling average isn't available through the API. The endpoint is public by
// default (no auth required); an API token is optional and sent when configured.
// Response is `{ message, data: {...} }`; `data.download`/`data.upload` are already
// converted to Mbps server-side — the raw Ookla CLI output they're computed from
// (`download.bandwidth`) is bytes/sec, but the API resource does the conversion.

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

const authHeaders = (config) => (config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {});

async function fetchLatest({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const res = await http.fetchJson(`${base}/api/speedtest/latest`, {
    headers: { Accept: 'application/json', ...authHeaders(config) },
  });
  return res?.data || {};
}

async function fetchStats(ctx) {
  const latest = await fetchLatest(ctx);
  return {
    type: 'stats',
    items: [
      { label: 'Download', value: `${(Number(latest.download) || 0).toFixed(1)} Mbps` },
      { label: 'Upload', value: `${(Number(latest.upload) || 0).toFixed(1)} Mbps` },
      { label: 'Ping', value: `${Math.round(Number(latest.ping) || 0)} ms` },
      { label: 'Server', value: latest.server_name || '-' },
    ],
  };
}
