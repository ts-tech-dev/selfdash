import test from 'node:test';
import assert from 'node:assert/strict';
import TrueNasIntegration from '../../src/integrations/truenas.integration.js';

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

const cfg = (url) => ({ url, apiKey: 'key123' });

test('truenas stats: counts pools/healthy/alerts and reports update availability', async () => {
  const http = makeHttp([
    ['/api/v2.0/pool', [{ name: 'tank', healthy: true }, { name: 'backup', healthy: false, status: 'DEGRADED' }]],
    ['/api/v2.0/alert/list', [{ id: 1 }, { id: 2 }]],
    ['/api/v2.0/update/check_available', { status: 'AVAILABLE' }],
  ]);
  const { byView } = await new TrueNasIntegration().fetchData({ config: cfg('http://truenas-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Pools', value: 2 },
      { label: 'Healthy', value: 1 },
      { label: 'Alerts', value: 2 },
      { label: 'Update', value: 'available' },
    ],
  });
});

test('truenas pools list: title + status, falls back to ONLINE/unknown when status is absent', async () => {
  const http = makeHttp([
    ['/api/v2.0/pool', [{ name: 'tank', healthy: true }, { name: 'backup', healthy: false, status: 'DEGRADED' }]],
    ['/api/v2.0/alert/list', []],
    ['/api/v2.0/update/check_available', { status: 'UP_TO_DATE' }],
  ]);
  const { byView } = await new TrueNasIntegration().fetchData({ config: cfg('http://truenas-b.local'), http });
  assert.deepEqual(byView.pools.items, [
    { title: 'tank', subtitle: 'ONLINE' },
    { title: 'backup', subtitle: 'DEGRADED' },
  ]);
});

test('truenas: sends the API key as a bearer header', async () => {
  const http = makeHttp([
    ['/api/v2.0/pool', []],
    ['/api/v2.0/alert/list', []],
    ['/api/v2.0/update/check_available', {}],
  ]);
  await new TrueNasIntegration().fetchData({ config: cfg('http://truenas-c.local'), http });
  assert.ok(http.calls.every((c) => c.opts.headers.Authorization === 'Bearer key123'));
});
