import test from 'node:test';
import assert from 'node:assert/strict';
import TdarrIntegration from '../../src/integrations/tdarr.integration.js';

// Route shapes verified live against a fresh haveagitgat/tdarr container: cruddb only
// accepts mode getAll (not "find"); live worker state comes from GET /api/v2/get-nodes,
// not the NodeJSONDB cruddb collection; TranscodeDecisionMaker is Title Case ("Queued",
// "Transcode error"), not lowercase.
function makeHttp({ statistics = {}, files = [], nodes = {} } = {}) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith('/api/v2/get-nodes')) return nodes;
      const body = JSON.parse(opts.body);
      if (body.data.collection === 'StatisticsJSONDB') return statistics;
      if (body.data.collection === 'FileJSONDB') {
        assert.equal(body.data.mode, 'getAll', 'FileJSONDB is read with mode getAll, not "find"');
        return files;
      }
      throw new Error(`unrouted: ${url} ${JSON.stringify(body.data)}`);
    },
  };
}

const cfg = (url) => ({ url });

test('tdarr stats: maps table0Count/table2Count as Queued/Errored and sums worker occupancy from get-nodes', async () => {
  const http = makeHttp({
    statistics: { totalTranscodeCount: 120, sizeDiff: 12.345, table0Count: 4, table2Count: 2 },
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
      { label: 'Space saved', value: '12.3 GB' },
      { label: 'Workers busy', value: '2/4' },
    ],
  });
});

test('tdarr: missing/renamed statistics fields fall back to 0 instead of throwing', async () => {
  const http = makeHttp({ statistics: {}, nodes: {}, files: [] });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-b.local'), http });
  assert.deepEqual(byView.stats.items[0], { label: 'Queued', value: 0 });
  assert.deepEqual(byView.stats.items[4], { label: 'Workers busy', value: '0/0' });
});

test('tdarr staged: keeps only Queued/Transcode-error files and strips the path down to a filename', async () => {
  const http = makeHttp({
    files: [
      { file: '/media/movies/a.mkv', TranscodeDecisionMaker: 'Queued' },
      { file: '/media/movies/b.mkv', TranscodeDecisionMaker: 'Transcode success' },
      { file: '/media/movies/c.mkv', TranscodeDecisionMaker: 'Transcode error' },
      { file: '/media/movies/d.mkv', TranscodeDecisionMaker: 'Not required' },
    ],
  });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-c.local'), http });
  assert.deepEqual(byView.staged.items, [
    { title: 'a.mkv', subtitle: 'Queued' },
    { title: 'c.mkv', subtitle: 'Transcode error' },
  ]);
});
