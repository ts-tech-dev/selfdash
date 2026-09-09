import test from 'node:test';
import assert from 'node:assert/strict';
import SpeedtestIntegration from '../../src/integrations/speedtest.integration.js';

// Route verified live against ghcr.io/alexjustesen/speedtest-tracker: the real endpoint
// is GET /api/speedtest/latest (no /api/v1 prefix, no history/list endpoint at all —
// `php artisan route:list` shows only speedtest/latest, healthcheck, user), and it's
// public by default (no auth required).
function makeHttp(data) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith('/api/speedtest/latest')) return { message: 'ok', data };
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url });

test('speedtest stats: reports the latest reading (already Mbps in the API response)', async () => {
  const http = makeHttp({ download: 425.06, upload: 175.19, ping: 13.576, server_name: 'T-Mobile Fiber | Intrepid' });
  const { byView } = await new SpeedtestIntegration().fetchData({ config: cfg('http://speed-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Download', value: '425.1 Mbps' },
      { label: 'Upload', value: '175.2 Mbps' },
      { label: 'Ping', value: '14 ms' },
      { label: 'Server', value: 'T-Mobile Fiber | Intrepid' },
    ],
  });
});

test('speedtest stats: missing fields fall back to 0/"-" instead of throwing', async () => {
  const http = makeHttp({});
  const { byView } = await new SpeedtestIntegration().fetchData({ config: cfg('http://speed-b.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Download', value: '0.0 Mbps' },
    { label: 'Upload', value: '0.0 Mbps' },
    { label: 'Ping', value: '0 ms' },
    { label: 'Server', value: '-' },
  ]);
});

test('speedtest: sends the API token as a bearer header only when configured', async () => {
  const withKey = makeHttp({ download: 1, upload: 1, ping: 1 });
  await new SpeedtestIntegration().fetchData({ config: { url: 'http://speed-c.local', apiKey: 'tok' }, http: withKey });
  assert.equal(withKey.calls[0].opts.headers.Authorization, 'Bearer tok');

  const noKey = makeHttp({ download: 1, upload: 1, ping: 1 });
  await new SpeedtestIntegration().fetchData({ config: cfg('http://speed-d.local'), http: noKey });
  assert.equal(noKey.calls[0].opts.headers.Authorization, undefined);
});
