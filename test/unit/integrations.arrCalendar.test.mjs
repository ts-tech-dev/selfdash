import test from 'node:test';
import assert from 'node:assert/strict';
import RadarrIntegration from '../../src/integrations/radarr.integration.js';
import SonarrIntegration from '../../src/integrations/sonarr.integration.js';

function fakeHttp(payload) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url) => {
      calls.push(url);
      return payload;
    },
  };
}

test('radarr calendar view: buckets by earliest release date, drops undated movies, sorts ascending', async () => {
  const http = fakeHttp([
    { title: 'Later Movie', inCinemas: '2026-09-20T00:00:00Z', images: [] },
    { title: 'Digital Movie', digitalRelease: '2026-09-05T00:00:00Z', images: [] },
    { title: 'No Date Movie', images: [] }, // no release dates at all -> must be dropped
  ]);
  const config = { url: 'http://radarr.local', apiKey: 'k', views: ['calendar'] };

  const model = await new RadarrIntegration().fetchData({ config, http });

  assert.equal(model.type, 'calendar');
  assert.equal(model.items.length, 2, 'the undated movie is excluded');
  assert.equal(model.items[0].title, 'Digital Movie');
  assert.equal(model.items[0].subtitle, 'Digital');
  assert.equal(model.items[1].title, 'Later Movie');
  assert.equal(model.items[1].subtitle, 'Cinemas');
  assert.ok(model.items[0].ts < model.items[1].ts, 'sorted ascending by timestamp');
  assert.ok(http.calls[0].includes('unmonitored=false'));
  assert.ok(http.calls[0].includes('/api/v3/calendar'));
});

test('radarr calendar view: picks the release kind that matches the earliest of several dates', async () => {
  const http = fakeHttp([
    {
      title: 'Multi-date Movie',
      inCinemas: '2026-09-10T00:00:00Z',
      digitalRelease: '2026-09-01T00:00:00Z',
      physicalRelease: '2026-09-25T00:00:00Z',
      images: [],
    },
  ]);
  const config = { url: 'http://radarr.local', apiKey: 'k', views: ['calendar'] };

  const model = await new RadarrIntegration().fetchData({ config, http });

  assert.equal(model.items.length, 1);
  assert.equal(model.items[0].subtitle, 'Digital', 'earliest date (digital) wins, not the first field checked');
});

test('sonarr calendar view: tags season/episode and drops episodes with no air date', async () => {
  const http = fakeHttp([
    {
      series: { title: 'Show A' },
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'The Pilot',
      airDateUtc: '2026-09-06T20:00:00Z',
    },
    {
      series: { title: 'Show B' },
      seasonNumber: 2,
      episodeNumber: 1,
      title: 'Show B', // episode title == series title -> not appended twice
      airDateUtc: '2026-09-04T20:00:00Z',
    },
    { series: { title: 'Undated Show' }, seasonNumber: 1, episodeNumber: 1 }, // no airDateUtc/airDate
  ]);
  const config = { url: 'http://sonarr.local', apiKey: 'k', views: ['calendar'] };

  const model = await new SonarrIntegration().fetchData({ config, http });

  assert.equal(model.type, 'calendar');
  assert.equal(model.items.length, 2, 'the undated episode is excluded');
  assert.equal(model.items[0].title, 'Show B');
  assert.equal(model.items[0].subtitle, 'S02E01');
  assert.equal(model.items[1].title, 'Show A');
  assert.equal(model.items[1].subtitle, 'S01E02 · The Pilot');
  assert.ok(http.calls[0].includes('includeSeries=true'));
});

test('arr calendar helper honors config.upcomingDays for the window end date', async () => {
  const http = fakeHttp([]);
  const config = { url: 'http://radarr.local', apiKey: 'k', views: ['calendar'], upcomingDays: 90 };

  await new RadarrIntegration().fetchData({ config, http });

  const url = new URL(http.calls[0]);
  const start = new Date(url.searchParams.get('start'));
  const end = new Date(url.searchParams.get('end'));
  const days = Math.round((end - start) / 86400000);
  assert.ok(days >= 96 && days <= 98, `expected ~97 days (7 past + 90 ahead), got ${days}`);
});
