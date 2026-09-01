import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';

describe('settings API', () => {
  let s;
  before(async () => { s = await startServer(null); });
  after(() => s.stop());

  it('GET returns the full default settings object', async () => {
    const r = await s.request('/api/settings');
    assert.equal(r.status, 200);
    assert.equal(r.body.theme, 'minimal');
    assert.equal(r.body.global_background, null);
    assert.equal(r.body.custom_js_enabled, false);
  });

  it('PATCH persists a valid subset and echoes the merged result', async () => {
    const r = await s.request('/api/settings', {
      method: 'PATCH',
      body: { site_title: 'Home Lab', accent: '#ff8800', global_background: '/uploads/x.png' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.site_title, 'Home Lab');
    assert.equal(r.body.accent, '#ff8800');
    assert.equal(r.body.global_background, '/uploads/x.png');
    // survives a reload
    assert.equal((await s.request('/api/settings')).body.site_title, 'Home Lab');
  });

  it('PATCH validates enum + format fields', async () => {
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { theme: 'neon' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { accent: 'orange' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { text_color: 'blue' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { text_color: '#abc' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { dark_mode: 'sepia' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { site_title: '' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { font_family: 'comic' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { locale: 'english' } })).status, 400);
  });

  it('PATCH clears nullable fields with null / empty string', async () => {
    await s.request('/api/settings', { method: 'PATCH', body: { global_background: '/uploads/x.png', favicon: '/f.png' } });
    const r = await s.request('/api/settings', { method: 'PATCH', body: { global_background: null, favicon: '' } });
    assert.equal(r.body.global_background, null);
    assert.equal(r.body.favicon, null);
  });

  it('PATCH text_color: accepts a hex, echoes it, clears with empty string', async () => {
    const set = await s.request('/api/settings', { method: 'PATCH', body: { text_color: '#10A37F' } });
    assert.equal(set.status, 200);
    assert.equal(set.body.text_color, '#10A37F');
    assert.equal((await s.request('/api/settings')).body.text_color, '#10A37F');
    const cleared = await s.request('/api/settings', { method: 'PATCH', body: { text_color: '' } });
    assert.equal(cleared.body.text_color, null);
  });

  it('PATCH truncates oversized custom CSS/JS instead of rejecting', async () => {
    const big = 'a'.repeat(60_000);
    const r = await s.request('/api/settings', { method: 'PATCH', body: { custom_css: big } });
    assert.equal(r.status, 200);
    assert.equal(r.body.custom_css.length, 40_000);
  });

  it('PATCH compose_scan_dir must be absolute', async () => {
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { compose_scan_dir: 'relative/path' } })).status, 400);
    assert.equal((await s.request('/api/settings', { method: 'PATCH', body: { compose_scan_dir: '/srv/stacks' } })).status, 200);
  });
});
