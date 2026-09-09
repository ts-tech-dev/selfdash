import test from 'node:test';
import assert from 'node:assert/strict';
import HealthchecksIntegration from '../../src/integrations/healthchecks.integration.js';

function makeHttp(checks) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      return { checks };
    },
  };
}

const cfg = (url) => ({ url, apiKey: 'key123' });

test('healthchecks status: maps up/grace/down/paused/new to the shared state enum', async () => {
  const http = makeHttp([
    { name: 'a', status: 'up' },
    { name: 'b', status: 'grace' },
    { name: 'c', status: 'down' },
    { name: 'd', status: 'paused' },
    { name: 'e', status: 'new' },
  ]);
  const { byView } = await new HealthchecksIntegration().fetchData({ config: cfg('http://hc-a.local'), http });
  assert.deepEqual(byView.status.items, [
    { label: 'a', state: 'up' },
    { label: 'b', state: 'warn' },
    { label: 'c', state: 'down' },
    { label: 'd', state: 'paused' },
    { label: 'e', state: 'paused' },
  ]);
});

test('healthchecks stats: counts by status', async () => {
  const http = makeHttp([
    { name: 'a', status: 'up' },
    { name: 'b', status: 'up' },
    { name: 'c', status: 'grace' },
    { name: 'd', status: 'down' },
  ]);
  const { byView } = await new HealthchecksIntegration().fetchData({ config: cfg('http://hc-b.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Up', value: 2 },
      { label: 'Late', value: 1 },
      { label: 'Down', value: 1 },
      { label: 'Paused', value: 0 },
    ],
  });
});

test('healthchecks: sends X-Api-Key header', async () => {
  const http = makeHttp([]);
  await new HealthchecksIntegration().fetchData({ config: cfg('http://hc-c.local'), http });
  assert.ok(http.calls.every((c) => c.opts.headers['X-Api-Key'] === 'key123'));
});
