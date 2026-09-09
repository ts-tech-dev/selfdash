import test from 'node:test';
import assert from 'node:assert/strict';
import JellyfinIntegration from '../../src/integrations/jellyfin.integration.js';
import EmbyIntegration from '../../src/integrations/emby.integration.js';

// Jellyfin and Emby share _embyBase.js — every declared view (nowplaying, stats) runs on
// every poll (see _views.js#runAllViews), so a fake http just answers by URL fragment and
// the test pulls the one view it cares about out of `byView`.
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

const CONFIG = { url: 'http://media.local/', apiKey: 'tok-123' };

const SESSIONS = [
  // idle — no NowPlayingItem, must be dropped
  { UserName: 'idle', DeviceName: 'Web' },
  // a TV episode: prefer the series poster, subtitle is the show name, half watched
  {
    UserName: 'alice',
    NowPlayingItem: {
      Id: 'ep1',
      SeriesId: 'show1',
      Name: 'The One With The Test',
      SeriesName: 'Friends',
      RunTimeTicks: 6000000000,
    },
    PlayState: { PositionTicks: 3000000000, IsPaused: false },
  },
  // a song: no series/album, artists get joined for the subtitle; no runtime -> no progress
  {
    UserName: 'bob',
    NowPlayingItem: { Id: 'trk1', Name: 'Song 2', Artists: ['Blur'], RunTimeTicks: 0 },
  },
];

test('jellyfin nowplaying: drops idle sessions, maps title/subtitle/progress, prefers the series poster', async () => {
  const http = makeHttp([
    ['/Sessions', SESSIONS],
    ['/Items/Counts', {}],
  ]);
  const result = await new JellyfinIntegration().fetchData({ config: CONFIG, http });

  assert.equal(result.type, 'multi');
  const model = result.byView.nowplaying;
  assert.equal(model.type, 'nowplaying');
  assert.equal(model.items.length, 2, 'the idle session is excluded');

  const [ep, song] = model.items;
  assert.equal(ep.title, 'The One With The Test');
  assert.equal(ep.subtitle, 'Friends');
  assert.equal(ep.progress, 0.5);
  assert.equal(
    ep.image,
    'http://media.local/Items/show1/Images/Primary?api_key=tok-123&fillHeight=180',
    'uses SeriesId, not the episode Id, and carries the token as a query param'
  );

  assert.equal(song.subtitle, 'Blur', 'falls back to joined Artists');
  assert.equal(song.progress, undefined, 'no RunTimeTicks -> no progress bar');
});

test('jellyfin nowplaying: clamps progress into 0..1 and tolerates a missing PlayState', async () => {
  const http = makeHttp([
    [
      '/Sessions',
      [
        { NowPlayingItem: { Id: 'a', Name: 'Overrun', RunTimeTicks: 100 }, PlayState: { PositionTicks: 250 } },
        { NowPlayingItem: { Id: 'b', Name: 'No playstate', RunTimeTicks: 100 } },
      ],
    ],
    ['/Items/Counts', {}],
  ]);
  const { byView } = await new JellyfinIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.nowplaying.items[0].progress, 1, 'clamped to 1');
  assert.equal(byView.nowplaying.items[1].progress, 0, 'missing PlayState -> 0, not NaN');
});

test('jellyfin nowplaying: a non-array /Sessions body yields an empty list, not a crash', async () => {
  const http = makeHttp([
    ['/Sessions', { error: 'unauthorized' }],
    ['/Items/Counts', {}],
  ]);
  const { byView } = await new JellyfinIntegration().fetchData({ config: CONFIG, http });
  assert.deepEqual(byView.nowplaying, { type: 'nowplaying', items: [] });
});

test('jellyfin stats: maps /Items/Counts, missing counts default to 0', async () => {
  const http = makeHttp([
    ['/Sessions', []],
    ['/Items/Counts', { MovieCount: 12, SeriesCount: 4, EpisodeCount: 133 }],
  ]);
  const { byView } = await new JellyfinIntegration().fetchData({ config: CONFIG, http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Movies', value: 12 },
      { label: 'Series', value: 4 },
      { label: 'Episodes', value: 133 },
      { label: 'Songs', value: 0 },
    ],
  });
});

test('emby shares the _embyBase logic and sends the X-Emby-Token header + api_key param', async () => {
  const http = makeHttp([
    ['/Sessions', SESSIONS],
    ['/Items/Counts', { MovieCount: 1 }],
  ]);
  const result = await new EmbyIntegration().fetchData({ config: CONFIG, http });
  assert.deepEqual(Object.keys(result.byView), ['nowplaying', 'stats']);
  assert.equal(result.byView.nowplaying.items[0].title, 'The One With The Test');

  for (const { url, opts } of http.calls) {
    assert.equal(opts.headers['X-Emby-Token'], 'tok-123');
    assert.ok(url.includes('api_key=tok-123'), `${url} carries the token as a query param too`);
  }
});

test('jellyfin and emby expose the same view catalog', () => {
  assert.deepEqual(JellyfinIntegration.views, EmbyIntegration.views);
  assert.deepEqual(Object.keys(JellyfinIntegration.views), ['nowplaying', 'stats']);
});
