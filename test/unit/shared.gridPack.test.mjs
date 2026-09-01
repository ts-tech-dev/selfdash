import test from 'node:test';
import assert from 'node:assert/strict';
import { occupancyOf, placeBox, nextFreeSlot } from '../../src/shared/gridPack.js';

test('occupancyOf: builds a row bitmask from placed tiles', () => {
  const occ = occupancyOf([{ x: 0, y: 0, w: 2, h: 1 }, { x: 4, y: 0, w: 1, h: 2 }], 6);
  assert.equal(occ[0], 0b010011); // cols 0,1 and 4
  assert.equal(occ[1], 0b010000); // col 4 only (second row of the tall tile)
});

test('occupancyOf: clamps out-of-range geometry instead of throwing', () => {
  const occ = occupancyOf([{ x: 99, y: -5, w: 99, h: 0 }], 6);
  // width clamps to 6 -> full first row
  assert.equal(occ[0], 0b111111);
});

test('placeBox: first-fit scans top-to-bottom, left-to-right', () => {
  const occ = [];
  assert.deepEqual(placeBox(occ, 6, 2, 1), { x: 0, y: 0 });
  assert.deepEqual(placeBox(occ, 6, 2, 1), { x: 2, y: 0 });
  assert.deepEqual(placeBox(occ, 6, 2, 1), { x: 4, y: 0 });
  assert.deepEqual(placeBox(occ, 6, 2, 1), { x: 0, y: 1 }); // row 0 full, wrap
});

test('placeBox: a wide box skips a partially-filled row', () => {
  const occ = occupancyOf([{ x: 0, y: 0, w: 5, h: 1 }], 6);
  assert.deepEqual(placeBox(occ, 6, 6, 1), { x: 0, y: 1 });
});

test('placeBox: mutates occupancy so subsequent calls see the reservation', () => {
  const occ = [];
  placeBox(occ, 6, 3, 2);
  assert.equal(occ[0], 0b000111);
  assert.equal(occ[1], 0b000111);
});

test('nextFreeSlot: composes occupancyOf + placeBox', () => {
  const tiles = [{ x: 0, y: 0, w: 6, h: 1 }];
  assert.deepEqual(nextFreeSlot(tiles, 6, 2, 1), { x: 0, y: 1 });
});
