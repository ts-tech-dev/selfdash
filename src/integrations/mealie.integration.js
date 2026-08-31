import { BaseIntegration } from './_base.js';
import { viewField, resolveViews, runViews } from './_views.js';

// Mealie: /api with a Bearer API token (User Settings -> API Tokens).
// The stats path moved in Mealie v2: /api/households/statistics (v2) vs
// /api/app/about/statistics (v1) — try the new one first, fall back to the old.

const VIEWS = {
  stats: { label: 'Statistics', run: fetchStats },
};

export default class MealieIntegration extends BaseIntegration {
  static key = 'mealie';
  static title = 'Mealie';
  static defaultInterval = 300;
  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'token', label: 'API Token', type: 'password', required: true },
      viewField(VIEWS, { defaultKey: 'stats' }),
    ],
  };

  async fetchData(ctx) {
    return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'stats'));
  }
}

async function fetchStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${config.token}` };
  const paths = ['/api/households/statistics', '/api/app/about/statistics'];
  let d;
  let lastErr;
  for (const p of paths) {
    try {
      d = await http.fetchJson(`${base}${p}`, { headers });
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (d === undefined) throw lastErr;
  return {
    type: 'stats',
    items: [
      { label: 'Recipes', value: d.totalRecipes ?? 0 },
      { label: 'Users', value: d.totalUsers ?? 0 },
      { label: 'Categories', value: d.totalCategories ?? 0 },
      { label: 'Tags', value: d.totalTags ?? 0 },
    ],
  };
}
