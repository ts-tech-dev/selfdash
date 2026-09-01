import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE_PRESETS, sizeKeyFromWH } from '../../src/shared/tileSizes.js';
import { sanitizePageOptions } from '../../src/shared/pageOptions.js';
import { fmtRate } from '../../src/shared/format.js';

test('tileSizes: preset table is stable', () => {
  assert.deepEqual(SIZE_PRESETS.S, { w: 1, h: 1 });
  assert.deepEqual(SIZE_PRESETS.full, { w: 6, h: 1 });
});

test('sizeKeyFromWH: exact match or "M" fallback', () => {
  assert.equal(sizeKeyFromWH(1, 1), 'S');
  assert.equal(sizeKeyFromWH(2, 2), 'L');
  assert.equal(sizeKeyFromWH(4, 1), 'wide');
  assert.equal(sizeKeyFromWH(3, 3), 'M');
});

test('sanitizePageOptions: empty in, empty out', () => {
  assert.deepEqual(sanitizePageOptions({}), {});
  assert.deepEqual(sanitizePageOptions(), {});
});

test('sanitizePageOptions: grid clamps to bounds with sane defaults', () => {
  const o = sanitizePageOptions({ grid: { columns: 99, gap: -5, rowHeight: 9999, maxWidth: 999999 } });
  assert.deepEqual(o.grid, { columns: 12, gap: 0, rowHeight: 240, maxWidth: 2400 });
});

test('sanitizePageOptions: background object clamps blur/dim/opacity, trims url', () => {
  const o = sanitizePageOptions({ background: { url: 'x'.repeat(2000), blur: 999, dim: -1, opacity: 500 } });
  assert.equal(o.background.url.length, 1000);
  assert.equal(o.background.blur, 40);
  assert.equal(o.background.dim, 0);
  assert.equal(o.background.opacity, 100);
});

test('sanitizePageOptions: drops unknown keys, keeps customCss', () => {
  const o = sanitizePageOptions({ customCss: '.tile{}', bogus: 1, grid: 'not-an-object' });
  assert.deepEqual(o, { customCss: '.tile{}' });
});

test('fmtRate: steps down to KB/s and B/s so small rates are not shown as "0.0 MB/s"', () => {
  assert.equal(fmtRate(0), '0 B/s');
  assert.equal(fmtRate(512), '512 B/s');
  assert.equal(fmtRate(1024), '1.0 KB/s');
  assert.equal(fmtRate(31211), '30 KB/s'); // a typical idle-ish wifi rate — was "0.0 MB/s"
  assert.equal(fmtRate(5 * 1024), '5.0 KB/s');
  assert.equal(fmtRate(1024 ** 2), '1.0 MB/s');
  assert.equal(fmtRate(12 * 1024 ** 2), '12.0 MB/s');
  assert.equal(fmtRate(-5), '0 B/s');
  assert.equal(fmtRate('nonsense'), '0 B/s');
});
