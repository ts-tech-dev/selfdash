import test from 'node:test';
import assert from 'node:assert/strict';
import GatusIntegration from '../../src/integrations/gatus.integration.js';

function makeHttp(endpoints) {
  return { fetchJson: async () => endpoints };
}

const cfg = (url) => ({ url });

test('gatus status: last result decides up/down, a group with no results yet is "paused"', async () => {
  const http = makeHttp([
    { name: 'API', group: 'core', results: [{ success: false }, { success: true }] },
    { name: 'CDN', group: 'core', results: [{ success: false }] },
    { name: 'New', group: 'core', results: [] },
  ]);
  const { byView } = await new GatusIntegration().fetchData({ config: cfg('http://gatus-a.local'), http });
  assert.deepEqual(byView.status.items, [
    { label: 'API', state: 'up', detail: 'core' },
    { label: 'CDN', state: 'down', detail: 'core' },
    { label: 'New', state: 'paused', detail: 'core' },
  ]);
});

test('gatus stats: counts healthy vs down from the last result', async () => {
  const http = makeHttp([
    { name: 'A', results: [{ success: true }] },
    { name: 'B', results: [{ success: true }] },
    { name: 'C', results: [{ success: false }] },
  ]);
  const { byView } = await new GatusIntegration().fetchData({ config: cfg('http://gatus-b.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Healthy', value: 2 },
      { label: 'Down', value: 1 },
      { label: 'Total', value: 3 },
    ],
  });
});
