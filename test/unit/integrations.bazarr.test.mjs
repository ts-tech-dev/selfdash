import test from 'node:test';
import assert from 'node:assert/strict';
import BazarrIntegration from '../../src/integrations/bazarr.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [frag, payload] of routes) {
        if (url.includes(frag)) return typeof payload === 'function' ? payload(url) : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const CONFIG = { url: 'http://bazarr.local', apiKey: 'bz-key' };

function routes(over = {}) {
  return [
    ['/api/badges', over.badges ?? {}],
    ['/api/episodes/wanted', over.epWanted ?? { data: [] }],
    ['/api/movies/wanted', over.movieWanted ?? { data: [] }],
    ['/api/episodes/history', over.epHistory ?? { data: [] }],
    ['/api/movies/history', over.movieHistory ?? { data: [] }],
    ['/api/system/health', over.health ?? { data: [] }],
  ];
}

test('bazarr stats: maps the /api/badges counts, missing keys default to 0', async () => {
  const http = makeHttp(routes({ badges: { episodes: 7, movies: 2, status: 1 } }));
  const { byView } = await new BazarrIntegration().fetchData({ config: CONFIG, http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Episodes', value: 7 },
      { label: 'Movies', value: 2 },
      { label: 'Health', value: 1 },
      { label: 'Providers', value: 0 },
    ],
  });
});

test('bazarr wanted: merges episode + movie rows, shows missing languages, respects the row cap', async () => {
  const http = makeHttp(
    routes({
      epWanted: {
        data: [
          {
            seriesTitle: 'Severance',
            episode_number: '2x01',
            episodeTitle: 'Hello, Ms. Cobel',
            missing_subtitles: [{ code2: 'en', name: 'English' }, { code2: 'es' }],
          },
        ],
      },
      movieWanted: {
        data: [{ title: 'Dune: Part Two', missing_subtitles: [{ code2: 'fr' }] }],
      },
    })
  );
  const { byView } = await new BazarrIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.wanted.type, 'list');
  assert.deepEqual(byView.wanted.items, [
    { title: 'Severance 2x01 — Hello, Ms. Cobel', subtitle: 'en, es' },
    { title: 'Dune: Part Two', subtitle: 'fr' },
  ]);
});

test('bazarr wanted: listLimit clamps the combined list', async () => {
  const http = makeHttp(
    routes({
      epWanted: { data: [{ seriesTitle: 'A', missing_subtitles: [{ code2: 'en' }] }] },
      movieWanted: { data: [{ title: 'B', missing_subtitles: [{ code2: 'en' }] }] },
    })
  );
  const { byView } = await new BazarrIntegration().fetchData({ config: { ...CONFIG, listLimit: 1 }, http });
  assert.equal(byView.wanted.items.length, 1);
});

test('bazarr history: merges episode + movie downloads with a language · provider · time subtitle', async () => {
  const http = makeHttp(
    routes({
      epHistory: {
        data: [
          {
            seriesTitle: 'The Bear',
            episodeTitle: 'Forks',
            language: { name: 'English' },
            provider: 'OpenSubtitles',
            timestamp: '2 days ago',
          },
        ],
      },
      movieHistory: {
        data: [{ title: 'Sinners', language: 'French', provider: 'Podnapisi', timestamp: 'a day ago' }],
      },
    })
  );
  const { byView } = await new BazarrIntegration().fetchData({ config: CONFIG, http });
  assert.deepEqual(byView.history.items, [
    { title: 'The Bear — Forks', subtitle: 'English · OpenSubtitles · 2 days ago' },
    { title: 'Sinners', subtitle: 'French · Podnapisi · a day ago' },
  ]);
});

test('bazarr health: maps issue/object; empty means a clean "No health issues" row', async () => {
  const withIssues = makeHttp(
    routes({ health: { data: [{ object: 'Sonarr', issue: 'Sonarr is not reachable' }] } })
  );
  const a = await new BazarrIntegration().fetchData({ config: CONFIG, http: withIssues });
  assert.deepEqual(a.byView.health.items, [{ title: 'Sonarr is not reachable', subtitle: 'Sonarr' }]);

  const clean = makeHttp(routes());
  const b = await new BazarrIntegration().fetchData({ config: CONFIG, http: clean });
  assert.deepEqual(b.byView.health.items, [{ title: 'No health issues' }]);
});

test('bazarr sends the X-API-KEY header on every call', async () => {
  const http = makeHttp(routes());
  await new BazarrIntegration().fetchData({ config: CONFIG, http });
  assert.ok(http.calls.length > 0);
  for (const { opts } of http.calls) {
    assert.equal(opts.headers['X-API-KEY'], 'bz-key');
  }
});

test('bazarr merges into the "arr" group and exposes list-shaped views', () => {
  assert.equal(BazarrIntegration.mergeGroup, 'arr');
  assert.deepEqual(Object.keys(BazarrIntegration.views), ['stats', 'wanted', 'history', 'health']);
});
