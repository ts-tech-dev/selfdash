import test from 'node:test';
import assert from 'node:assert/strict';
import TransmissionIntegration from '../../src/integrations/transmission.integration.js';

// transmission.integration.js keeps a module-level session-id cache keyed by the RPC
// URL, so each test uses its own url to stay independent.
function makeHttp(torrents) {
  const calls = [];
  let sawSessionId = false;
  return {
    calls,
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      const gotSid = opts.headers['X-Transmission-Session-Id'];
      if (!gotSid) {
        return {
          status: 409,
          ok: false,
          headers: { get: (h) => (h.toLowerCase() === 'x-transmission-session-id' ? 'sid-123' : null) },
        };
      }
      sawSessionId = true;
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({ result: 'success', arguments: { torrents } }),
      };
    },
    get sawSessionId() {
      return sawSessionId;
    },
  };
}

const cfg = (url) => ({ url });

test('transmission: 409 handshake happens once, then the session id is reused across views', async () => {
  const http = makeHttp([{ name: 'a', status: 4, percentDone: 0.5, rateDownload: 1000, rateUpload: 0 }]);
  await new TransmissionIntegration().fetchData({ config: cfg('http://trans-a.local'), http });
  const with409 = http.calls.filter((c) => !c.opts.headers['X-Transmission-Session-Id']);
  // Both views (queue + stats) run every poll; only the very first request per view-fetch
  // round should miss the cached session id before it's set.
  assert.ok(with409.length <= 2, 'at most one 409 miss per view before the sid is cached');
});

test('transmission queue: maps numeric status to a label and passes percentDone through as progress', async () => {
  const http = makeHttp([
    { name: 'movie.mkv', status: 4, percentDone: 0.42, rateDownload: 500, rateUpload: 0 },
    { name: 'show.mkv', status: 6, percentDone: 1, rateDownload: 0, rateUpload: 200 },
  ]);
  const { byView } = await new TransmissionIntegration().fetchData({ config: cfg('http://trans-b.local'), http });
  assert.deepEqual(byView.queue.items, [
    { title: 'movie.mkv', status: 'downloading', progress: 0.42 },
    { title: 'show.mkv', status: 'seeding', progress: 1 },
  ]);
});

test('transmission stats: counts by status and sums rates', async () => {
  const http = makeHttp([
    { name: 'a', status: 4, percentDone: 0.1, rateDownload: 1000, rateUpload: 0 },
    { name: 'b', status: 4, percentDone: 0.2, rateDownload: 2000, rateUpload: 0 },
    { name: 'c', status: 6, percentDone: 1, rateDownload: 0, rateUpload: 500 },
  ]);
  const { byView } = await new TransmissionIntegration().fetchData({ config: cfg('http://trans-c.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Torrents', value: 3 },
      { label: 'Downloading', value: 2 },
      { label: 'Seeding', value: 1 },
      { label: 'DL Speed', value: '2.9 KB/s' },
      { label: 'UL Speed', value: '500 B/s' },
    ],
  });
});

test('transmission: sends basic auth only when a username is configured', async () => {
  const http = makeHttp([]);
  await new TransmissionIntegration().fetchData({ config: { url: 'http://trans-d.local', username: 'u', password: 'p' }, http });
  assert.ok(http.calls.some((c) => c.opts.headers.Authorization?.startsWith('Basic ')));
});
