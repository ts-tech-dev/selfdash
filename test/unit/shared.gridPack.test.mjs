import test from 'node:test';
import assert from 'node:assert/strict';
import { occupancyOf, placeBox, nextFreeSlot, placeInGroup } from '../../src/shared/gridPack.js';

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

test('placeInGroup: packs only against tiles in the same group', () => {
  const tiles = [
    { id: 1, x: 0, y: 0, w: 6, h: 1, config: { group: 'A' } },
    { id: 2, x: 0, y: 0, w: 2, h: 1, config: { group: 'B' } },
    { id: 3, x: 0, y: 0, w: 2, h: 1, config: {} }, // ungrouped
  ];
  // moving a tile into group A: row 0 is full there -> next row
  assert.deepEqual(placeInGroup(tiles, 6, { group: 'A', w: 2, h: 1 }), { x: 0, y: 1 });
  // group B only has a 2-wide tile at x0 -> land beside it
  assert.deepEqual(placeInGroup(tiles, 6, { group: 'B', w: 2, h: 1 }), { x: 2, y: 0 });
  // ungrouped ('') sees only tile 3
  assert.deepEqual(placeInGroup(tiles, 6, { group: '', w: 2, h: 1 }), { x: 2, y: 0 });
});

test('placeInGroup: exceptId keeps a tile from colliding with its old self', () => {
  const tiles = [
    { id: 1, x: 0, y: 0, w: 3, h: 1, config: { group: 'A' } },
    { id: 2, x: 3, y: 0, w: 3, h: 1, config: { group: 'A' } },
  ];
  // tile 2 excluded -> only tile 1 (cols 0-2) blocks -> a 3-wide box fits at x3,y0
  assert.deepEqual(placeInGroup(tiles, 6, { group: 'A', w: 3, h: 1, exceptId: 2 }), { x: 3, y: 0 });
  // without exceptId, row 0 is full for a 3-wide box -> wraps to row 1
  assert.deepEqual(placeInGroup(tiles, 6, { group: 'A', w: 3, h: 1 }), { x: 0, y: 1 });
});
