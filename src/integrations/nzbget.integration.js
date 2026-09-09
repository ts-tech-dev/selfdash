import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';
import { fmtRate } from '../shared/format.js';

// NZBGet's JSON-RPC endpoint (`/jsonrpc`), HTTP basic auth (its control username/password,
// required by default). Near-copy of sabnzbd.integration.js's queue/stats split.

const VIEWS = {
  queue: { label: 'Download queue', run: fetchQueue },
  stats: { label: 'Queue stats', run: fetchStats },
};

export default class NzbgetIntegration extends BaseIntegration {
  static key = 'nzbget';
  static title = 'NZBGet';
  static mergeGroup = 'download';
  static defaultInterval = 30;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Control username', type: 'text', required: true },
      { name: 'password', label: 'Control password', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');

async function rpc({ config, http }, method, params = []) {
  const basic = Buffer.from(`${config.username}:${config.password || ''}`).toString('base64');
  const data = await http.fetchJson(`${baseOf(config)}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
    body: JSON.stringify({ method, params, id: 1 }),
  });
  if (data.error) throw new Error(data.error.message || `NZBGet ${method} failed`);
  return data.result;
}

async function fetchGroups(ctx) {
  const groups = await rpc(ctx, 'listgroups');
  return Array.isArray(groups) ? groups : [];
}

async function fetchQueue(ctx) {
  const groups = await fetchGroups(ctx);
  return {
    type: 'queue',
    items: groups.map((g) => ({
      title: g.NZBName || g.NZBNicename || `#${g.NZBID}`,
      status: g.Status,
      progress: g.FileSizeMB > 0 ? Math.max(0, Math.min(1, 1 - (g.RemainingSizeMB || 0) / g.FileSizeMB)) : undefined,
    })),
  };
}

async function fetchStats(ctx) {
  const [status, groups] = await Promise.all([rpc(ctx, 'status'), fetchGroups(ctx)]);
  return {
    type: 'stats',
    items: [
      { label: 'Queue items', value: groups.length },
      { label: 'Remaining MB', value: Math.round(status.RemainingSizeMB || 0) },
      { label: 'Speed', value: fmtRate((status.DownloadRate || 0)) },
      { label: 'Paused', value: status.DownloadPaused ? 'Yes' : 'No' },
    ],
  };
}
