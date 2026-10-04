import test from 'node:test';
import assert from 'node:assert/strict';
import TdarrIntegration from '../../src/integrations/tdarr.integration.js';

// Route shapes verified live against haveagitgat/tdarr (2.86.01, 2.94.02): stats come from
// StatisticsJSONDB via cruddb, live worker state from GET /api/v2/get-nodes (not the
// NodeJSONDB cruddb collection), and list rows from the paged POST /api/v2/client/status-tables
// endpoint per status tab — table1 = Transcode Queue, table3 = Transcode: Error/Cancelled.
// FileJSONDB must never be pulled wholesale (issue #4: ~56 MB per poll on a real library).
function makeHttp({ statistics = {}, tables = {}, nodes = {} } = {}) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith('/api/v2/get-nodes')) return nodes;
      const body = JSON.parse(opts.body);
      if (url.endsWith('/api/v2/client/status-tables')) {
        const rows = tables[body.data.opts.table] || [];
        return { array: rows.slice(body.data.start, body.data.start + body.data.pageSize), totalCount: rows.length };
      }
      if (body.data.collection === 'StatisticsJSONDB') return statistics;
      throw new Error(`unrouted: ${url} ${JSON.stringify(body.data)}`);
    },
  };
}

const cfg = (url) => ({ url });

test('tdarr stats: maps table1/table3/table6 counts as Queued/Errored/Health errors and sums worker occupancy', async () => {
  const http = makeHttp({
    // table0 (Hold) and table2 (Success/Not required) are deliberately large: issue #4 was
    // these being shown as Queued/Errored.
    statistics: { totalTranscodeCount: 120, sizeDiff: 12.345, table0Count: 99, table1Count: 4, table2Count: 6869, table3Count: 2, table6Count: 3 },
    nodes: {
      n1: { workers: { w1: {}, w2: {} }, workerLimits: { transcodecpu: 2, transcodegpu: 0, healthcheckcpu: 1, healthcheckgpu: 0 } },
      n2: { workers: {}, workerLimits: { transcodecpu: 1, transcodegpu: 0, healthcheckcpu: 0, healthcheckgpu: 0 } },
    },
  });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Queued', value: 4 },
      { label: 'Transcoded', value: 120 },
      { label: 'Errored', value: 2 },
      { label: 'Health errors', value: 3 },
      { label: 'Space saved', value: '12.3 GB' },
      { label: 'Workers busy', value: '2/4' },
    ],
  });
});

test('tdarr: missing/renamed statistics fields fall back to 0 instead of throwing', async () => {
  const http = makeHttp({ statistics: {}, nodes: {} });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-b.local'), http });
  assert.deepEqual(byView.stats.items[0], { label: 'Queued', value: 0 });
  assert.deepEqual(byView.stats.items[5], { label: 'Workers busy', value: '0/0' });
});

test('tdarr staged: lists the Transcode Queue then Error/Cancelled tabs and strips the path down to a filename', async () => {
  const http = makeHttp({
    tables: {
      table1: [{ file: '/media/movies/a.mkv', TranscodeDecisionMaker: 'Queued' }],
      table2: [{ file: '/media/movies/b.mkv', TranscodeDecisionMaker: 'Transcode success' }],
      table3: [
        { file: '/media/movies/c.mkv', TranscodeDecisionMaker: 'Transcode error' },
        { file: 'D:\\media\\e.mkv', TranscodeDecisionMaker: 'Transcode cancelled' },
      ],
    },
  });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-c.local'), http });
  assert.deepEqual(byView.staged.items, [
    { title: 'a.mkv', subtitle: 'Queued' },
    { title: 'c.mkv', subtitle: 'Transcode error' },
    { title: 'e.mkv', subtitle: 'Transcode cancelled' },
  ]);
});

test('tdarr staged: requests one capped page per tab and never pulls FileJSONDB wholesale', async () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ file: `/m/${i}.mkv`, TranscodeDecisionMaker: 'Queued' }));
  const http = makeHttp({ tables: { table1: many } });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-d.local/'), http });
  assert.equal(byView.staged.items.length, 25);

  const bodies = http.calls.filter((c) => c.opts?.body).map((c) => ({ url: c.url, data: JSON.parse(c.opts.body).data }));
  assert.ok(!bodies.some((b) => b.data.collection === 'FileJSONDB'), 'FileJSONDB is not fetched');
  const tableCalls = bodies.filter((b) => b.url === 'http://tdarr-d.local/api/v2/client/status-tables');
  assert.deepEqual(tableCalls.map((b) => b.data.opts.table).sort(), ['table1', 'table3']);
  for (const b of tableCalls) assert.equal(b.data.pageSize, 25);
});
