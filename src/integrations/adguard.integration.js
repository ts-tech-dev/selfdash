import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// AdGuard Home. Every /control/* endpoint takes HTTP basic auth (the same credentials as
// the web UI). /control/stats has the counters + top-domain lists; /control/status has
// the protection flag.

const VIEWS = {
  stats: { label: 'Query stats', run: fetchStats },
  blocked: { label: 'Top blocked', run: fetchTopBlocked },
};

export default class AdguardIntegration extends BaseIntegration {
  static key = 'adguard';
  static title = 'AdGuard Home';
  static mergeGroup = 'dns';
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
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

function authHeaders(config) {
  if (!config.username) return {};
  const basic = Buffer.from(`${config.username}:${config.password || ''}`).toString('base64');
  return { Authorization: `Basic ${basic}` };
}

async function fetchStats({ config, http }) {
  const base = baseOf(config);
  const headers = authHeaders(config);
  const [stats, status] = await Promise.all([
    http.fetchJson(`${base}/control/stats`, { headers }),
    http.fetchJson(`${base}/control/status`, { headers }).catch(() => ({})),
  ]);

  const total = Number(stats.num_dns_queries) || 0;
  const blocked = Number(stats.num_blocked_filtering) || 0;
  return {
    type: 'stats',
    items: [
      { label: 'Queries', value: total },
      { label: 'Blocked', value: blocked },
      { label: 'Blocked %', value: pct(total ? (blocked / total) * 100 : 0) },
      // avg_processing_time is in seconds.
      { label: 'Avg latency', value: `${Math.round((Number(stats.avg_processing_time) || 0) * 1000)} ms` },
      { label: 'Protection', value: status.protection_enabled === false ? 'off' : 'on' },
    ],
  };
}

async function fetchTopBlocked({ config, http }) {
  const stats = await http.fetchJson(`${baseOf(config)}/control/stats`, { headers: authHeaders(config) });
  // top_blocked_domains: [ { "ads.example.com": 42 }, ... ]
  const rows = Array.isArray(stats.top_blocked_domains) ? stats.top_blocked_domains : [];
  return {
    type: 'list',
    items: rows.map((entry) => {
      const [domain, count] = Object.entries(entry)[0] || ['?', 0];
      return { title: domain, subtitle: `${count} hits` };
    }),
  };
}
