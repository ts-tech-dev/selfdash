import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Tdarr has no per-resource REST API — everything goes through one generic CRUD
// endpoint (`/api/v2/cruddb`) over its internal collections, plus a handful of
// dedicated endpoints the web UI itself uses. No auth by default. Verified live against
// haveagitgat/tdarr (2.86.01, re-checked on 2.94.02): `cruddb` only accepts the modes
// getById/getByIndex/getAll/insert/update/removeOne/removeAll/getCount — "find" 400s.
// StatisticsJSONDB's tableNCount fields are the server's own counts behind the web UI's
// status tabs (mapping confirmed from the shipped UI bundle and seeded test files):
//   table0 Hold · table1 Transcode Queue · table2 Transcode: Success/Not Required ·
//   table3 Transcode: Error/Cancelled · table4 Health Check Queue ·
//   table5 Health Check: Healthy · table6 Health Check: Error/Cancelled
// (an earlier version read table0/table2 as Queued/Errored — off by one, see issue #4).
// Live worker occupancy isn't in NodeJSONDB (its cruddb docs carry config, not runtime
// state) — it's on GET /api/v2/get-nodes, keyed by node id, each with `workers` (an object
// keyed by worker id, present only while that worker is running) and `workerLimits` (its
// configured slot counts). The staged/errored list reads rows through
// POST /api/v2/client/status-tables — the paged, server-filtered endpoint behind those
// same tabs — rather than `cruddb getAll` on FileJSONDB, which ships the entire library
// (tens of MB on a real one) on every poll just to keep a handful of rows.

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

const LIST_CAP = 25;

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

// One page of a status tab, in the UI's own default sort. `totalCount` is unused —
// the stats view already gets the same numbers from StatisticsJSONDB.
async function fetchTable({ config, http }, table) {
  const res = await http.fetchJson(`${baseOf(config)}/api/v2/client/status-tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { start: 0, pageSize: LIST_CAP, filters: [], sorts: [], opts: { table } } }),
  });
  return asList(res?.array);
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
      { label: 'Queued', value: Number(stats.table1Count) || 0 },
      { label: 'Transcoded', value: Number(stats.totalTranscodeCount) || 0 },
      { label: 'Errored', value: Number(stats.table3Count) || 0 },
      { label: 'Health errors', value: Number(stats.table6Count) || 0 },
      { label: 'Space saved', value: `${(Number(stats.sizeDiff) || 0).toFixed(1)} GB` },
      { label: 'Workers busy', value: `${busy}/${capacity}` },
    ],
  };
}

async function fetchStaged(ctx) {
  const [queued, errored] = await Promise.all([fetchTable(ctx, 'table1'), fetchTable(ctx, 'table3')]);
  return {
    type: 'list',
    items: [...queued, ...errored].map((f) => ({
      title: (f.file || f._id || 'file').split(/[/\\]/).pop(),
      subtitle: f.TranscodeDecisionMaker,
    })),
  };
}
