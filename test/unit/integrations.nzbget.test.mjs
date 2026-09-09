import test from 'node:test';
import assert from 'node:assert/strict';
import NzbgetIntegration from '../../src/integrations/nzbget.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ url, opts, method: body.method });
      if (!(body.method in routes)) throw new Error(`unrouted method: ${body.method}`);
      const payload = routes[body.method];
      return { result: typeof payload === 'function' ? payload() : payload };
    },
  };
}

const cfg = (url) => ({ url, username: 'nzbget', password: 'tegbzn6789' });

test('nzbget queue: computes progress from RemainingSizeMB/FileSizeMB', async () => {
  const http = makeHttp({
    listgroups: [
      { NZBID: 1, NZBName: 'movie.name', Status: 'DOWNLOADING', FileSizeMB: 1000, RemainingSizeMB: 250 },
      { NZBID: 2, NZBName: 'show.name', Status: 'PAUSED', FileSizeMB: 0, RemainingSizeMB: 0 },
    ],
    status: { RemainingSizeMB: 250, DownloadRate: 0, DownloadPaused: false },
  });
  const { byView } = await new NzbgetIntegration().fetchData({ config: cfg('http://nzbget-a.local'), http });
  assert.deepEqual(byView.queue.items, [
    { title: 'movie.name', status: 'DOWNLOADING', progress: 0.75 },
    { title: 'show.name', status: 'PAUSED', progress: undefined },
  ]);
});

test('nzbget stats: maps status fields and counts the queue', async () => {
  const http = makeHttp({
    listgroups: [{ NZBID: 1, NZBName: 'a', Status: 'DOWNLOADING', FileSizeMB: 100, RemainingSizeMB: 50 }],
    status: { RemainingSizeMB: 50, DownloadRate: 2048, DownloadPaused: true },
  });
  const { byView } = await new NzbgetIntegration().fetchData({ config: cfg('http://nzbget-b.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Queue items', value: 1 },
      { label: 'Remaining MB', value: 50 },
      { label: 'Speed', value: '2.0 KB/s' },
      { label: 'Paused', value: 'Yes' },
    ],
  });
});

test('nzbget: sends HTTP basic auth built from username/password', async () => {
  const http = makeHttp({ listgroups: [], status: { RemainingSizeMB: 0, DownloadRate: 0, DownloadPaused: false } });
  await new NzbgetIntegration().fetchData({ config: cfg('http://nzbget-c.local'), http });
  const expected = `Basic ${Buffer.from('nzbget:tegbzn6789').toString('base64')}`;
  assert.ok(http.calls.every((c) => c.opts.headers.Authorization === expected));
});
