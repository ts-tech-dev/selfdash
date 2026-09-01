import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import unzipper from 'unzipper';
import { startServer } from '../helpers/server.mjs';

describe('backup export', () => {
  let s;
  before(async () => { s = await startServer(null); });
  after(() => s.stop());

  it('GET /api/backup/export streams a zip containing the db + manifest', async () => {
    const res = await fetch(`${s.base}/api/backup/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/zip/);
    assert.match(res.headers.get('content-disposition'), /selfdash-backup-\d{4}-\d{2}-\d{2}\.zip/);

    const buf = Buffer.from(await res.arrayBuffer());
    const dir = await unzipper.Open.buffer(buf);
    const names = dir.files.map((f) => f.path);
    assert.ok(names.includes('selfdash.db'));
    assert.ok(names.includes('manifest.json'));

    const manifest = JSON.parse(await dir.files.find((f) => f.path === 'manifest.json').buffer());
    assert.equal(manifest.version, 1);
    assert.ok(manifest.files.some((f) => f.path === 'selfdash.db' && f.size > 0));
  });
});

describe('backup import', () => {
  let s;
  before(async () => { s = await startServer(null); });
  after(() => s.stop());

  const post = (blob, filename) => {
    const form = new FormData();
    form.append('file', blob, filename);
    return fetch(`${s.base}/api/backup/import`, { method: 'POST', body: form });
  };

  it('rejects a non-zip file', async () => {
    const res = await post(new Blob(['not a zip']), 'notes.txt');
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /expected a \.zip/);
  });

  it('rejects a zip that has no selfdash.db', async () => {
    // minimal empty zip (End Of Central Directory record only)
    const emptyZip = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
    const res = await post(new Blob([emptyZip], { type: 'application/zip' }), 'bad.zip');
    assert.equal(res.status, 400);
  });

  it('round-trips: a real exported backup restores and the process exits for a clean reboot', async () => {
    // mutate state so we can prove the restore reverted it later would need a fresh server;
    // here we just assert the documented success contract: 200 {ok:true} then process exit.
    const exported = Buffer.from(await (await fetch(`${s.base}/api/backup/export`)).arrayBuffer());
    const res = await post(new Blob([exported], { type: 'application/zip' }), 'selfdash-backup-2026-01-01.zip');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);

    // backup import intentionally calls process.exit(0) ~500ms later so Docker restarts it.
    await sleep(1500);
    assert.equal(s.child.exitCode, 0, 'server exited 0 after a successful import');
  });
});
