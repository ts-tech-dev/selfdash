import test from 'node:test';
import assert from 'node:assert/strict';
import UptimeKumaIntegration from '../../src/integrations/uptimekuma.integration.js';

function makeHttp(routes) {
  return {
    fetchJson: async (url) => {
      for (const [match, payload] of routes) {
        const hit = typeof match === 'function' ? match(url) : url.includes(match);
        if (hit) return payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, slug: 'main' });

const page = (monitors) => ({ publicGroupList: [{ id: 1, name: 'Group', monitorList: monitors }] });

test('uptimekuma status: maps heartbeat status codes and carries the 24h uptime as detail', () => {
  const http = makeHttp([
    ['/api/status-page/main', page([{ id: 1, name: 'API' }, { id: 2, name: 'DB' }])],
    [
      '/api/status-page/heartbeat/main',
      {
        heartbeatList: { 1: [{ status: 1 }], 2: [{ status: 0 }] },
        uptimeList: { '1_24': 0.9998, '2_24': 0.5 },
      },
    ],
  ]);
  return new UptimeKumaIntegration().fetchData({ config: cfg('http://kuma-a.local'), http }).then(({ byView }) => {
    assert.deepEqual(byView.status.items, [
      { label: 'API', state: 'up', detail: '100.0% (24h)' },
      { label: 'DB', state: 'down', detail: '50.0% (24h)' },
    ]);
  });
});

test('uptimekuma status: a monitor with no heartbeat yet is "paused"', async () => {
  const http = makeHttp([
    ['/api/status-page/main', page([{ id: 3, name: 'New' }])],
    ['/api/status-page/heartbeat/main', { heartbeatList: {}, uptimeList: {} }],
  ]);
  const { byView } = await new UptimeKumaIntegration().fetchData({ config: cfg('http://kuma-b.local'), http });
  assert.deepEqual(byView.status.items, [{ label: 'New', state: 'paused', detail: undefined }]);
});

test('uptimekuma stats: counts up/down and averages the 24h uptime across monitors', async () => {
  const http = makeHttp([
    ['/api/status-page/main', page([{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }])],
    [
      '/api/status-page/heartbeat/main',
      {
        heartbeatList: { 1: [{ status: 1 }], 2: [{ status: 1 }], 3: [{ status: 0 }] },
        uptimeList: { '1_24': 1, '2_24': 0.9, '3_24': 0.2 },
      },
    ],
  ]);
  const { byView } = await new UptimeKumaIntegration().fetchData({ config: cfg('http://kuma-c.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Up', value: 2 },
      { label: 'Down', value: 1 },
      { label: 'Total', value: 3 },
      { label: 'Uptime (24h)', value: '70.0%' },
    ],
  });
});
