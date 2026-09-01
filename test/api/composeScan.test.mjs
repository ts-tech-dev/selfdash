import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from '../helpers/server.mjs';
import { makeTmpDir } from '../helpers/tmpdir.mjs';

describe('compose-scan API', () => {
  let s, stacks;
  before(async () => {
    s = await startServer(null);
    const { dir, cleanup } = makeTmpDir('selfdash-stacks-');
    stacks = dir;
    s._stacksCleanup = cleanup;
    mkdirSync(join(dir, 'web'), { recursive: true });
    writeFileSync(join(dir, 'web', 'docker-compose.yml'), 'services:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - "80:80"\n');
  });
  after(() => { s._stacksCleanup?.(); return s.stop(); });

  it('disabled by default', async () => {
    const r = await s.request('/api/compose-scan');
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, false);
    assert.equal(r.body.result, null);
  });

  it('enabled with no dir reports the missing-config state', async () => {
    await s.request('/api/settings', { method: 'PATCH', body: { compose_scan_enabled: true } });
    const r = await s.request('/api/compose-scan');
    assert.equal(r.body.enabled, true);
    assert.match(r.body.result.error, /no directory/);
  });

  it('scans a configured directory and lists the stack', async () => {
    await s.request('/api/settings', { method: 'PATCH', body: { compose_scan_enabled: true, compose_scan_dir: stacks } });
    const r = await s.request('/api/compose-scan?refresh=1');
    assert.equal(r.body.enabled, true);
    assert.equal(r.body.result.stacks.length, 1);
    assert.equal(r.body.result.stacks[0].name, 'web');
    assert.equal(r.body.result.stacks[0].services[0].image, 'nginx:alpine');
  });

  it('a settings change invalidates the cache (no stale "cached: true")', async () => {
    await s.request('/api/compose-scan'); // warm cache
    await s.request('/api/settings', { method: 'PATCH', body: { compose_scan_dir: stacks } });
    const r = await s.request('/api/compose-scan');
    assert.notEqual(r.body.cached, true);
  });
});
