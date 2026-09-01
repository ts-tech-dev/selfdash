import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, contrastRatio, AA_NORMAL } from '../../src/shared/contrast.js';

test('parseColor: hex short + long, rgb, rgba (alpha flattened over white)', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColor('#000000'), [0, 0, 0]);
  assert.deepEqual(parseColor('#5b8def'), [91, 141, 239]);
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30]);
  // 50% black over default white -> mid grey
  assert.deepEqual(parseColor('rgba(0,0,0,0.5)'), [128, 128, 128]);
  assert.equal(parseColor('not-a-color'), null);
  assert.equal(parseColor(42), null);
});

test('contrastRatio: black on white is 21, identical colours are 1', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('contrastRatio: order-independent, null on unparseable', () => {
  const a = contrastRatio('#123456', '#eeeeee');
  const b = contrastRatio('#eeeeee', '#123456');
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.equal(contrastRatio('#123456', 'bogus'), null);
});

test('contrastRatio: a light grey on the default dark bg fails AA', () => {
  // #777 on #111318 — the case the UI should warn about
  assert.ok(contrastRatio('#777777', '#111318') < AA_NORMAL);
  // near-white passes
  assert.ok(contrastRatio('#e6e6e6', '#111318') >= AA_NORMAL);
});
