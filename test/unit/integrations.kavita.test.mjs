import test from 'node:test';
import assert from 'node:assert/strict';
import KavitaIntegration from '../../src/integrations/kavita.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        if (url.includes(match)) {
          if (typeof payload === 'function') return payload();
          if (payload instanceof Error) throw payload;
          return payload;
        }
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

// module-level token cache in the integration -> unique url per test
const cfg = (url) => ({ url, apiKey: 'KEY-1' });

test('kavita: authenticates once for the JWT, then bearer-auths the stats calls', async () => {
  const http = makeHttp([
    ['/api/Plugin/authenticate', { token: 'jwt-abc' }],
    ['/api/Stats/server/stats', { seriesCount: 12, volumeCount: 80, chapterCount: 300 }],
    ['/api/Stats/user/read', { totalWordsRead: 1_250_000, totalPagesRead: 5400 }],
  ]);
  const { byView } = await new KavitaIntegration().fetchData({ config: cfg('http://kv-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Series', value: 12 },
      { label: 'Volumes', value: 80 },
      { label: 'Chapters', value: 300 },
      { label: 'Words read', value: 1_250_000 },
      { label: 'Pages read', value: 5400 },
    ],
  });
  assert.equal(http.calls.filter((c) => c.url.includes('/authenticate')).length, 1);
  const statsCall = http.calls.find((c) => c.url.includes('/api/Stats/server/stats'));
  assert.equal(statsCall.opts.headers.Authorization, 'Bearer jwt-abc');
});

test('kavita: a non-admin key (server/stats 403) still yields words-read from user/read', async () => {
  const http = makeHttp([
    ['/api/Plugin/authenticate', { token: 'jwt-x' }],
    ['/api/Stats/server/stats', new Error('http://kv-b.local/api/Stats/server/stats responded 403 Forbidden')],
    ['/api/Stats/user/read', { totalWordsRead: 42 }],
  ]);
  const { byView } = await new KavitaIntegration().fetchData({ config: cfg('http://kv-b.local'), http });
  assert.deepEqual(byView.stats.items, [{ label: 'Words read', value: 42 }]);
});

test('kavita: a token-less authenticate response is a hard error', async () => {
  const http = makeHttp([['/api/Plugin/authenticate', {}]]);
  await assert.rejects(
    () => new KavitaIntegration().fetchData({ config: cfg('http://kv-c.local'), http }),
    /no token/
  );
});
