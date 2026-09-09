import test from 'node:test';
import assert from 'node:assert/strict';
import SpeedtestIntegration from '../../src/integrations/speedtest.integration.js';

function makeHttp({ latest, recent, recentFails = false }) {
  return {
    fetchJson: async (url) => {
      if (url.includes('/results/latest')) return { data: latest };
      if (url.includes('/results')) {
        if (recentFails) throw new Error('no history endpoint');
        return { data: recent };
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url });
const inHours = (h) => new Date(Date.now() - h * 3600_000).toISOString();

test('speedtest stats: reports the latest reading and the 24h average from recent history', async () => {
  const http = makeHttp({
    latest: { download: 450.2, upload: 40.1, ping: 8, created_at: inHours(0) },
    recent: [
      { download: 450.2, upload: 40.1, ping: 8, created_at: inHours(0) },
      { download: 400, upload: 38, ping: 9, created_at: inHours(5) },
      { download: 300, upload: 30, ping: 12, created_at: inHours(48) }, // outside the 24h window
    ],
  });
  const { byView } = await new SpeedtestIntegration().fetchData({ config: cfg('http://speed-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Download', value: '450.2 Mbps' },
      { label: 'Upload', value: '40.1 Mbps' },
      { label: 'Ping', value: '8 ms' },
      { label: 'Avg DL (24h)', value: '425.1 Mbps' },
      { label: 'Avg UL (24h)', value: '39.0 Mbps' },
    ],
  });
});

test('speedtest stats: falls back to the latest reading when the history call fails', async () => {
  const http = makeHttp({ latest: { download: 200, upload: 20, ping: 15 }, recentFails: true });
  const { byView } = await new SpeedtestIntegration().fetchData({ config: cfg('http://speed-b.local'), http });
  assert.deepEqual(byView.stats.items.slice(3), [
    { label: 'Avg DL (24h)', value: '200.0 Mbps' },
    { label: 'Avg UL (24h)', value: '20.0 Mbps' },
  ]);
});
