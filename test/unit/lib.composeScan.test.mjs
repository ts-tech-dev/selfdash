import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanComposeDir } from '../../src/lib/composeScan.js';
import { makeTmpDir } from '../helpers/tmpdir.mjs';

test('scanComposeDir: no directory configured', () => {
  const r = scanComposeDir(null);
  assert.equal(r.error, 'no directory configured');
  assert.deepEqual(r.stacks, []);
});

test('scanComposeDir: nonexistent path reports a read error', () => {
  const r = scanComposeDir('/no/such/place/really');
  assert.match(r.error, /cannot read/);
});

test('scanComposeDir: parses a stack, its services, ports and volumes', (t) => {
  const { dir, cleanup } = makeTmpDir();
  t.after(cleanup);
  mkdirSync(join(dir, 'media'), { recursive: true });
  writeFileSync(
    join(dir, 'media', 'docker-compose.yml'),
    [
      'services:',
      '  jellyfin:',
      '    image: jellyfin/jellyfin:latest',
      '    ports:',
      '      - "8096:8096"',
      '    volumes:',
      '      - ./config:/config',
    ].join('\n')
  );

  const r = scanComposeDir(dir);
  assert.equal(r.error, undefined);
  assert.equal(r.stacks.length, 1);
  const stack = r.stacks[0];
  assert.equal(stack.name, 'media');
  const svc = stack.services.find((s) => s.name === 'jellyfin');
  assert.ok(svc, 'jellyfin service parsed');
  assert.match(svc.image, /jellyfin/);
});

test('scanComposeDir: bad YAML is captured in errors[], not thrown', (t) => {
  const { dir, cleanup } = makeTmpDir();
  t.after(cleanup);
  writeFileSync(join(dir, 'compose.yaml'), 'services: [unclosed');
  const r = scanComposeDir(dir);
  assert.equal(r.stacks.length, 0);
  assert.equal(r.errors.length, 1);
});

test('scanComposeDir: interpolates ${VARS} from a sibling .env', (t) => {
  const { dir, cleanup } = makeTmpDir();
  t.after(cleanup);
  mkdirSync(join(dir, 'app'), { recursive: true });
  writeFileSync(join(dir, 'app', '.env'), 'TAG=1.2.3\n');
  writeFileSync(
    join(dir, 'app', 'compose.yaml'),
    'services:\n  web:\n    image: nginx:${TAG}\n'
  );
  const r = scanComposeDir(dir);
  assert.match(r.stacks[0].services[0].image, /nginx:1\.2\.3/);
});
