import test from 'node:test';
import assert from 'node:assert/strict';
import FreshRssIntegration from '../../src/integrations/freshrss.integration.js';

// freshrss.integration.js caches the ClientLogin token per (greaderBase, user) at module
// scope, so every test uses a distinct url.
function makeHttp({ authToken = 'AUTH-TOKEN-123', loginStatus = 200, jsonRoutes = [] } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, opts) => {
      calls.push({ kind: 'fetch', url, opts });
      if (url.includes('/accounts/ClientLogin')) {
        return {
          ok: loginStatus < 400,
          status: loginStatus,
          text: async () => (loginStatus < 400 ? `SID=x\nLSID=y\nAuth=${authToken}\n` : 'Error=BadAuthentication'),
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    fetchJson: async (url, opts) => {
      calls.push({ kind: 'json', url, opts });
      for (const [match, payload] of jsonRoutes) {
        if (url.includes(match)) return typeof payload === 'function' ? payload() : payload;
      }
      throw new Error(`unrouted json: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, username: 'me', apiPassword: 'apipw' });

test('freshrss stats: reads overall unread from the reading-list state + counts subscriptions', async () => {
  const http = makeHttp({
    jsonRoutes: [
      [
        'unread-count',
        {
          max: 1000,
          unreadcounts: [
            { id: 'user/-/state/com.google/reading-list', count: 57 },
            { id: 'feed/1', count: 40 },
            { id: 'feed/2', count: 17 },
          ],
        },
      ],
      ['subscription/list', { subscriptions: [{ id: 'feed/1' }, { id: 'feed/2' }, { id: 'feed/3' }] }],
    ],
  });
  const { byView } = await new FreshRssIntegration().fetchData({ config: cfg('http://fr-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Unread', value: 57 },
      { label: 'Subscriptions', value: 3 },
    ],
  });
});

test('freshrss stats: no reading-list row → falls back to summing feed/* counts', async () => {
  const http = makeHttp({
    jsonRoutes: [
      ['unread-count', { unreadcounts: [{ id: 'feed/1', count: 4 }, { id: 'feed/2', count: 6 }] }],
      ['subscription/list', { subscriptions: [] }],
    ],
  });
  const { byView } = await new FreshRssIntegration().fetchData({ config: cfg('http://fr-b.local'), http });
  assert.equal(byView.stats.items[0].value, 10);
});

test('freshrss: ClientLogin runs once, then every API call carries Authorization: GoogleLogin auth=<token>', async () => {
  const http = makeHttp({
    jsonRoutes: [
      ['unread-count', { unreadcounts: [] }],
      ['subscription/list', { subscriptions: [] }],
    ],
  });
  await new FreshRssIntegration().fetchData({ config: cfg('http://fr-c.local'), http });
  assert.equal(http.calls.filter((c) => c.url.includes('ClientLogin')).length, 1);
  const jsonCalls = http.calls.filter((c) => c.kind === 'json');
  assert.ok(jsonCalls.length >= 2);
  assert.ok(jsonCalls.every((c) => c.opts.headers.Authorization === 'GoogleLogin auth=AUTH-TOKEN-123'));
});

test('freshrss: a failed ClientLogin is a clear error', async () => {
  const http = makeHttp({ loginStatus: 401 });
  await assert.rejects(
    () => new FreshRssIntegration().fetchData({ config: cfg('http://fr-d.local'), http }),
    /ClientLogin responded 401/
  );
});
