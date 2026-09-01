import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';
import { LINK_TILE, CLOCK_TILE } from '../helpers/fixtures.mjs';

describe('tiles API', () => {
  let s, pageId;
  before(async () => {
    s = await startServer(null);
    pageId = (await s.request('/api/pages')).body[0].id;
  });
  after(() => s.stop());

  const create = (body) => s.request(`/api/pages/${pageId}/tiles`, { method: 'POST', body });

  it('creates a link tile and echoes a parsed config object', async () => {
    const r = await create(LINK_TILE);
    assert.equal(r.status, 201);
    assert.equal(r.body.type, 'link');
    assert.equal(r.body.url, 'https://192.168.1.1');
    assert.equal(r.body.open_mode, 'newtab');
    assert.deepEqual(r.body.config, {});
  });

  it('rejects a link tile with no / bad url', async () => {
    assert.equal((await create({ type: 'link', title: 'x' })).status, 400);
    assert.equal((await create({ type: 'link', url: 'ftp://x' })).status, 400);
  });

  it('creates a panel tile (clock) with sanitized config, no url', async () => {
    const r = await create(CLOCK_TILE);
    assert.equal(r.status, 201);
    assert.equal(r.body.type, 'clock');
    assert.equal(r.body.url, null);
    assert.equal(r.body.config.format, '12h');
    assert.equal(r.body.config.showSeconds, true);
  });

  it('iframe open_mode builds an iframe config block', async () => {
    const r = await create({ type: 'link', url: 'https://grafana.local', open_mode: 'iframe', config: { aspectRatio: '4/3' } });
    assert.equal(r.body.open_mode, 'iframe');
    assert.equal(r.body.config.aspectRatio, '4/3');
    assert.equal(r.body.config.sandbox, 'allow-scripts allow-same-origin allow-forms allow-popups');
  });

  it('widget tile requires a real integration_id', async () => {
    const r = await create({ type: 'widget', integration_id: 424242 });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /integration_id/);
  });

  it('unknown type falls back to link (and then needs a url)', async () => {
    const r = await create({ type: 'wormhole', url: 'https://x.y' });
    assert.equal(r.status, 201);
    assert.equal(r.body.type, 'link');
  });

  it('clamps geometry on create', async () => {
    const r = await create({ type: 'clock', w: 99, h: -3, x: 50, y: -1 });
    assert.equal(r.body.w, 6);
    assert.equal(r.body.h, 1);
    assert.equal(r.body.x, 11);
    assert.equal(r.body.y, 0);
  });

  it('GET lists tiles for the page ordered by position', async () => {
    const r = await s.request(`/api/pages/${pageId}/tiles`);
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 5);
    const positions = r.body.map((t) => t.position);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  });

  it('PATCH updates a tile in place; type switch re-sanitizes', async () => {
    const { body: tile } = await create({ type: 'link', url: 'https://a.b' });
    const r = await s.request(`/api/tiles/${tile.id}`, {
      method: 'PATCH',
      body: { type: 'notes', config: { markdown: '# hi', group: 'Docs' } },
    });
    assert.equal(r.body.type, 'notes');
    assert.equal(r.body.url, null);
    assert.equal(r.body.config.markdown, '# hi');
    assert.equal(r.body.config.group, 'Docs');
  });

  it('POST /reorder sets positions from the given id order', async () => {
    const list = (await s.request(`/api/pages/${pageId}/tiles`)).body;
    const reversed = list.map((t) => t.id).reverse();
    const r = await s.request(`/api/pages/${pageId}/tiles/reorder`, { method: 'POST', body: { order: reversed } });
    assert.deepEqual(r.body, { ok: true });
    const after = (await s.request(`/api/pages/${pageId}/tiles`)).body.map((t) => t.id);
    assert.deepEqual(after, reversed);
  });

  it('POST /reorder rejects a non-array order', async () => {
    const r = await s.request(`/api/pages/${pageId}/tiles/reorder`, { method: 'POST', body: { order: 'nope' } });
    assert.equal(r.status, 400);
  });

  it('DELETE removes a tile; second delete -> 404', async () => {
    const { body: tile } = await create({ type: 'clock' });
    assert.equal((await s.request(`/api/tiles/${tile.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await s.request(`/api/tiles/${tile.id}`, { method: 'DELETE' })).status, 404);
  });

  it('POST to a missing page -> 404', async () => {
    const r = await s.request('/api/pages/999999/tiles', { method: 'POST', body: { type: 'clock' } });
    assert.equal(r.status, 404);
  });
});
