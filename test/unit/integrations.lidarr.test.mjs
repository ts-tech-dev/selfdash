import test from 'node:test';
import assert from 'node:assert/strict';
import LidarrIntegration from '../../src/integrations/lidarr.integration.js';

// Lidarr runs on the v1 *arr API. Every view runs each poll (see _views.js), so the fake
// answers by URL fragment and each test reads one `byView` slot.
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

const CONFIG = { url: 'http://lidarr.local', apiKey: 'k' };

function routes(over = {}) {
  return [
    ['/api/v1/queue', over.queue ?? []],
    ['/api/v1/artist', over.artist ?? []],
    ['/api/v1/calendar', over.calendar ?? []],
    ['/api/v1/history', over.history ?? { records: [] }],
    ['/api/v1/health', over.health ?? []],
    ['/api/v1/diskspace', over.diskspace ?? []],
  ];
}

test('lidarr queue: "Artist — Album" title, status line, progress from size', async () => {
  const http = makeHttp(
    routes({
      queue: [
        {
          artist: { artistName: 'Radiohead' },
          album: { title: 'OK Computer' },
          size: 100,
          sizeleft: 25,
          trackedDownloadState: 'downloading',
          timeleft: '00:10:00',
        },
        { title: 'raw.release.name-GRP', size: 0 },
      ],
    })
  );
  const { byView } = await new LidarrIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.queue.type, 'queue');
  assert.equal(byView.queue.items[0].title, 'Radiohead — OK Computer');
  assert.equal(byView.queue.items[0].progress, 0.75);
  assert.match(byView.queue.items[0].status, /downloading/);
  assert.equal(byView.queue.items[1].title, 'raw.release.name-GRP', 'falls back to the raw release name');
});

test('lidarr stats: artist/track counts, Missing = aggregate wanted − on disk (family convention)', async () => {
  const http = makeHttp(
    routes({
      artist: [
        { monitored: true, statistics: { trackFileCount: 8, trackCount: 10 } },
        { monitored: true, statistics: { trackFileCount: 20, trackCount: 20 } },
        { monitored: false, statistics: { trackFileCount: 0, trackCount: 0 } },
      ],
    })
  );
  const { byView } = await new LidarrIntegration().fetchData({ config: CONFIG, http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Artists', value: 3 },
      { label: 'Monitored', value: 2 },
      { label: 'Tracks', value: 28 }, // 8 + 20 + 0
      { label: 'Missing', value: 2 }, // max(0, (10+20+0) − (8+20+0))
    ],
  });
});

test('lidarr stats: Missing never goes negative when more tracks are on disk than expected', async () => {
  const http = makeHttp(
    routes({ artist: [{ monitored: true, statistics: { trackFileCount: 12, trackCount: 9 } }] })
  );
  const { byView } = await new LidarrIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.stats.items.find((i) => i.label === 'Missing').value, 0);
});

test('lidarr calendar: buckets by release date, drops undated albums, sorts ascending, carries the artist poster', async () => {
  const http = makeHttp(
    routes({
      calendar: [
        {
          title: 'Later Album',
          releaseDate: '2026-10-01T00:00:00Z',
          artist: { artistName: 'Artist B', images: [{ coverType: 'poster', remoteUrl: 'http://img/b.jpg' }] },
        },
        { title: 'Sooner Album', releaseDate: '2026-09-05T00:00:00Z', artist: { artistName: 'Artist A', images: [] } },
        { title: 'Undated', artist: { artistName: 'Artist C' } },
      ],
    })
  );
  const { byView } = await new LidarrIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.calendar.type, 'calendar');
  assert.equal(byView.calendar.items.length, 2, 'the undated album is dropped');
  assert.equal(byView.calendar.items[0].title, 'Artist A');
  assert.equal(byView.calendar.items[0].subtitle, 'Sooner Album');
  assert.equal(byView.calendar.items[0].image, undefined);
  assert.equal(byView.calendar.items[1].title, 'Artist B');
  assert.equal(byView.calendar.items[1].image, 'http://img/b.jpg');
  assert.ok(byView.calendar.items[0].ts < byView.calendar.items[1].ts);
});

test('lidarr upcoming: list view keeps undated rows (no date subtitle) and sorts them last', async () => {
  const http = makeHttp(
    routes({
      calendar: [
        { title: 'Undated', artist: { artistName: 'Zed' } },
        { title: 'Dated', releaseDate: '2026-09-10T00:00:00Z', artist: { artistName: 'Amy' } },
      ],
    })
  );
  const { byView } = await new LidarrIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.upcoming.type, 'list');
  assert.equal(byView.upcoming.items[0].title, 'Amy — Dated');
  assert.ok(byView.upcoming.items[0].subtitle, 'dated row has a date subtitle');
  assert.equal(byView.upcoming.items[1].title, 'Zed — Undated');
  assert.equal(byView.upcoming.items[1].subtitle, undefined);
});

test('lidarr history: "Artist — Album" with quality + relative time subtitle', async () => {
  const http = makeHttp(
    routes({
      history: {
        records: [
          {
            artist: { artistName: 'Boards of Canada' },
            album: { title: 'Geogaddi' },
            quality: { quality: { name: 'FLAC' } },
            date: new Date(Date.now() - 3600_000).toISOString(),
          },
        ],
      },
    })
  );
  const { byView } = await new LidarrIntegration().fetchData({ config: CONFIG, http });
  assert.equal(byView.history.type, 'list');
  assert.equal(byView.history.items[0].title, 'Boards of Canada — Geogaddi');
  assert.match(byView.history.items[0].subtitle, /FLAC/);
});

test('lidarr talks to the v1 API and honours config.upcomingDays for the calendar window', async () => {
  const http = makeHttp(routes());
  await new LidarrIntegration().fetchData({ config: { ...CONFIG, upcomingDays: 60 }, http });

  assert.ok(http.calls.some((c) => c.url.includes('/api/v1/')));
  assert.ok(http.calls.every((c) => !c.url.includes('/api/v3/')));

  const calendarCalls = http.calls.filter((c) => c.url.includes('/calendar'));
  // the calendar-view call is the one that also looks into the past (pastDays lookback)
  calendarCalls.sort(
    (a, b) => new URL(a.url).searchParams.get('start').localeCompare(new URL(b.url).searchParams.get('start'))
  );
  const u = new URL(calendarCalls[0].url);
  const days = Math.round((new Date(u.searchParams.get('end')) - new Date(u.searchParams.get('start'))) / 86400000);
  assert.ok(days >= 66 && days <= 68, `expected ~67 days (7 past + 60 ahead), got ${days}`);
});
