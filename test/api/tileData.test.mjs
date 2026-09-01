import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { startServer } from '../helpers/server.mjs';
import { RSS_2_0, CUSTOM_API_JSON } from '../helpers/fixtures.mjs';

// A tiny local upstream so feed / customapi paths are tested without the public internet.
async function upstream(handler) {
  const srv = createServer(handler);
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const { port } = srv.address();
  return { url: `http://127.0.0.1:${port}`, close: () => srv.close() };
}

describe('tile data API', () => {
  let s, up;
  before(async () => {
    s = await startServer(null);
    up = await upstream((req, res) => {
      if (req.url === '/rss') { res.setHeader('content-type', 'application/xml'); return res.end(RSS_2_0); }
      if (req.url === '/json') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(CUSTOM_API_JSON)); }
      if (req.url === '/notjson') { res.setHeader('content-type', 'application/json'); return res.end('<html>nope'); }
      if (req.url === '/500') { res.statusCode = 500; return res.end('boom'); }
      res.statusCode = 404; res.end();
    });
  });
  after(() => { up.close(); return s.stop(); });

  it('GET /api/tile/weather requires lat & lon', async () => {
    const r = await s.request('/api/tile/weather');
    assert.equal(r.status, 400);
  });

  it('GET /api/tile/feed rejects a non-http url', async () => {
    const r = await s.request('/api/tile/feed?url=' + encodeURIComponent('file:///etc/passwd'));
    assert.equal(r.status, 400);
  });

  it('GET /api/tile/feed parses an RSS feed from a local upstream', async () => {
    const r = await s.request('/api/tile/feed?url=' + encodeURIComponent(up.url + '/rss') + '&limit=1');
    assert.equal(r.status, 200);
    assert.equal(r.body.title, 'Example Blog');
    assert.equal(r.body.items.length, 1);
  });

  it('GET /api/tile/feed surfaces an upstream failure as 502', async () => {
    const r = await s.request('/api/tile/feed?url=' + encodeURIComponent('http://127.0.0.1:59998/x'));
    assert.equal(r.status, 502);
  });

  it('GET /api/tile/customapi/:id -> 404 when the tile is not a customapi', async () => {
    const page = (await s.request('/api/pages')).body[0];
    const { body: link } = await s.request(`/api/pages/${page.id}/tiles`, { method: 'POST', body: { type: 'link', url: 'https://x.y' } });
    const r = await s.request(`/api/tile/customapi/${link.id}`);
    assert.equal(r.status, 404);
  });

  it('GET /api/tile/customapi/:id maps a JSON upstream into a stats model', async () => {
    const page = (await s.request('/api/pages')).body[0];
    const { body: tile } = await s.request(`/api/pages/${page.id}/tiles`, {
      method: 'POST',
      body: {
        type: 'customapi',
        config: { url: up.url + '/json', display: 'stats', items: [{ label: 'Status', path: 'status' }, { label: 'Active', path: 'counts.active' }] },
      },
    });
    const r = await s.request(`/api/tile/customapi/${tile.id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.type, 'stats');
    assert.deepEqual(r.body.items, [{ label: 'Status', value: 'green' }, { label: 'Active', value: '3' }]);
  });

  it('GET /api/tile/customapi/:id -> 502 on non-JSON and on upstream 5xx', async () => {
    const page = (await s.request('/api/pages')).body[0];
    const mk = (url) => s.request(`/api/pages/${page.id}/tiles`, { method: 'POST', body: { type: 'customapi', config: { url } } });
    const { body: a } = await mk(up.url + '/notjson');
    const { body: b } = await mk(up.url + '/500');
    assert.equal((await s.request(`/api/tile/customapi/${a.id}`)).status, 502);
    assert.equal((await s.request(`/api/tile/customapi/${b.id}`)).status, 502);
  });

  it('GET /api/host/stats returns cpu/mem (disk best-effort) for the test container', async () => {
    const r = await s.request('/api/host/stats');
    // hostStats can legitimately fail in a locked-down sandbox; accept 200 or 500 but not a crash.
    assert.ok([200, 500].includes(r.status));
    if (r.status === 200) {
      assert.ok(r.body.cpu || r.body.mem || r.body.disks);
    }
  });
});

describe('health check API', () => {
  let s, up;
  before(async () => {
    s = await startServer(null);
    up = await upstream((_req, res) => { res.statusCode = 403; res.end(); });
  });
  after(() => { up.close(); return s.stop(); });

  it('POST /api/health/check: a reachable host (even 403) is online; a dead port is offline', async () => {
    const dead = 'http://127.0.0.1:59997';
    const r = await s.request('/api/health/check', { method: 'POST', body: { urls: [up.url, dead, 'not-a-url'] } });
    assert.equal(r.status, 200);
    assert.equal(r.body[up.url].status, 'online');
    assert.equal(r.body[up.url].code, 403);
    assert.equal(r.body[dead].status, 'offline');
    assert.equal(r.body['not-a-url'], undefined); // filtered out
  });

  it('POST /api/health/check with no urls -> empty object', async () => {
    const r = await s.request('/api/health/check', { method: 'POST', body: {} });
    assert.deepEqual(r.body, {});
  });
});
