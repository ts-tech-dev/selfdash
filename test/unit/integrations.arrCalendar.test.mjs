import test from 'node:test';
import assert from 'node:assert/strict';
import RadarrIntegration from '../../src/integrations/radarr.integration.js';
import SonarrIntegration from '../../src/integrations/sonarr.integration.js';

// fetchData() now runs every declared view on every poll (see _views.js#runAllViews) —
// which view(s) a tile shows is picked client-side, not by the integration's config —
// so the same fake payload gets hit by queue/stats/upcoming/calendar/history/health/disk
// concurrently. None of those other views choke on movie/episode-shaped records, so we
// just pull the one view these tests care about out of `byView`.

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

// Both the "calendar" view (fetchArrCalendar) and the older "upcoming" view
// (fetchUpcoming) hit the same /calendar endpoint, so a plain URL search isn't
// enough to isolate the one under test. Only fetchArrCalendar looks into the past
// (its `pastDays` lookback) — "upcoming"'s window starts at today — so the call
// with the earliest `start=` date is the calendar view's.
function calendarUrl(http) {
  const matches = http.calls.filter((u) => u.includes('/calendar'));
  assert.ok(matches.length, 'the calendar endpoint was called');
  matches.sort((a, b) => new URL(a).searchParams.get('start').localeCompare(new URL(b).searchParams.get('start')));
  return matches[0];
}

test('radarr calendar view: buckets by earliest release date, drops undated movies, sorts ascending', async () => {
  const http = fakeHttp([
    { title: 'Later Movie', inCinemas: '2026-09-20T00:00:00Z', images: [] },
    { title: 'Digital Movie', digitalRelease: '2026-09-05T00:00:00Z', images: [] },
    { title: 'No Date Movie', images: [] }, // no release dates at all -> must be dropped
  ]);
  const config = { url: 'http://radarr.local', apiKey: 'k' };

  const result = await new RadarrIntegration().fetchData({ config, http });
  assert.equal(result.type, 'multi');
  const model = result.byView.calendar;

  assert.equal(model.type, 'calendar');
  assert.equal(model.items.length, 2, 'the undated movie is excluded');
  assert.equal(model.items[0].title, 'Digital Movie');
  assert.equal(model.items[0].subtitle, 'Digital');
  assert.equal(model.items[1].title, 'Later Movie');
  assert.equal(model.items[1].subtitle, 'Cinemas');
  assert.ok(model.items[0].ts < model.items[1].ts, 'sorted ascending by timestamp');
  assert.ok(calendarUrl(http).includes('unmonitored=false'));
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
  const config = { url: 'http://radarr.local', apiKey: 'k' };

  const result = await new RadarrIntegration().fetchData({ config, http });
  const model = result.byView.calendar;

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
  const config = { url: 'http://sonarr.local', apiKey: 'k' };

  const result = await new SonarrIntegration().fetchData({ config, http });
  const model = result.byView.calendar;

  assert.equal(model.type, 'calendar');
  assert.equal(model.items.length, 2, 'the undated episode is excluded');
  assert.equal(model.items[0].title, 'Show B');
  assert.equal(model.items[0].subtitle, 'S02E01');
  assert.equal(model.items[1].title, 'Show A');
  assert.equal(model.items[1].subtitle, 'S01E02 · The Pilot');
  assert.ok(calendarUrl(http).includes('includeSeries=true'));
});

test('arr calendar helper honors config.upcomingDays for the window end date', async () => {
  const http = fakeHttp([]);
  const config = { url: 'http://radarr.local', apiKey: 'k', upcomingDays: 90 };

  await new RadarrIntegration().fetchData({ config, http });

  const url = new URL(calendarUrl(http));
  const start = new Date(url.searchParams.get('start'));
  const end = new Date(url.searchParams.get('end'));
  const days = Math.round((end - start) / 86400000);
  assert.ok(days >= 96 && days <= 98, `expected ~97 days (7 past + 90 ahead), got ${days}`);
});
