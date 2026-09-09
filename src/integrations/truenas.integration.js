import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// TrueNAS (CORE or SCALE): REST API v2.0 with an API key (bearer token, created under
// Settings -> API Keys). `/api/v2.0/pool` lists pools with a health flag;
// `/api/v2.0/alert/list` lists active alerts; `/api/v2.0/update/check_available` reports
// whether an update is pending. Self-signed by default, hence the insecure-TLS toggle.

const VIEWS = {
  stats: { label: 'Storage stats', run: fetchStats },
  pools: { label: 'Pool status', run: fetchPoolList },
};

export default class TrueNasIntegration extends BaseIntegration {
  static key = 'truenas';
  static title = 'TrueNAS';
  static defaultInterval = 120;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      { name: 'allowInsecureTLS', label: 'Allow self-signed / insecure TLS certificate', type: 'checkbox', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ Authorization: `Bearer ${config.apiKey}` });
const asArray = (x) => (Array.isArray(x) ? x : []);

async function get(ctx, path) {
  return ctx.http.fetchJson(`${baseOf(ctx.config)}${path}`, {
    headers: authHeaders(ctx.config),
    insecureTLS: ctx.config.allowInsecureTLS,
  });
}

async function fetchPools(ctx) {
  return asArray(await get(ctx, '/api/v2.0/pool'));
}

async function fetchStats(ctx) {
  const [pools, alerts, update] = await Promise.all([
    fetchPools(ctx),
    get(ctx, '/api/v2.0/alert/list').then(asArray).catch(() => []),
    get(ctx, '/api/v2.0/update/check_available').catch(() => ({})),
  ]);
  const healthy = pools.filter((p) => p.healthy || p.status === 'ONLINE').length;

  return {
    type: 'stats',
    items: [
      { label: 'Pools', value: pools.length },
      { label: 'Healthy', value: healthy },
      { label: 'Alerts', value: alerts.length },
      { label: 'Update', value: update?.status === 'AVAILABLE' ? 'available' : 'up to date' },
    ],
  };
}

async function fetchPoolList(ctx) {
  const pools = await fetchPools(ctx);
  return {
    type: 'list',
    items: pools.map((p) => ({
      title: p.name,
      subtitle: p.status || (p.healthy ? 'ONLINE' : 'unknown'),
    })),
  };
}
