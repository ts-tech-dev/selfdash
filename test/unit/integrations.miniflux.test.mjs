import test from 'node:test';
import assert from 'node:assert/strict';
import MinifluxIntegration from '../../src/integrations/miniflux.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        if (url.includes(match)) return typeof payload === 'function' ? payload() : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, apiKey: 'tok-1' });

test('miniflux stats: sums the per-feed unread counters, counts feeds and starred', async () => {
  const http = makeHttp([
    ['/v1/feeds/counters', { reads: { 1: 3 }, unreads: { 1: 4, 2: 10, 3: 0 } }],
    ['/v1/feeds', [{ id: 1 }, { id: 2 }, { id: 3 }]],
    ['/v1/entries?starred=true', { total: 7, entries: [] }],
  ]);
  const { byView } = await new MinifluxIntegration().fetchData({ config: cfg('http://mf-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Unread', value: 14 },
      { label: 'Feeds', value: 3 },
      { label: 'Starred', value: 7 },
    ],
  });
});

test('miniflux stats: feeds / starred failing independently degrades to 0, unread still reported', async () => {
  const http = makeHttp([
    ['/v1/feeds/counters', { unreads: { 9: 2 } }],
    // no /v1/feeds or /v1/entries routes -> those calls reject, .catch handles them
  ]);
  const { byView } = await new MinifluxIntegration().fetchData({ config: cfg('http://mf-b.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Unread', value: 2 },
    { label: 'Feeds', value: 0 },
    { label: 'Starred', value: 0 },
  ]);
});

test('miniflux: sends the X-Auth-Token header', async () => {
  const http = makeHttp([
    ['/v1/feeds/counters', { unreads: {} }],
    ['/v1/feeds', []],
    ['/v1/entries', { total: 0 }],
  ]);
  await new MinifluxIntegration().fetchData({ config: cfg('http://mf-c.local'), http });
  assert.ok(http.calls.every((c) => c.opts.headers['X-Auth-Token'] === 'tok-1'));
});
