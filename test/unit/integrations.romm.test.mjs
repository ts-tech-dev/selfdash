import test from 'node:test';
import assert from 'node:assert/strict';
import RommIntegration from '../../src/integrations/romm.integration.js';

function makeHttp(payload) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      if (url.includes('/api/stats')) return payload;
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (over = {}) => ({ url: 'http://romm.local', ...over });

test('romm stats: maps the /api/stats counts + human library size', async () => {
  const http = makeHttp({ PLATFORMS: 7, ROMS: 1543, SAVES: 22, STATES: 9, SCREENSHOTS: 4, TOTAL_FILESIZE_BYTES: 5 * 1024 ** 3 });
  const { byView } = await new RommIntegration().fetchData({ config: cfg(), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Platforms', value: 7 },
      { label: 'ROMs', value: 1543 },
      { label: 'Saves', value: 22 },
      { label: 'States', value: 9 },
      { label: 'Library size', value: '5.0 GB' },
    ],
  });
});

test('romm stats: missing fields default to 0 / 0 KB', async () => {
  const http = makeHttp({});
  const { byView } = await new RommIntegration().fetchData({ config: cfg(), http });
  assert.deepEqual(byView.stats.items.map((i) => i.value), [0, 0, 0, 0, '0 KB']);
});

test('romm: sends HTTP basic auth only when a username is configured', async () => {
  const withAuth = makeHttp({});
  await new RommIntegration().fetchData({ config: cfg({ username: 'admin', password: 'pw' }), http: withAuth });
  assert.equal(withAuth.calls[0].opts.headers.Authorization, `Basic ${Buffer.from('admin:pw').toString('base64')}`);

  const noAuth = makeHttp({});
  await new RommIntegration().fetchData({ config: cfg(), http: noAuth });
  assert.equal(noAuth.calls[0].opts.headers.Authorization, undefined);
});
