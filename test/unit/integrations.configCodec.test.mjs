import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeConfig,
  decodeConfig,
  maskConfig,
  mergeConfig,
  validateConfig,
} from '../../src/integrations/configCodec.js';
import { makeCrypto } from '../../src/lib/crypto.js';

const SCHEMA = {
  configSchema: {
    fields: [
      { name: 'url', label: 'URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API key', type: 'password', required: true },
      { name: 'limit', label: 'Limit', type: 'number', required: false },
      { name: 'mode', label: 'Mode', type: 'select', required: false, options: ['a', 'b'] },
      { name: 'views', label: 'Views', type: 'multiselect', required: false, options: [{ value: 'x' }, { value: 'y' }] },
    ],
  },
};

test('encode/decode: plaintext passthrough when crypto is null', () => {
  const enc = encodeConfig({ a: 1 }, null);
  assert.equal(enc, '{"a":1}');
  assert.deepEqual(decodeConfig(enc, null), { a: 1 });
  assert.deepEqual(decodeConfig('', null), {});
});

test('encode/decode: encrypted round-trip', () => {
  const c = makeCrypto('sec');
  const enc = encodeConfig({ apiKey: 'top' }, c);
  assert.notEqual(enc, '{"apiKey":"top"}');
  assert.deepEqual(decodeConfig(enc, c), { apiKey: 'top' });
});

test('maskConfig: password fields become a boolean', () => {
  assert.deepEqual(maskConfig({ url: 'http://x', apiKey: 'secret' }, SCHEMA), { url: 'http://x', apiKey: true });
  assert.deepEqual(maskConfig({ url: 'http://x', apiKey: '' }, SCHEMA), { url: 'http://x', apiKey: false });
});

test('mergeConfig: blank password keeps the existing secret', () => {
  const merged = mergeConfig({ url: 'old', apiKey: 'keep' }, { url: 'new', apiKey: '' }, SCHEMA);
  assert.deepEqual(merged, { url: 'new', apiKey: 'keep' });
});

test('mergeConfig: ignores keys not in the schema', () => {
  const merged = mergeConfig({ url: 'a' }, { url: 'b', junk: 1 }, SCHEMA);
  assert.deepEqual(merged, { url: 'b' });
});

test('validateConfig: required, url shape, number, select, multiselect', () => {
  assert.deepEqual(validateConfig(SCHEMA, { url: 'http://x', apiKey: 'k' }), []);

  const errs = validateConfig(SCHEMA, { url: 'ftp://x', apiKey: '', limit: 'NaNish', mode: 'z', views: ['x', 'nope'] });
  assert.ok(errs.some((e) => /URL must start with http/.test(e)));
  assert.ok(errs.some((e) => /API key is required/.test(e)));
  assert.ok(errs.some((e) => /Limit must be a number/.test(e)));
  assert.ok(errs.some((e) => /Mode must be one of a, b/.test(e)));
  assert.ok(errs.some((e) => /unknown option: nope/.test(e)));
});

test('validateConfig: empty schema accepts anything', () => {
  assert.deepEqual(validateConfig({}, { whatever: true }), []);
});
