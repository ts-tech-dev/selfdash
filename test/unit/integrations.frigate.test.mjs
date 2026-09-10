import test from 'node:test';
import assert from 'node:assert/strict';
import FrigateIntegration from '../../src/integrations/frigate.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url) => {
      calls.push(url);
      for (const [match, payload] of routes) {
        if (url.includes(match)) {
          if (payload instanceof Error) throw payload;
          return typeof payload === 'function' ? payload() : payload;
        }
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url });
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

test('frigate stats: camera count, today-only event sum, recordings storage %, version', async () => {
  const http = makeHttp([
    ['/api/stats', {
      cameras: { front: {}, back: {}, garage: {} },
      service: { version: '0.14.1', storage: { '/media/frigate/recordings': { used: 250, total: 1000 }, '/tmp/cache': { used: 1, total: 2 } } },
    }],
    ['/api/events/summary', [
      { day: today, camera: 'front', label: 'person', count: 4 },
      { day: today, camera: 'back', label: 'car', count: 2 },
      { day: '2000-01-01', camera: 'front', label: 'person', count: 99 },
    ]],
  ]);
  const { byView } = await new FrigateIntegration().fetchData({ config: cfg('http://fg-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Cameras', value: 3 },
      { label: 'Events today', value: 6 },
      { label: 'Storage', value: '25%' },
      { label: 'Version', value: '0.14.1' },
    ],
  });
});

test('frigate stats: tolerates a failed events/summary and a missing recordings mount', async () => {
  const http = makeHttp([
    ['/api/stats', { cameras: { only: {} }, service: { storage: {} } }],
    ['/api/events/summary', new Error('boom')],
  ]);
  const { byView } = await new FrigateIntegration().fetchData({ config: cfg('http://fg-b.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Cameras', value: 1 },
    { label: 'Events today', value: 0 },
  ]);
});

test('frigate events: maps "label · camera" + local start time, or a placeholder when empty', async () => {
  const http = makeHttp([
    ['/api/stats', { cameras: {}, service: { storage: {} } }],
    ['/api/events/summary', []],
    ['/api/events?limit=20', [
      { id: 'e1', camera: 'driveway', label: 'car', start_time: 1_725_000_000 },
      { id: 'e2', camera: 'porch', label: 'person', start_time: 1_725_100_000 },
    ]],
  ]);
  const { byView } = await new FrigateIntegration().fetchData({ config: cfg('http://fg-c.local'), http });
  assert.equal(byView.events.type, 'list');
  assert.equal(byView.events.items[0].title, 'car · driveway');
  assert.ok(byView.events.items[0].subtitle);

  const empty = makeHttp([
    ['/api/stats', { cameras: {}, service: { storage: {} } }],
    ['/api/events/summary', []],
    ['/api/events?limit=20', []],
  ]);
  const { byView: e2 } = await new FrigateIntegration().fetchData({ config: cfg('http://fg-d.local'), http: empty });
  assert.deepEqual(e2.events.items, [{ title: 'No recent events' }]);
});
