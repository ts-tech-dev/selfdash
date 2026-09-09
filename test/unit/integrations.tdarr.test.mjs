import test from 'node:test';
import assert from 'node:assert/strict';
import TdarrIntegration from '../../src/integrations/tdarr.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ url, opts, collection: body.data.collection });
      if (!(body.data.collection in routes)) throw new Error(`unrouted collection: ${body.data.collection}`);
      const payload = routes[body.data.collection];
      return typeof payload === 'function' ? payload() : payload;
    },
  };
}

const cfg = (url) => ({ url });

test('tdarr stats: maps statistics + counts busy workers across nodes', async () => {
  const http = makeHttp({
    StatisticsJSONDB: { totalTranscodeCount: 120, totalHealthCheckCount: 45, sizeDiff: 12.345 },
    NodeJSONDB: {
      node1: { workers: { w1: { status: 'transcoding' }, w2: { status: 'idle' } } },
      node2: { workers: { w3: { status: 'healthchecking' } } },
    },
    FileJSONDB: [],
  });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Transcoded', value: 120 },
      { label: 'Health checks', value: 45 },
      { label: 'Space saved', value: '12.3 GB' },
      { label: 'Workers busy', value: '2/3' },
    ],
  });
});

test('tdarr: missing/renamed statistics fields fall back to 0 instead of throwing', async () => {
  const http = makeHttp({ StatisticsJSONDB: {}, NodeJSONDB: {}, FileJSONDB: [] });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-b.local'), http });
  assert.deepEqual(byView.stats.items[0], { label: 'Transcoded', value: 0 });
  assert.deepEqual(byView.stats.items[3], { label: 'Workers busy', value: '0/0' });
});

test('tdarr staged: keeps only queued/error files and strips the path down to a filename', async () => {
  const http = makeHttp({
    StatisticsJSONDB: {},
    NodeJSONDB: {},
    FileJSONDB: [
      { file: '/media/movies/a.mkv', TranscodeDecisionMaker: 'queued' },
      { file: '/media/movies/b.mkv', TranscodeDecisionMaker: 'transcode success' },
      { file: '/media/movies/c.mkv', TranscodeDecisionMaker: 'error' },
    ],
  });
  const { byView } = await new TdarrIntegration().fetchData({ config: cfg('http://tdarr-c.local'), http });
  assert.deepEqual(byView.staged.items, [
    { title: 'a.mkv', subtitle: 'queued' },
    { title: 'c.mkv', subtitle: 'error' },
  ]);
});
