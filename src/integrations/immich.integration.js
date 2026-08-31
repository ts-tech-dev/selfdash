import { BaseIntegration } from './_base.js';
import { viewField, resolveViews, runViews } from './_views.js';

// Immich: /api with an `x-api-key` header (create the key in Account Settings -> API Keys).
// The statistics/storage paths were renamed between versions — /api/server/* on recent
// builds, /api/server-info/* on older ones — so each fetch tries both.

const VIEWS = {
  stats: { label: 'Library stats', run: fetchStats },
  storage: { label: 'Storage', run: fetchStorage },
};

export default class ImmichIntegration extends BaseIntegration {
  static key = 'immich';
  static title = 'Immich';
  static defaultInterval = 300;
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

async function getEither(http, base, headers, paths) {
  let lastErr;
  for (const p of paths) {
    try {
      return await http.fetchJson(`${base}${p}`, { headers });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function gb(bytes) {
  return `${((Number(bytes) || 0) / 1e9).toFixed(1)} GB`;
}

async function fetchStats({ config, http }) {
  const headers = { 'x-api-key': config.apiKey };
  const d = await getEither(http, baseOf(config), headers, [
    '/api/server/statistics',
    '/api/server-info/statistics',
  ]);
  return {
    type: 'stats',
    items: [
      { label: 'Photos', value: d.photos ?? 0 },
      { label: 'Videos', value: d.videos ?? 0 },
      { label: 'Usage', value: gb(d.usage) },
      { label: 'Users', value: Array.isArray(d.usageByUser) ? d.usageByUser.length : d.usageByUser ?? '-' },
    ],
  };
}

async function fetchStorage({ config, http }) {
  const headers = { 'x-api-key': config.apiKey };
  const d = await getEither(http, baseOf(config), headers, ['/api/server/storage', '/api/server-info/storage']);
  return {
    type: 'stats',
    items: [
      // Immich returns human strings (diskUse) plus raw byte counts (diskUseRaw).
      { label: 'Disk used', value: d.diskUse ?? gb(d.diskUseRaw) },
      { label: 'Disk free', value: d.diskAvailable ?? gb(d.diskAvailableRaw) },
      { label: 'Disk total', value: d.diskSize ?? gb(d.diskSizeRaw) },
      { label: 'Usage', value: d.diskUsagePercentage != null ? `${Number(d.diskUsagePercentage).toFixed(1)}%` : '-' },
    ],
  };
}
