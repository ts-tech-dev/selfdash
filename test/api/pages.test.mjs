import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';

describe('pages API', () => {
  let s;
  before(async () => { s = await startServer(null); });
  after(() => s.stop());

  it('GET /api/pages returns the seeded Home page', async () => {
    const r = await s.request('/api/pages');
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].name, 'Home');
    assert.equal(r.body[0].slug, 'home');
    assert.deepEqual(r.body[0].options, {});
  });

  it('POST creates a page with a unique slug', async () => {
    const a = await s.request('/api/pages', { method: 'POST', body: { name: 'Media Center' } });
    assert.equal(a.status, 201);
    assert.equal(a.body.slug, 'media-center');

    const b = await s.request('/api/pages', { method: 'POST', body: { name: 'Media Center' } });
    assert.equal(b.body.slug, 'media-center-2');
  });

  it('POST rejects a blank name', async () => {
    const r = await s.request('/api/pages', { method: 'POST', body: { name: '  ' } });
    assert.equal(r.status, 400);
  });

  it('PATCH updates name, background and sanitizes options', async () => {
    const { body: page } = await s.request('/api/pages', { method: 'POST', body: { name: 'Tmp' } });
    const r = await s.request(`/api/pages/${page.id}`, {
      method: 'PATCH',
      body: {
        name: 'Renamed',
        background: 'https://example.com/bg.jpg',
        options: { grid: { columns: 99 }, background: { url: 'u', blur: 999 }, junk: 1 },
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'Renamed');
    assert.equal(r.body.background, 'https://example.com/bg.jpg');
    assert.equal(r.body.options.grid.columns, 12); // clamped
    assert.equal(r.body.options.background.blur, 40); // clamped
    assert.equal(r.body.options.junk, undefined); // dropped
  });

  it('PATCH options merges rather than replaces', async () => {
    const { body: page } = await s.request('/api/pages', { method: 'POST', body: { name: 'Merge' } });
    await s.request(`/api/pages/${page.id}`, { method: 'PATCH', body: { options: { customCss: '.a{}' } } });
    const r = await s.request(`/api/pages/${page.id}`, { method: 'PATCH', body: { options: { grid: { gap: 8 } } } });
    assert.equal(r.body.options.customCss, '.a{}');
    assert.equal(r.body.options.grid.gap, 8);
  });

  it('PATCH on a missing page -> 404', async () => {
    const r = await s.request('/api/pages/999999', { method: 'PATCH', body: { name: 'x' } });
    assert.equal(r.status, 404);
  });

  it('DELETE removes a page but refuses the last one', async () => {
    const { body: page } = await s.request('/api/pages', { method: 'POST', body: { name: 'Doomed' } });
    const del = await s.request(`/api/pages/${page.id}`, { method: 'DELETE' });
    assert.equal(del.status, 204);

    // delete everything down to one
    let pages = (await s.request('/api/pages')).body;
    for (const p of pages.slice(1)) await s.request(`/api/pages/${p.id}`, { method: 'DELETE' });
    pages = (await s.request('/api/pages')).body;
    assert.equal(pages.length, 1);
    const last = await s.request(`/api/pages/${pages[0].id}`, { method: 'DELETE' });
    assert.equal(last.status, 400);
  });
});
