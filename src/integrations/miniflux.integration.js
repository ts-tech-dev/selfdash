import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Miniflux: API-token auth via the `X-Auth-Token` header. `/v1/feeds/counters` is the
// cheap unread-count call (a `{reads, unreads}` map keyed by feed id).

const VIEWS = {
  stats: { label: 'Reader stats', run: fetchStats },
};

export default class MinifluxIntegration extends BaseIntegration {
  static key = 'miniflux';
  static title = 'Miniflux';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Token', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');

async function api({ config, http }, path) {
  return http.fetchJson(`${baseOf(config)}${path}`, {
    headers: { 'X-Auth-Token': config.apiKey, Accept: 'application/json' },
  });
}

async function fetchStats(ctx) {
  const [counters, feeds, starred] = await Promise.all([
    api(ctx, '/v1/feeds/counters'),
    api(ctx, '/v1/feeds').catch(() => []),
    api(ctx, '/v1/entries?starred=true&limit=1').catch(() => ({ total: 0 })),
  ]);
  const unreads = counters && typeof counters.unreads === 'object' ? counters.unreads : {};
  const totalUnread = Object.values(unreads).reduce((sum, n) => sum + (Number(n) || 0), 0);
  return {
    type: 'stats',
    items: [
      { label: 'Unread', value: totalUnread },
      { label: 'Feeds', value: Array.isArray(feeds) ? feeds.length : 0 },
      { label: 'Starred', value: Number(starred?.total) || 0 },
    ],
  };
}
