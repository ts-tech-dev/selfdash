import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadIntegrations } from '../../src/integrations/_registry.js';
import { validateConfig } from '../../src/integrations/configCodec.js';
import { makeTmpDir } from '../helpers/tmpdir.mjs';

const SRC = join(import.meta.dirname, '..', '..', 'src', 'integrations');
const shippedFiles = readdirSync(SRC).filter((f) => f.endsWith('.integration.js'));

test('every shipped *.integration.js file registers under its static key', async (t) => {
  const { dir, cleanup } = makeTmpDir();
  t.after(cleanup);
  const registry = await loadIntegrations(dir);

  assert.ok(registry.size >= shippedFiles.length, 'registry has at least the shipped integrations');

  for (const [key, Cls] of registry) {
    assert.equal(typeof key, 'string');
    assert.equal(Cls.key, key, `${key}: static key matches map key`);
    assert.ok(Cls.configSchema && Array.isArray(Cls.configSchema.fields), `${key}: has a configSchema.fields array`);
    assert.equal(typeof Cls.prototype.fetchData, 'function', `${key}: implements fetchData()`);
  }
});

test('each integration config schema is well-formed', async (t) => {
  const { dir, cleanup } = makeTmpDir();
  t.after(cleanup);
  const registry = await loadIntegrations(dir);

  for (const [key, Cls] of registry) {
    for (const field of Cls.configSchema.fields) {
      assert.ok(field.name, `${key}: every field has a name`);
      assert.ok(field.type, `${key}: field ${field.name} has a type`);
      if (field.type === 'select' || field.type === 'multiselect') {
        assert.ok(Array.isArray(field.options), `${key}: ${field.name} select has options[]`);
      }
    }
    // Validating an empty config must never throw, and must flag every required field.
    const errs = validateConfig(Cls, {});
    const requiredFields = Cls.configSchema.fields.filter((f) => f.required);
    assert.ok(Array.isArray(errs));
    assert.ok(
      errs.length >= requiredFields.length,
      `${key}: ${requiredFields.length} required field(s) but only ${errs.length} error(s)`
    );
  }
});

test('a runtime-dropped integration overrides a shipped key', async (t) => {
  const { dir, cleanup } = makeTmpDir();
  t.after(cleanup);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(join(dir, 'integrations'), { recursive: true });
  writeFileSync(
    join(dir, 'integrations', 'gluetun.integration.js'),
    `export default class { static key = 'gluetun'; static title = 'OVERRIDDEN'; async fetchData() { return {}; } static configSchema = { fields: [] }; }`
  );
  const registry = await loadIntegrations(dir);
  assert.equal(registry.get('gluetun').title, 'OVERRIDDEN');
});
