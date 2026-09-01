import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';
import { startServer } from '../helpers/server.mjs';

describe('config export / import (YAML)', () => {
  let s;
  before(async () => { s = await startServer(null, { appSecret: 'cfg-secret' }); });
  after(() => s.stop());

  async function seed() {
    const page = (await s.request('/api/pages')).body[0];
    await s.request(`/api/pages/${page.id}/tiles`, { method: 'POST', body: { type: 'link', title: 'R', url: 'https://r.example' } });
    await s.request(`/api/pages/${page.id}/tiles`, { method: 'POST', body: { type: 'clock', config: { format: '12h' } } });
    await s.request('/api/pages', { method: 'POST', body: { name: 'Second' } });
    await s.request('/api/settings', { method: 'PATCH', body: { site_title: 'Exported Lab', theme: 'nord' } });
    await s.request('/api/integrations', { method: 'POST', body: { key: 'gluetun', name: 'vpn', config: { url: 'http://127.0.0.1:8000', apiKey: 'sikrit' } } });
  }

  it('GET /api/config/export returns YAML with pages, tiles, settings and secret placeholders', async () => {
    await seed();
    const res = await fetch(`${s.base}/api/config/export`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /yaml/);
    const doc = parseYaml(await res.text());

    assert.equal(doc.version, 1);
    assert.equal(doc.settings.site_title, 'Exported Lab');
    assert.equal(doc.pages.length, 2);
    assert.ok(doc.pages[0].tiles.length >= 2);
    // password field exported as a ${SELFDASH_SECRET_*} placeholder, never the value
    const integ = doc.integrations.find((i) => i.key === 'gluetun');
    assert.match(integ.config.apiKey, /^\$\{SELFDASH_SECRET_.*\}$/);
    assert.ok(!JSON.stringify(doc).includes('sikrit'));
  });

  it('POST /api/config/import (raw YAML body) replaces everything transactionally', async () => {
    const yaml = await (await fetch(`${s.base}/api/config/export`)).text();

    // wipe: add noise first, then import should overwrite it
    await s.request('/api/pages', { method: 'POST', body: { name: 'Noise' } });

    const res = await fetch(`${s.base}/api/config/import`, {
      method: 'POST',
      headers: { 'content-type': 'text/yaml' },
      body: yaml,
    });
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.ok, true);
    assert.equal(out.pages, 2);
    assert.ok(out.integrations >= 1);

    const pages = (await s.request('/api/pages')).body;
    assert.deepEqual(pages.map((p) => p.name).sort(), ['Home', 'Second']);
    assert.equal((await s.request('/api/settings')).body.site_title, 'Exported Lab');
  });

  it('POST /api/config/import rejects an empty body and a wrong version', async () => {
    const empty = await fetch(`${s.base}/api/config/import`, { method: 'POST', headers: { 'content-type': 'text/yaml' }, body: '   ' });
    assert.equal(empty.status, 400);

    const badVer = await fetch(`${s.base}/api/config/import`, {
      method: 'POST',
      headers: { 'content-type': 'text/yaml' },
      body: 'version: 9\npages: []\n',
    });
    assert.equal(badVer.status, 400);
  });

  it('POST /api/config/import?settings=0 leaves settings untouched', async () => {
    await s.request('/api/settings', { method: 'PATCH', body: { site_title: 'Keep Me' } });
    const yaml = 'version: 1\nsettings:\n  site_title: Should Not Apply\npages:\n  - name: Only\n    slug: only\n    tiles: []\n';
    const res = await fetch(`${s.base}/api/config/import?settings=0`, { method: 'POST', headers: { 'content-type': 'text/yaml' }, body: yaml });
    assert.equal(res.status, 200);
    assert.equal((await s.request('/api/settings')).body.site_title, 'Keep Me');
  });
});
