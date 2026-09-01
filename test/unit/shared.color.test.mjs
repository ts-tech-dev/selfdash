import test from 'node:test';
import assert from 'node:assert/strict';
import { isHexColor, dimmedTextColor } from '../../src/shared/color.js';

test('isHexColor: only #rrggbb (any case) passes', () => {
  assert.equal(isHexColor('#5b8def'), true);
  assert.equal(isHexColor('#ABCDEF'), true);
  assert.equal(isHexColor('#abc'), false); // shorthand not stored
  assert.equal(isHexColor('5b8def'), false); // missing #
  assert.equal(isHexColor('#5b8de'), false); // too short
  assert.equal(isHexColor('rebeccapurple'), false);
  assert.equal(isHexColor('rgb(1,2,3)'), false);
  assert.equal(isHexColor(''), false);
  assert.equal(isHexColor(undefined), false);
  assert.equal(isHexColor(0x5b8def), false); // non-string
});

test('dimmedTextColor: a color-mix expression toward --bg', () => {
  assert.equal(dimmedTextColor('#ffffff'), 'color-mix(in srgb, #ffffff 62%, var(--bg))');
});
