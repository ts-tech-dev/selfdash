import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_TYPES,
  PANEL_TYPES,
  buildIframeConfig,
  sanitizeTileConfig,
  commonConfig,
  normalizeOpenMode,
  clampInt,
} from '../../src/shared/tileConfig.js';

test('TILE_TYPES / PANEL_TYPES membership', () => {
  for (const t of ['link', 'widget', 'iframe', 'clock', 'weather', 'notes', 'search', 'rss', 'calendar', 'bookmarks', 'customapi', 'resources']) {
    assert.ok(TILE_TYPES.has(t), `${t} is a tile type`);
  }
  assert.ok(!TILE_TYPES.has('bogus'));
  assert.ok(PANEL_TYPES.has('clock') && !PANEL_TYPES.has('link') && !PANEL_TYPES.has('widget'));
});

test('normalizeOpenMode: whitelist with newtab fallback', () => {
  assert.equal(normalizeOpenMode('iframe'), 'iframe');
  assert.equal(normalizeOpenMode('same'), 'same');
  assert.equal(normalizeOpenMode('nonsense'), 'newtab');
  assert.equal(normalizeOpenMode(undefined), 'newtab');
});

test('clampInt: clamps and defaults NaN to min', () => {
  assert.equal(clampInt(5, 0, 10), 5);
  assert.equal(clampInt(-3, 0, 10), 0);
  assert.equal(clampInt(99, 0, 10), 10);
  assert.equal(clampInt('abc', 2, 10), 2);
});

test('buildIframeConfig: defaults', () => {
  assert.deepEqual(buildIframeConfig(undefined), {
    sizing: 'aspect',
    aspectRatio: '16/9',
    height: 400,
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
  });
});

test('buildIframeConfig: validates aspect ratio and clamps height', () => {
  assert.equal(buildIframeConfig({ aspectRatio: '4/3' }).aspectRatio, '4/3');
  assert.equal(buildIframeConfig({ aspectRatio: 'garbage' }).aspectRatio, '16/9');
  assert.equal(buildIframeConfig({ sizing: 'height', height: 5 }).height, 100);
  assert.equal(buildIframeConfig({ height: 99999 }).height, 2000);
});

test('buildIframeConfig: drops unknown sandbox tokens, keeps valid ones', () => {
  assert.equal(buildIframeConfig({ sandbox: 'allow-scripts allow-evil allow-forms' }).sandbox, 'allow-scripts allow-forms');
  assert.equal(buildIframeConfig({ sandbox: 'all-bogus' }).sandbox, 'allow-scripts allow-same-origin allow-forms allow-popups');
});

test('sanitizeTileConfig clock: coerces + fills defaults', () => {
  const c = sanitizeTileConfig('clock', { format: 'weird', showSeconds: 1, timezone: 'x'.repeat(200) });
  assert.equal(c.format, '24h');
  assert.equal(c.showDate, true);
  assert.equal(c.showSeconds, true);
  assert.equal(c.timezone.length, 64);
});

test('sanitizeTileConfig weather: number ranges', () => {
  const c = sanitizeTileConfig('weather', { latitude: 999, longitude: -999, units: 'kelvin' });
  assert.equal(c.latitude, 90);
  assert.equal(c.longitude, -180);
  assert.equal(c.units, 'metric');
});

test('sanitizeTileConfig bookmarks: drops links without a url, caps length', () => {
  const links = Array.from({ length: 80 }, (_, i) => ({ title: `t${i}`, url: `https://e/${i}` }));
  links.push({ title: 'no url' });
  const c = sanitizeTileConfig('bookmarks', { columns: 9, links });
  assert.equal(c.columns, 4);
  assert.equal(c.links.length, 60);
  assert.ok(c.links.every((l) => l.url));
});

test('sanitizeTileConfig customapi: method whitelist + header filtering', () => {
  const c = sanitizeTileConfig('customapi', {
    url: 'https://api.example.com',
    method: 'delete',
    headers: [{ k: 'Authorization', v: 'Bearer x' }, { v: 'no key dropped' }],
    refreshSec: 1,
    display: 'table',
  });
  assert.equal(c.method, 'GET');
  assert.equal(c.headers.length, 1);
  assert.equal(c.refreshSec, 5);
  assert.equal(c.display, 'stats');
});

test('sanitizeTileConfig resources: folds legacy diskPath/netIface into arrays', () => {
  const c = sanitizeTileConfig('resources', { diskPath: '/mnt/a', netIface: 'eth0', show: ['cpu', 'bogus', 'net'] });
  assert.deepEqual(c.diskPaths, ['/mnt/a']);
  assert.deepEqual(c.netIfaces, ['eth0']);
  assert.deepEqual(c.show, ['cpu', 'net']);
});

test('commonConfig: group trimmed, appearance hex-validated', () => {
  assert.deepEqual(commonConfig({ group: '  Media  ' }), { group: 'Media' });
  assert.deepEqual(
    commonConfig({ appearance: { accent: '#abcdef', iconBg: 'red', hideTitle: true } }),
    { appearance: { accent: '#abcdef', hideTitle: true } }
  );
  assert.deepEqual(commonConfig({}), {});
});

test('sanitizeTileConfig merges common fields onto panel config', () => {
  const c = sanitizeTileConfig('notes', { markdown: '# hi', group: 'Docs' });
  assert.equal(c.markdown, '# hi');
  assert.equal(c.group, 'Docs');
});
