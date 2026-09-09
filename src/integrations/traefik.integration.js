import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Traefik's API (default :8080 with --api.insecure, or behind a router + a basic-auth
// middleware). /api/overview carries the router / service / middleware totals plus a
// per-kind warning/error count.

const VIEWS = {
  stats: { label: 'Router stats', run: fetchStats },
};

export default class TraefikIntegration extends BaseIntegration {
  static key = 'traefik';
  static title = 'Traefik';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'API URL', type: 'url', required: true },
      { name: 'username', label: 'Username (if basic-auth protected)', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');

function authHeaders(config) {
  if (!config.username) return {};
  const basic = Buffer.from(`${config.username}:${config.password || ''}`).toString('base64');
  return { Authorization: `Basic ${basic}` };
}

async function fetchStats({ config, http }) {
  const d = await http.fetchJson(`${baseOf(config)}/api/overview`, { headers: authHeaders(config) });
  const o = d.http || {};
  const tcp = d.tcp || {};
  const errors = (o.routers?.errors || 0) + (o.services?.errors || 0) + (o.middlewares?.errors || 0);

  return {
    type: 'stats',
    items: [
      { label: 'HTTP routers', value: o.routers?.total ?? 0 },
      { label: 'HTTP services', value: o.services?.total ?? 0 },
      { label: 'Middlewares', value: o.middlewares?.total ?? 0 },
      { label: 'TCP routers', value: tcp.routers?.total ?? 0 },
      { label: 'Errors', value: errors },
    ],
  };
}
