import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Prometheus: `/api/v1/targets` (scrape target health) and `/api/v1/alerts` (active
// alerts). Optional HTTP basic auth for a proxied / secured server.

const VIEWS = {
  stats: { label: 'Target & alert stats', run: fetchStats },
  down: { label: 'Down targets', run: fetchDownTargets },
};

export default class PrometheusIntegration extends BaseIntegration {
  static key = 'prometheus';
  static title = 'Prometheus';
  static defaultInterval = 60;
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

const baseOf = (config) => config.url.replace(/\/+$/, '');

function headers(config) {
  const h = { Accept: 'application/json' };
  if (config.username) {
    h.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password || ''}`).toString('base64')}`;
  }
  return h;
}

async function promGet({ config, http }, path) {
  const data = await http.fetchJson(`${baseOf(config)}${path}`, { headers: headers(config) });
  if (data.status && data.status !== 'success') {
    throw new Error(data.error || `Prometheus ${path} returned ${data.status}`);
  }
  return data.data || {};
}

const activeTargets = (d) => (Array.isArray(d.activeTargets) ? d.activeTargets : []);

async function fetchStats(ctx) {
  const [targets, alerts] = await Promise.all([
    promGet(ctx, '/api/v1/targets'),
    promGet(ctx, '/api/v1/alerts').catch(() => ({ alerts: [] })),
  ]);
  const active = activeTargets(targets);
  const up = active.filter((t) => t.health === 'up').length;
  const firing = (Array.isArray(alerts.alerts) ? alerts.alerts : []).filter((a) => a.state === 'firing').length;
  return {
    type: 'stats',
    items: [
      { label: 'Targets up', value: up },
      { label: 'Targets down', value: active.length - up },
      { label: 'Alerts firing', value: firing },
    ],
  };
}

async function fetchDownTargets(ctx) {
  const targets = await promGet(ctx, '/api/v1/targets');
  const down = activeTargets(targets).filter((t) => t.health !== 'up');
  if (down.length === 0) return { type: 'list', items: [{ title: 'All targets up' }] };
  return {
    type: 'list',
    items: down.map((t) => ({
      title: t.labels?.job || t.scrapePool || t.scrapeUrl || 'target',
      subtitle: t.lastError || t.labels?.instance || t.scrapeUrl || undefined,
    })),
  };
}
