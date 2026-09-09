import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Gatus: GET /api/v1/endpoints/statuses, no auth by default. Each endpoint carries a
// rolling window of recent check `results`; the last one's `success` is what the
// dashboard itself considers "currently up".

const VIEWS = {
  status: { label: 'Endpoint status', run: fetchStatus },
  stats: { label: 'Health summary', run: fetchStats },
};

export default class GatusIntegration extends BaseIntegration {
  static key = 'gatus';
  static title = 'Gatus';
  static mergeGroup = 'monitor';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [{ name: 'url', label: 'Server URL', type: 'url', required: true }],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchEndpoints({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const data = await http.fetchJson(`${base}/api/v1/endpoints/statuses`);
  return Array.isArray(data) ? data : [];
}

const lastResult = (e) => {
  const results = Array.isArray(e.results) ? e.results : [];
  return results.length ? results[results.length - 1] : null;
};

async function fetchStatus(ctx) {
  const endpoints = await fetchEndpoints(ctx);
  return {
    type: 'status',
    items: endpoints.map((e) => {
      const last = lastResult(e);
      const state = !last ? 'paused' : last.success ? 'up' : 'down';
      return { label: e.name, state, detail: e.group || undefined };
    }),
  };
}

async function fetchStats(ctx) {
  const endpoints = await fetchEndpoints(ctx);
  const healthy = endpoints.filter((e) => lastResult(e)?.success).length;
  return {
    type: 'stats',
    items: [
      { label: 'Healthy', value: healthy },
      { label: 'Down', value: endpoints.length - healthy },
      { label: 'Total', value: endpoints.length },
    ],
  };
}
