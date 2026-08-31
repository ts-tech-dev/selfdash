import { BaseIntegration } from './_base.js';
import { viewField, resolveViews, runViews } from './_views.js';

// Prowlarr is the *arr indexer manager — v1 API, X-Api-Key header, same shape family as
// Radarr/Sonarr but its useful widget data is indexer counts/queries rather than a queue.

const VIEWS = {
  stats: { label: 'Indexer stats', run: fetchStats },
  indexers: { label: 'Indexers', run: fetchIndexers },
  health: { label: 'Health', run: fetchHealth },
};

export default class ProwlarrIntegration extends BaseIntegration {
  static key = 'prowlarr';
  static title = 'Prowlarr';
  static defaultInterval = 120;
  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      viewField(VIEWS, { defaultKey: 'stats' }),
    ],
  };

  async fetchData(ctx) {
    return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'stats'));
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ 'X-Api-Key': config.apiKey });

async function fetchStats({ config, http }) {
  const base = baseOf(config);
  const [indexers, stats] = await Promise.all([
    http.fetchJson(`${base}/api/v1/indexer`, { headers: authHeaders(config) }),
    http.fetchJson(`${base}/api/v1/indexerstats`, { headers: authHeaders(config) }),
  ]);
  const rows = stats?.indexers || [];
  const sum = (key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);

  return {
    type: 'stats',
    items: [
      { label: 'Indexers', value: Array.isArray(indexers) ? indexers.length : 0 },
      { label: 'Enabled', value: Array.isArray(indexers) ? indexers.filter((i) => i.enable !== false).length : 0 },
      { label: 'Queries', value: sum('numberOfQueries') },
      { label: 'Grabs', value: sum('numberOfGrabs') },
    ],
  };
}

async function fetchIndexers({ config, http }) {
  const base = baseOf(config);
  const indexers = await http.fetchJson(`${base}/api/v1/indexer`, { headers: authHeaders(config) });
  return {
    type: 'list',
    items: (Array.isArray(indexers) ? indexers : []).map((i) => ({
      title: i.name || `#${i.id}`,
      subtitle: i.enable === false ? 'disabled' : i.protocol || 'enabled',
    })),
  };
}

async function fetchHealth({ config, http }) {
  const base = baseOf(config);
  const health = await http.fetchJson(`${base}/api/v1/health`, { headers: authHeaders(config) });
  const rows = Array.isArray(health) ? health : [];
  return {
    type: 'list',
    items: rows.length
      ? rows.map((h) => ({ title: h.message || h.source || 'issue', subtitle: h.type }))
      : [{ title: 'No health issues' }],
  };
}
