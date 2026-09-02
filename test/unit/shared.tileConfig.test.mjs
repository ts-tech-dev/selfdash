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
  widgetConfig,
} from '../../src/shared/tileConfig.js';
import { openDatabase } from '../../src/db/index.js';
import { makeTmpDir } from '../helpers/tmpdir.mjs';

function withDb(t) {
  const { dir, cleanup } = makeTmpDir();
  const db = openDatabase(dir);
  t.after(() => {
    db.close();
    cleanup();
  });
  return db;
}

function makeIntegration(db, name = 'Test') {
  return db
    .prepare("INSERT INTO integrations (key, name, config_json, interval, enabled, last_status) VALUES ('gluetun', ?, '{}', 60, 1, 'unknown')")
    .run(name).lastInsertRowid;
}

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

test('sanitizeTileConfig bookmarks: each link keeps a clamped column (independent of the current columns count)', () => {
  const c = sanitizeTileConfig('bookmarks', {
    columns: 2,
    links: [
      { url: 'https://a', column: 3 },
      { url: 'https://b', column: 0 },
      { url: 'https://c' },
      { url: 'https://d', column: 'nope' },
    ],
  });
  assert.deepEqual(c.links.map((l) => l.column), [3, 1, 1, 1]);
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

test('commonConfig: appearance.textColor kept only when a #rrggbb hex', () => {
  assert.deepEqual(
    commonConfig({ appearance: { textColor: '#10a37f' } }),
    { appearance: { textColor: '#10a37f' } }
  );
  assert.deepEqual(commonConfig({ appearance: { textColor: 'white' } }), {});
  assert.deepEqual(commonConfig({ appearance: { textColor: '#fff' } }), {});
});

test('sanitizeTileConfig merges common fields onto panel config', () => {
  const c = sanitizeTileConfig('notes', { markdown: '# hi', group: 'Docs' });
  assert.equal(c.markdown, '# hi');
  assert.equal(c.group, 'Docs');
});

test('widgetConfig: dedupes/caps views, empty selection omits the key', (t) => {
  const db = withDb(t);
  const primary = makeIntegration(db);
  assert.deepEqual(widgetConfig(db, { views: ['queue', 'stats', 'queue'] }, primary), { views: ['queue', 'stats'] });
  assert.deepEqual(widgetConfig(db, { views: [] }, primary), {});
  assert.deepEqual(widgetConfig(db, {}, primary), {});
  const many = Array.from({ length: 20 }, (_, i) => `v${i}`);
  assert.equal(widgetConfig(db, { views: many }, primary).views.length, 8);
});

test('widgetConfig: moreIntegrationIds drops self-references, dangling ids, and non-integers; dedupes; caps at 12', (t) => {
  const db = withDb(t);
  const primary = makeIntegration(db, 'Primary');
  const other1 = makeIntegration(db, 'Other 1');
  const other2 = makeIntegration(db, 'Other 2');

  const cfg = widgetConfig(
    db,
    { views: ['calendar'], moreIntegrationIds: [other1, other2, other1, primary, 999999, 'nope', -3, 1.5] },
    primary
  );
  assert.deepEqual(new Set(cfg.moreIntegrationIds), new Set([other1, other2]));

  const manyIds = Array.from({ length: 30 }, () => makeIntegration(db));
  const capped = widgetConfig(db, { views: ['calendar'], moreIntegrationIds: manyIds }, primary);
  assert.equal(capped.moreIntegrationIds.length, 12);
});

test('widgetConfig: moreIntegrationIds is dropped entirely unless exactly one view is selected', (t) => {
  const db = withDb(t);
  const primary = makeIntegration(db, 'Primary');
  const other = makeIntegration(db, 'Other');

  assert.equal(widgetConfig(db, { views: [], moreIntegrationIds: [other] }, primary).moreIntegrationIds, undefined);
  assert.equal(
    widgetConfig(db, { views: ['a', 'b'], moreIntegrationIds: [other] }, primary).moreIntegrationIds,
    undefined
  );
  assert.deepEqual(widgetConfig(db, { views: ['a'], moreIntegrationIds: [other] }, primary).moreIntegrationIds, [other]);
});
