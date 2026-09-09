import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Tdarr has no per-resource REST API — everything goes through one generic CRUD
// endpoint (`/api/v2/cruddb`) over its internal LokiJS collections. No auth by default.
// Field names below come from the shipped Statistics/Node/File collections; any that
// have moved between Tdarr versions fall back to 0/empty rather than throwing.

const VIEWS = {
  stats: { label: 'Transcode stats', run: fetchStats },
  staged: { label: 'Staged / errored files', run: fetchStaged },
};

export default class TdarrIntegration extends BaseIntegration {
  static key = 'tdarr';
  static title = 'Tdarr';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [{ name: 'url', label: 'Server URL', type: 'url', required: true }],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const asList = (x) => (Array.isArray(x) ? x : Object.values(x || {}));

async function cruddb({ config, http }, data) {
  return http.fetchJson(`${baseOf(config)}/api/v2/cruddb`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
}

async function fetchStatistics(ctx) {
  const stats = await cruddb(ctx, { collection: 'StatisticsJSONDB', mode: 'getById', docID: 'statistics' });
  return stats || {};
}

async function fetchNodes(ctx) {
  const nodes = await cruddb(ctx, { collection: 'NodeJSONDB', mode: 'find' });
  return asList(nodes);
}

async function fetchFiles(ctx) {
  const files = await cruddb(ctx, { collection: 'FileJSONDB', mode: 'find' });
  return asList(files);
}

async function fetchStats(ctx) {
  const [stats, nodes] = await Promise.all([fetchStatistics(ctx), fetchNodes(ctx)]);
  const workers = nodes.flatMap((n) => asList(n.workers));
  const busy = workers.filter((w) => w.status === 'transcoding' || w.status === 'healthchecking').length;

  return {
    type: 'stats',
    items: [
      { label: 'Transcoded', value: Number(stats.totalTranscodeCount) || 0 },
      { label: 'Health checks', value: Number(stats.totalHealthCheckCount) || 0 },
      { label: 'Space saved', value: `${(Number(stats.sizeDiff) || 0).toFixed(1)} GB` },
      { label: 'Workers busy', value: `${busy}/${workers.length}` },
    ],
  };
}

async function fetchStaged(ctx) {
  const files = await fetchFiles(ctx);
  const rows = files.filter((f) => f.TranscodeDecisionMaker === 'queued' || f.TranscodeDecisionMaker === 'error');
  return {
    type: 'list',
    items: rows.map((f) => ({
      title: (f.file || f._id || 'file').split(/[/\\]/).pop(),
      subtitle: f.TranscodeDecisionMaker,
    })),
  };
}
