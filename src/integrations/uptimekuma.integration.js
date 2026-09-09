import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Uptime Kuma's public status-page JSON — the same data the public page itself renders
// from, no socket.io and no auth needed. `/api/status-page/{slug}` lists monitors
// (grouped); `/api/status-page/heartbeat/{slug}` carries each monitor's heartbeat
// history (status: 0=down, 1=up, 2=pending, 3=maintenance) plus a rolling uptime ratio
// keyed `<monitorId>_<hours>` (we use the 24h one).

const VIEWS = {
  status: { label: 'Monitor status', run: fetchStatus },
  stats: { label: 'Uptime stats', run: fetchStats },
};

export default class UptimeKumaIntegration extends BaseIntegration {
  static key = 'uptimekuma';
  static title = 'Uptime Kuma';
  static mergeGroup = 'monitor';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'slug', label: 'Status page slug', type: 'text', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const STATUS_STATE = { 0: 'down', 1: 'up', 2: 'warn', 3: 'warn' };

async function fetchMonitorsAndHeartbeats({ config, http }) {
  const base = baseOf(config);
  const [page, hb] = await Promise.all([
    http.fetchJson(`${base}/api/status-page/${config.slug}`),
    http.fetchJson(`${base}/api/status-page/heartbeat/${config.slug}`),
  ]);
  const monitors = (page.publicGroupList || []).flatMap((g) => g.monitorList || []);
  return { monitors, heartbeatList: hb.heartbeatList || {}, uptimeList: hb.uptimeList || {} };
}

function latestBeat(heartbeatList, id) {
  const beats = heartbeatList[id];
  return Array.isArray(beats) && beats.length ? beats[beats.length - 1] : null;
}

async function fetchStatus(ctx) {
  const { monitors, heartbeatList, uptimeList } = await fetchMonitorsAndHeartbeats(ctx);
  return {
    type: 'status',
    items: monitors.map((m) => {
      const last = latestBeat(heartbeatList, m.id);
      const state = last ? STATUS_STATE[last.status] || 'warn' : 'paused';
      const uptime = uptimeList[`${m.id}_24`];
      return {
        label: m.name,
        state,
        detail: typeof uptime === 'number' ? `${(uptime * 100).toFixed(1)}% (24h)` : undefined,
      };
    }),
  };
}

async function fetchStats(ctx) {
  const { monitors, heartbeatList, uptimeList } = await fetchMonitorsAndHeartbeats(ctx);
  const statuses = monitors.map((m) => latestBeat(heartbeatList, m.id)?.status);
  const up = statuses.filter((s) => s === 1).length;
  const down = statuses.filter((s) => s === 0).length;
  const uptimes = monitors.map((m) => uptimeList[`${m.id}_24`]).filter((n) => typeof n === 'number');
  const avgUptime = uptimes.length ? uptimes.reduce((a, b) => a + b, 0) / uptimes.length : 0;

  return {
    type: 'stats',
    items: [
      { label: 'Up', value: up },
      { label: 'Down', value: down },
      { label: 'Total', value: monitors.length },
      { label: 'Uptime (24h)', value: `${(avgUptime * 100).toFixed(1)}%` },
    ],
  };
}
