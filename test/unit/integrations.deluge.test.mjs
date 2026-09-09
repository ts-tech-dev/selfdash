import test from 'node:test';
import assert from 'node:assert/strict';
import DelugeIntegration from '../../src/integrations/deluge.integration.js';

// deluge.integration.js keeps a module-level session-cookie cache keyed by url, so each
// test uses its own url to stay independent.
//
// startDisconnected simulates a real, verified-live gotcha: a fresh (or just-restarted)
// Deluge web UI process is disconnected from its daemon until something calls
// web.connect — web.update_ui doesn't error in that state, it just returns
// `{connected: false, torrents: null}`.
function makeHttp({ torrents = {}, failFirstUpdate = false, startDisconnected = false } = {}) {
  const calls = [];
  let updateCalls = 0;
  let connected = !startDisconnected;
  return {
    calls,
    fetch: async (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push({ url, opts, method: body.method });
      const setCookie = ['_session_id=abc123; Path=/'];
      const ok = (result) => ({ ok: true, headers: { getSetCookie: () => [] }, json: async () => ({ result }) });

      if (body.method === 'auth.login') {
        return { ok: true, headers: { getSetCookie: () => setCookie }, json: async () => ({ result: true }) };
      }
      if (body.method === 'web.get_hosts') return ok([['host-1', '127.0.0.1', 58846, 'localclient']]);
      if (body.method === 'web.connect') {
        connected = true;
        return ok([]);
      }
      if (body.method === 'web.update_ui') {
        updateCalls++;
        if (failFirstUpdate && updateCalls === 1) {
          return { ok: true, headers: { getSetCookie: () => [] }, json: async () => ({ error: { message: 'Not authenticated' } }) };
        }
        return ok(connected ? { connected: true, torrents } : { connected: false, torrents: null });
      }
      throw new Error(`unexpected method ${body.method}`);
    },
  };
}

const cfg = (url) => ({ url, password: 'deluge' });

test('deluge: logs in once and reuses the session cookie across both views', async () => {
  const http = makeHttp({ torrents: {} });
  await new DelugeIntegration().fetchData({ config: cfg('http://deluge-a.local'), http });
  const logins = http.calls.filter((c) => c.method === 'auth.login');
  assert.equal(logins.length, 1, 'queue + stats share one login');
});

test('deluge queue: converts 0-100 progress to 0-1', async () => {
  const http = makeHttp({
    torrents: {
      hash1: { name: 'a.mkv', state: 'Downloading', progress: 42, download_payload_rate: 100, upload_payload_rate: 0 },
    },
  });
  const { byView } = await new DelugeIntegration().fetchData({ config: cfg('http://deluge-b.local'), http });
  assert.deepEqual(byView.queue.items, [{ title: 'a.mkv', status: 'Downloading', progress: 0.42 }]);
});

test('deluge stats: counts downloading/seeding and sums rates', async () => {
  const http = makeHttp({
    torrents: {
      h1: { name: 'a', state: 'Downloading', progress: 10, download_payload_rate: 1000, upload_payload_rate: 0 },
      h2: { name: 'b', state: 'Seeding', progress: 100, download_payload_rate: 0, upload_payload_rate: 500 },
    },
  });
  const { byView } = await new DelugeIntegration().fetchData({ config: cfg('http://deluge-c.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Torrents', value: 2 },
      { label: 'Downloading', value: 1 },
      { label: 'Seeding', value: 1 },
      { label: 'DL Speed', value: '1000 B/s' },
      { label: 'UL Speed', value: '500 B/s' },
    ],
  });
});

test('deluge: an RPC error drops the cached cookie and retries the login once', async () => {
  const http = makeHttp({ torrents: { h1: { name: 'x', state: 'Seeding', progress: 100 } }, failFirstUpdate: true });
  const { byView } = await new DelugeIntegration().fetchData({ config: cfg('http://deluge-d.local'), http });
  assert.equal(byView.queue.items.length, 1);
  const logins = http.calls.filter((c) => c.method === 'auth.login');
  assert.equal(logins.length, 2, 're-authenticates once after the stale-cookie error');
});

test('deluge: a disconnected web UI (torrents: null) connects to the first host and retries, instead of reporting an empty queue forever', async () => {
  const http = makeHttp({ torrents: { h1: { name: 'x', state: 'Seeding', progress: 100 } }, startDisconnected: true });
  const { byView } = await new DelugeIntegration().fetchData({ config: cfg('http://deluge-e.local'), http });
  assert.equal(byView.queue.items.length, 1);
  const connects = http.calls.filter((c) => c.method === 'web.connect');
  assert.equal(connects.length, 1, 'connects exactly once even though queue + stats both hit the disconnected state concurrently');
});
