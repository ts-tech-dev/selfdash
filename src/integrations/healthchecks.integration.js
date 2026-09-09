import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Healthchecks (self-hosted or hosted healthchecks.io): GET /api/v3/checks/ with
// X-Api-Key. Each check's `status` is one of new/up/grace/down/paused.

const VIEWS = {
  status: { label: 'Check status', run: fetchStatus },
  stats: { label: 'Check summary', run: fetchStats },
};

const STATE = { up: 'up', down: 'down', grace: 'warn', paused: 'paused', new: 'paused' };

export default class HealthchecksIntegration extends BaseIntegration {
  static key = 'healthchecks';
  static title = 'Healthchecks';
  static mergeGroup = 'monitor';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchChecks({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const data = await http.fetchJson(`${base}/api/v3/checks/`, { headers: { 'X-Api-Key': config.apiKey } });
  return Array.isArray(data.checks) ? data.checks : [];
}

async function fetchStatus(ctx) {
  const checks = await fetchChecks(ctx);
  return {
    type: 'status',
    items: checks.map((c) => ({ label: c.name || 'unnamed', state: STATE[c.status] || 'warn' })),
  };
}

async function fetchStats(ctx) {
  const checks = await fetchChecks(ctx);
  const count = (status) => checks.filter((c) => c.status === status).length;
  return {
    type: 'stats',
    items: [
      { label: 'Up', value: count('up') },
      { label: 'Late', value: count('grace') },
      { label: 'Down', value: count('down') },
      { label: 'Paused', value: count('paused') },
    ],
  };
}
