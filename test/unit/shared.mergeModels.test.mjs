import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCalendar, mergeListLike, mergeModel } from '../../src/shared/mergeModels.js';

const src = (source, type, items) => ({ source, model: { type, items } });

test('mergeListLike(queue): concatenates rows and tags each with its source client', () => {
  const merged = mergeModel('queue', [
    src('qBittorrent', 'queue', [
      { title: 'Ubuntu.iso', status: 'downloading', progress: 0.7 },
      { title: 'Big.Movie', status: 'stalledDL', progress: 0.1 },
    ]),
    src('SABnzbd', 'queue', [{ title: 'Some.Show.S02E04', status: 'Downloading', progress: 0.4 }]),
  ]);

  assert.equal(merged.type, 'queue');
  assert.deepEqual(
    merged.items.map((i) => [i.title, i.subtitle]),
    [
      ['Ubuntu.iso', 'qBittorrent'],
      ['Big.Movie', 'qBittorrent'],
      ['Some.Show.S02E04', 'SABnzbd'],
    ]
  );
  // progress/status survive the merge so the tile can still draw the bar
  assert.equal(merged.items[0].progress, 0.7);
  assert.equal(merged.items[2].status, 'Downloading');
});

test('mergeListLike: an existing subtitle is kept and the source appended', () => {
  const merged = mergeListLike('list', [src('Radarr', 'list', [{ title: 'Movie', subtitle: 'Bluray-1080p' }])]);
  assert.equal(merged.items[0].subtitle, 'Bluray-1080p · Radarr');
});

test('mergeListLike: skips sources whose model is missing or a different type', () => {
  const merged = mergeListLike('queue', [
    src('A', 'queue', [{ title: 'keep' }]),
    { source: 'B', model: null },
    src('C', 'stats', [{ label: 'x', value: 1 }]),
  ]);
  assert.deepEqual(merged.items.map((i) => i.title), ['keep']);
});

test('mergeCalendar: merges events, sorts by ts, keeps a source tag', () => {
  const merged = mergeModel('calendar', [
    src('Radarr', 'calendar', [{ ts: 300, title: 'Late' }]),
    src('Sonarr', 'calendar', [{ ts: 100, title: 'Early' }, { ts: 200, title: 'Mid' }]),
  ]);
  assert.deepEqual(
    merged.items.map((i) => [i.title, i.source]),
    [
      ['Early', 'Sonarr'],
      ['Mid', 'Sonarr'],
      ['Late', 'Radarr'],
    ]
  );
});

test('mergeModel: stats/nowplaying and unknown types do not merge', () => {
  assert.equal(mergeModel('stats', [src('A', 'stats', [])]), null);
  assert.equal(mergeModel('nowplaying', [src('A', 'nowplaying', [])]), null);
  assert.equal(mergeModel('bogus', []), null);
});
