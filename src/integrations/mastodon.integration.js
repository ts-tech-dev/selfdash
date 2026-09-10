import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Mastodon: public instance stats need no auth. `/api/v1/instance` carries the classic
// user / status / domain counts (deprecated in v4 but still served); `/api/v2/instance`
// is the fallback and only exposes monthly-active users + version.

const VIEWS = {
  stats: { label: 'Instance stats', run: fetchStats },
};

export default class MastodonIntegration extends BaseIntegration {
  static key = 'mastodon';
  static title = 'Mastodon';
  static defaultInterval = 900;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [{ name: 'url', label: 'Instance URL', type: 'url', required: true }],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');

  const v1 = await http.fetchJson(`${base}/api/v1/instance`).catch(() => null);
  if (v1 && v1.stats) {
    return {
      type: 'stats',
      items: [
        { label: 'Users', value: Number(v1.stats.user_count) || 0 },
        { label: 'Statuses', value: Number(v1.stats.status_count) || 0 },
        { label: 'Connections', value: Number(v1.stats.domain_count) || 0 },
        { label: 'Version', value: v1.version || '—' },
      ],
    };
  }

  const v2 = await http.fetchJson(`${base}/api/v2/instance`);
  return {
    type: 'stats',
    items: [
      { label: 'Active (month)', value: Number(v2.usage?.users?.active_month) || 0 },
      { label: 'Version', value: v2.version || '—' },
    ],
  };
}
