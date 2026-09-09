import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Grafana: a service-account (or legacy API) token as a bearer token. /api/search lists
// dashboards, /api/datasources lists data sources, and the built-in Alertmanager's
// v2 API (/api/alertmanager/grafana/api/v2/alerts) carries alert state — status.state
// is "active" while firing.

const VIEWS = {
  stats: { label: 'Server stats', run: fetchStats },
  alerts: { label: 'Firing alerts', run: fetchAlerts },
};

export default class GrafanaIntegration extends BaseIntegration {
  static key = 'grafana';
  static title = 'Grafana';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'Service account token', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ Authorization: `Bearer ${config.apiKey}` });
const asArray = (x) => (Array.isArray(x) ? x : []);

async function fetchFiringAlerts({ config, http }) {
  const alerts = await http
    .fetchJson(`${baseOf(config)}/api/alertmanager/grafana/api/v2/alerts`, { headers: authHeaders(config) })
    .catch(() => []);
  return asArray(alerts).filter((a) => a.status?.state === 'active');
}

async function fetchStats(ctx) {
  const { config, http } = ctx;
  const base = baseOf(config);
  const headers = authHeaders(config);
  const [dashboards, datasources, firing] = await Promise.all([
    http.fetchJson(`${base}/api/search?type=dash-db`, { headers }),
    http.fetchJson(`${base}/api/datasources`, { headers }),
    fetchFiringAlerts(ctx),
  ]);
  return {
    type: 'stats',
    items: [
      { label: 'Dashboards', value: asArray(dashboards).length },
      { label: 'Data sources', value: asArray(datasources).length },
      { label: 'Alerts firing', value: firing.length },
    ],
  };
}

async function fetchAlerts(ctx) {
  const firing = await fetchFiringAlerts(ctx);
  return {
    type: 'list',
    items: firing.length
      ? firing.map((a) => ({
          title: a.labels?.alertname || 'Alert',
          subtitle: a.annotations?.summary || a.labels?.severity || undefined,
        }))
      : [{ title: 'No firing alerts' }],
  };
}
