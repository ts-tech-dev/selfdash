import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Pi-hole. Two incompatible APIs are in the wild:
//   v6 (Pi-hole 6.x, FTL's built-in webserver): POST /api/auth {password} -> a session
//       `sid`, then GET /api/stats/summary; the session is freed with DELETE /api/auth.
//   v5 (Pi-hole 5.x, lighttpd + PHP): GET /admin/api.php?summaryRaw&auth=<API token>.
// The single `password` field is the v6 web password, or — for a v5 box — the API token
// from Settings -> API. We try v6 first and fall back to v5.

const VIEWS = {
  stats: { label: 'Query stats', run: fetchStats },
};

export default class PiholeIntegration extends BaseIntegration {
  static key = 'pihole';
  static title = 'Pi-hole';
  static mergeGroup = 'dns';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'password', label: 'Web password (v6) / API token (v5)', type: 'password', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const pct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

async function fetchStats(ctx) {
  try {
    return await fetchV6(ctx);
  } catch (v6err) {
    try {
      return await fetchV5(ctx);
    } catch (v5err) {
      throw new Error(`Pi-hole v6: ${v6err.message} | v5: ${v5err.message}`);
    }
  }
}

async function fetchV6({ config, http }) {
  const base = baseOf(config);

  // A box with no password still needs this round-trip; it answers session.valid: true.
  const auth = await http.fetchJson(`${base}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: config.password || '' }),
  });
  const sid = auth?.session?.sid || null;
  if (auth?.session?.valid === false && !sid) throw new Error('authentication failed');

  try {
    const d = await http.fetchJson(`${base}/api/stats/summary`, { headers: sid ? { 'X-FTL-SID': sid } : {} });
    const q = d.queries || {};
    return {
      type: 'stats',
      items: [
        { label: 'Queries', value: q.total ?? 0 },
        { label: 'Blocked', value: q.blocked ?? 0 },
        { label: 'Blocked %', value: pct(q.percent_blocked) },
        { label: 'Domains', value: d.gravity?.domains_being_blocked ?? 0 },
        { label: 'Clients', value: d.clients?.active ?? d.clients?.total ?? 0 },
      ],
    };
  } finally {
    // Best-effort: free the session so we don't fill Pi-hole's (small) session table.
    if (sid) {
      try {
        await http.fetch(`${base}/api/auth`, { method: 'DELETE', headers: { 'X-FTL-SID': sid } });
      } catch {
        /* it will time out on its own */
      }
    }
  }
}

async function fetchV5({ config, http }) {
  const base = baseOf(config);
  const auth = config.password ? `&auth=${encodeURIComponent(config.password)}` : '';
  const d = await http.fetchJson(`${base}/admin/api.php?summaryRaw${auth}`);
  // The PHP endpoint returns [] (not an object) when the auth token is missing/wrong.
  if (Array.isArray(d) || d.dns_queries_today === undefined) {
    throw new Error('no data returned (bad API token?)');
  }
  return {
    type: 'stats',
    items: [
      { label: 'Queries', value: d.dns_queries_today ?? 0 },
      { label: 'Blocked', value: d.ads_blocked_today ?? 0 },
      { label: 'Blocked %', value: pct(d.ads_percentage_today) },
      { label: 'Domains', value: d.domains_being_blocked ?? 0 },
      { label: 'Clients', value: d.unique_clients ?? 0 },
    ],
  };
}
