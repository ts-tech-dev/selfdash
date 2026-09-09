import test from 'node:test';
import assert from 'node:assert/strict';
import OverseerrIntegration from '../../src/integrations/overseerr.integration.js';
import JellyseerrIntegration from '../../src/integrations/jellyseerr.integration.js';

// Overseerr and Jellyseerr both wrap _seerrBase.js. These tests prove the shared base is
// wired to both and that the earlier Overseerr behaviour survived the extraction.
function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        const hit = typeof match === 'function' ? match(url) : match instanceof RegExp ? match.test(url) : url.includes(match);
        if (hit) return typeof payload === 'function' ? payload(url) : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const CONFIG = { url: 'http://seerr.local', apiKey: 'seerr-key' };
const recent = new Date(Date.now() - 2 * 3600_000).toISOString();

function routes() {
  return [
    ['/api/v1/request/count', { pending: 3, approved: 2, processing: 1, available: 40 }],
    ['/api/v1/issue/count', { open: 1, closed: 4, total: 5 }],
    [(u) => u.includes('/api/v1/media') && u.includes('take=1&'), { pageInfo: { results: 9 } }],
    [
      (u) => u.includes('/api/v1/media'),
      { results: [{ mediaType: 'tv', tmdbId: 77, mediaAddedAt: recent }] },
    ],
    [
      (u) => u.includes('/api/v1/request?'),
      {
        results: [
          { type: 'movie', status: 2, is4k: true, createdAt: recent, requestedBy: { displayName: 'Dana' }, media: { tmdbId: 55, status: 3 } },
        ],
      },
    ],
    [/\/api\/v1\/movie\/\d+/, { title: 'Blade Runner 2049', posterPath: '/br.jpg' }],
    [/\/api\/v1\/tv\/\d+/, { name: 'Andor', posterPath: '/andor.jpg' }],
    ['/api/v1/status', { version: '2.1.0', updateAvailable: true, commitsBehind: 6 }],
  ];
}

test('overseerr + jellyseerr expose the identical shared view catalog and config schema', () => {
  assert.deepEqual(OverseerrIntegration.views, JellyseerrIntegration.views);
  assert.deepEqual(
    OverseerrIntegration.configSchema.fields.map((f) => f.name),
    JellyseerrIntegration.configSchema.fields.map((f) => f.name)
  );
  assert.deepEqual(Object.keys(OverseerrIntegration.views), [
    'requests',
    'issues',
    'media',
    'recent',
    'available',
    'status',
  ]);
});

test('both share mergeGroup "requests" so their list views can be combined in one tile', () => {
  assert.equal(OverseerrIntegration.mergeGroup, 'requests');
  assert.equal(JellyseerrIntegration.mergeGroup, 'requests');
});

test('jellyseerr request/issue/media count views map through the shared base', async () => {
  const http = makeHttp(routes());
  const { byView } = await new JellyseerrIntegration().fetchData({ config: CONFIG, http });

  assert.deepEqual(byView.requests.items, [
    { label: 'Pending', value: 3 },
    { label: 'Approved', value: 2 },
    { label: 'Processing', value: 1 },
    { label: 'Available', value: 40 },
  ]);
  assert.deepEqual(byView.issues.items, [
    { label: 'Open', value: 1 },
    { label: 'Closed', value: 4 },
    { label: 'Total', value: 5 },
  ]);
  // media counts view fires 4 take=1 probes, all answered with results: 9
  assert.deepEqual(byView.media.items.map((i) => i.value), [9, 9, 9, 9]);
});

test('recent-requests view resolves the title + TMDB poster and tags 4K', async () => {
  const http = makeHttp(routes());
  const { byView } = await new OverseerrIntegration().fetchData({ config: CONFIG, http });

  assert.equal(byView.recent.type, 'list');
  const row = byView.recent.items[0];
  assert.equal(row.title, 'Blade Runner 2049 (4K)');
  assert.equal(row.image, 'https://image.tmdb.org/t/p/w154/br.jpg');
  assert.match(row.subtitle, /Dana/);
});

test('recently-available view resolves a TV title through the tv detail endpoint', async () => {
  const http = makeHttp(routes());
  const { byView } = await new OverseerrIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.available.items[0].title, 'Andor');
  assert.equal(byView.available.items[0].image, 'https://image.tmdb.org/t/p/w154/andor.jpg');
  assert.match(byView.available.items[0].subtitle, /TV/);
});

test('status view surfaces version + update availability', async () => {
  const http = makeHttp(routes());
  const { byView } = await new JellyseerrIntegration().fetchData({ config: CONFIG, http });
  assert.deepEqual(byView.status.items, [
    { label: 'Version', value: '2.1.0' },
    { label: 'Update', value: 'available' },
    { label: 'Behind', value: 6 },
  ]);
});

test('the shared base sends the X-Api-Key header', async () => {
  const http = makeHttp(routes());
  await new JellyseerrIntegration().fetchData({ config: CONFIG, http });
  for (const { opts } of http.calls) {
    assert.equal(opts.headers['X-Api-Key'], 'seerr-key');
  }
});
