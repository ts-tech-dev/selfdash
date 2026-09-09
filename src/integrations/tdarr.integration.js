import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Tdarr has no per-resource REST API — everything goes through one generic CRUD
// endpoint (`/api/v2/cruddb`) over its internal LokiJS collections, plus a couple of
// dedicated GET endpoints. No auth by default. Verified live against a fresh
// haveagitgat/tdarr container (server 2.86.01): `cruddb` only accepts the modes
// getById/getByIndex/getAll/insert/update/removeOne/removeAll/getCount — "find" 400s.
// StatisticsJSONDB's table0Count/table2Count are the server's own Queued/Transcode-error
// counts (they back the "Transcode Queue"/"Transcode: Error" tabs in the web UI) — using
// them instead of counting FileJSONDB rows keeps the "Queued"/"Errored" stats consistent
// with what Tdarr itself considers "current" regardless of poll timing. Live worker
// occupancy isn't in NodeJSONDB (its cruddb docs carry config, not runtime state) — it's
// on GET /api/v2/get-nodes, keyed by node id, each with `workers` (an object keyed by
// worker id, present only while that worker is running) and `workerLimits` (its configured
// slot counts). TranscodeDecisionMaker values are exactly "Queued" / "Transcode error" /
// "Transcode success" / "Not required" (Title Case, confirmed from the shipped web UI
// bundle) — not the lowercase guesses an earlier draft of this integration used.

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

async function fetchNodes({ config, http }) {
  const nodes = await http.fetchJson(`${baseOf(config)}/api/v2/get-nodes`);
  return asList(nodes);
}

async function fetchFiles(ctx) {
  const files = await cruddb(ctx, { collection: 'FileJSONDB', mode: 'getAll' });
  return asList(files);
}

async function fetchStats(ctx) {
  const [stats, nodes] = await Promise.all([fetchStatistics(ctx), fetchNodes(ctx)]);
  let busy = 0;
  let capacity = 0;
  for (const n of nodes) {
    busy += Object.keys(n.workers || {}).length;
    const wl = n.workerLimits || {};
    capacity += (Number(wl.transcodecpu) || 0) + (Number(wl.transcodegpu) || 0) + (Number(wl.healthcheckcpu) || 0) + (Number(wl.healthcheckgpu) || 0);
  }

  return {
    type: 'stats',
    items: [
      { label: 'Queued', value: Number(stats.table0Count) || 0 },
      { label: 'Transcoded', value: Number(stats.totalTranscodeCount) || 0 },
      { label: 'Errored', value: Number(stats.table2Count) || 0 },
      { label: 'Space saved', value: `${(Number(stats.sizeDiff) || 0).toFixed(1)} GB` },
      { label: 'Workers busy', value: `${busy}/${capacity}` },
    ],
  };
}

async function fetchStaged(ctx) {
  const files = await fetchFiles(ctx);
  const rows = files.filter((f) => f.TranscodeDecisionMaker === 'Queued' || f.TranscodeDecisionMaker === 'Transcode error');
  return {
    type: 'list',
    items: rows.map((f) => ({
      title: (f.file || f._id || 'file').split(/[/\\]/).pop(),
      subtitle: f.TranscodeDecisionMaker,
    })),
  };
}
