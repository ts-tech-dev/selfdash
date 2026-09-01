import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCrypto } from '../../src/lib/crypto.js';

test('makeCrypto: no secret -> null (plaintext passthrough contract)', () => {
  assert.equal(makeCrypto(null), null);
  assert.equal(makeCrypto(''), null);
  assert.equal(makeCrypto(undefined), null);
});

test('makeCrypto: round-trips utf-8 through AES-256-GCM', () => {
  const c = makeCrypto('hunter2');
  const plain = JSON.stringify({ apiKey: 'sk-àéî-🔑', host: 'http://x' });
  const enc = c.encrypt(plain);
  assert.notEqual(enc, plain);
  assert.equal(c.decrypt(enc), plain);
});

test('makeCrypto: ciphertext is non-deterministic (random IV)', () => {
  const c = makeCrypto('s');
  assert.notEqual(c.encrypt('same'), c.encrypt('same'));
});

test('makeCrypto: wrong key or tampered payload fails to decrypt', () => {
  const a = makeCrypto('key-a');
  const b = makeCrypto('key-b');
  const enc = a.encrypt('secret');
  assert.throws(() => b.decrypt(enc));

  const buf = Buffer.from(enc, 'base64');
  buf[buf.length - 1] ^= 0xff;
  assert.throws(() => a.decrypt(buf.toString('base64')));
});
