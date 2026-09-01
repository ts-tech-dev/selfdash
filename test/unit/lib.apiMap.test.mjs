import test from 'node:test';
import assert from 'node:assert/strict';
import { getPath, buildModel } from '../../src/lib/apiMap.js';
import { CUSTOM_API_JSON } from '../helpers/fixtures.mjs';

test('getPath: dotted lookup', () => {
  assert.equal(getPath(CUSTOM_API_JSON, 'counts.active'), 3);
  assert.equal(getPath(CUSTOM_API_JSON, 'status'), 'green');
});

test('getPath: numeric index syntax', () => {
  assert.equal(getPath(CUSTOM_API_JSON, 'torrents[0].name'), 'ubuntu.iso');
  assert.equal(getPath(CUSTOM_API_JSON, 'torrents.1.state'), 'downloading');
});

test('getPath: [] wildcard spreads an array', () => {
  assert.deepEqual(getPath(CUSTOM_API_JSON, 'torrents[].name'), ['ubuntu.iso', 'debian.iso']);
});

test('getPath: missing path is undefined, empty path is identity', () => {
  assert.equal(getPath(CUSTOM_API_JSON, 'nope.nope'), undefined);
  assert.equal(getPath(CUSTOM_API_JSON, ''), CUSTOM_API_JSON);
  assert.equal(getPath(null, 'a.b'), undefined);
});

test('buildModel stats: maps label/path pairs and formats values', () => {
  const model = buildModel(CUSTOM_API_JSON, {
    display: 'stats',
    items: [
      { label: 'Status', path: 'status' },
      { label: 'Active', path: 'counts.active' },
      { label: 'Bad', path: '' }, // filtered: no path
    ],
  });
  assert.equal(model.type, 'stats');
  assert.deepEqual(model.items, [
    { label: 'Status', value: 'green' },
    { label: 'Active', value: '3' },
  ]);
});

test('buildModel list: pulls a list and maps title/subtitle', () => {
  const model = buildModel(CUSTOM_API_JSON, {
    display: 'list',
    listPath: 'torrents',
    titlePath: 'name',
    subtitlePath: 'state',
  });
  assert.equal(model.type, 'list');
  assert.deepEqual(model.items[0], { title: 'ubuntu.iso', subtitle: 'seeding' });
});

test('buildModel: number rounding + nullish dash', () => {
  const model = buildModel({ x: 3.14159, y: null }, { items: [{ label: 'X', path: 'x' }, { label: 'Y', path: 'y' }] });
  assert.equal(model.items[0].value, '3.14');
  assert.equal(model.items[1].value, '—');
});
