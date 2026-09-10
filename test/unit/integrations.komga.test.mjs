import test from 'node:test';
import assert from 'node:assert/strict';
import KomgaIntegration from '../../src/integrations/komga.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        if (typeof match === 'function' ? match(url) : url.includes(match)) {
          return typeof payload === 'function' ? payload() : payload;
        }
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, username: 'demo', password: 'pw' });

test('komga stats: reads totalElements from each page and computes read %', async () => {
  const http = makeHttp([
    [(u) => u.includes('/api/v1/series?') || u.includes('/api/v1/series&'), { totalElements: 40 }],
    [(u) => u.includes('/api/v1/books?size=1'), { totalElements: 500 }],
    [(u) => u.includes('read_status=READ'), { totalElements: 125 }],
  ]);
  const { byView } = await new KomgaIntegration().fetchData({ config: cfg('http://k-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Series', value: 40 },
      { label: 'Books', value: 500 },
      { label: 'Read', value: '25%' },
    ],
  });
});

test('komga stats: no books → 0% rather than NaN', async () => {
  const http = makeHttp([[() => true, { totalElements: 0 }]]);
  const { byView } = await new KomgaIntegration().fetchData({ config: cfg('http://k-b.local'), http });
  assert.equal(byView.stats.items[2].value, '0%');
});

test('komga: sends HTTP basic auth', async () => {
  const http = makeHttp([[() => true, { totalElements: 0 }]]);
  await new KomgaIntegration().fetchData({ config: cfg('http://k-c.local'), http });
  const expected = `Basic ${Buffer.from('demo:pw').toString('base64')}`;
  assert.ok(http.calls.every((c) => c.opts.headers.Authorization === expected));
});

test('komga: appends size=1 with the right separator whether or not the path already has a query', async () => {
  const http = makeHttp([[() => true, { totalElements: 1 }]]);
  await new KomgaIntegration().fetchData({ config: cfg('http://k-d.local'), http });
  const readCall = http.calls.find((c) => c.url.includes('read_status=READ'));
  assert.ok(readCall.url.includes('read_status=READ&size=1'));
  const seriesCall = http.calls.find((c) => c.url.includes('/api/v1/series'));
  assert.ok(seriesCall.url.includes('/api/v1/series?size=1'));
});
