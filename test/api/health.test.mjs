import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';

describe('health + static shell', () => {
  let s;
  before(async () => { s = await startServer(null); });
  after(() => s.stop());

  it('GET /healthz -> ok', async () => {
    const r = await s.request('/healthz');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { status: 'ok' });
  });

  it('serves the SPA shell at /', async () => {
    const r = await s.request('/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(r.text, /<div id="app"><\/div>/);
    assert.match(r.text, /src="\/app\.js"/);
  });

  it('serves the bundled app.js and it contains the background fix', async () => {
    const r = await s.request('/app.js');
    assert.equal(r.status, 200);
    assert.match(r.text, /document\.body\.toggleAttribute\("data-has-bg"/);
  });

  it('serves style.css and the service worker', async () => {
    assert.equal((await s.request('/style.css')).status, 200);
    const sw = await s.request('/sw.js');
    assert.equal(sw.status, 200);
    assert.match(sw.text, /selfdash-shell/);
  });

  it('unknown API route -> 404', async () => {
    const r = await s.request('/api/does-not-exist');
    assert.equal(r.status, 404);
  });
});
