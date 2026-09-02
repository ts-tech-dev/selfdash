import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
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

  it("export/import round-trips a widget tile's moreIntegrationIds through integration refs, not raw ids", async () => {
    const page = (await s.request('/api/pages')).body[0];
    const primary = (
      await s.request('/api/integrations', { method: 'POST', body: { key: 'gluetun', name: 'Merge Primary', config: { url: 'http://p:1' } } })
    ).body;
    const extra = (
      await s.request('/api/integrations', { method: 'POST', body: { key: 'gluetun', name: 'Merge Extra', config: { url: 'http://e:1' } } })
    ).body;
    await s.request(`/api/pages/${page.id}/tiles`, {
      method: 'POST',
      body: { type: 'widget', integration_id: primary.id, config: { views: ['status'], moreIntegrationIds: [extra.id] } },
    });

    const doc = parseYaml(await (await fetch(`${s.base}/api/config/export`)).text());
    const tileDoc = doc.pages.flatMap((p) => p.tiles).find((t) => t.type === 'widget' && t.config?.moreIntegrationIds);
    assert.ok(tileDoc, 'exported doc has the widget tile with moreIntegrationIds');
    assert.equal(typeof tileDoc.config.moreIntegrationIds[0], 'string', 'exported as a portable ref, not a raw db id');
    const extraRef = doc.integrations.find((i) => i.name === 'Merge Extra').ref;
    assert.deepEqual(tileDoc.config.moreIntegrationIds, [extraRef]);

    // Re-import the exact exported doc (same pattern as the "replaces everything" test above):
    // every integration gets a fresh id, so a raw-id round-trip would silently point at the
    // wrong integration (or nothing) — the ref translation is what's under test here.
    const importRes = await fetch(`${s.base}/api/config/import`, {
      method: 'POST',
      headers: { 'content-type': 'text/yaml' },
      body: stringifyYaml(doc),
    });
    assert.equal(importRes.status, 200);

    const integrationsAfter = (await s.request('/api/integrations')).body;
    const newPrimary = integrationsAfter.find((i) => i.name === 'Merge Primary');
    const newExtra = integrationsAfter.find((i) => i.name === 'Merge Extra');
    const pageAfter = (await s.request('/api/pages')).body[0];
    const tilesAfter = (await s.request(`/api/pages/${pageAfter.id}/tiles`)).body;
    const widgetAfter = tilesAfter.find((t) => t.integration_id === newPrimary.id);
    assert.ok(widgetAfter, 'widget tile survived the reimport, bound to the new primary id');
    assert.deepEqual(widgetAfter.config.moreIntegrationIds, [newExtra.id]);
  });

  it("export/import round-trips a link tile's optional attached integration (combined link+integration tile)", async () => {
    const page = (await s.request('/api/pages')).body[0];
    const integ = (
      await s.request('/api/integrations', { method: 'POST', body: { key: 'gluetun', name: 'Linked Link', config: { url: 'http://g:1' } } })
    ).body;
    await s.request(`/api/pages/${page.id}/tiles`, {
      method: 'POST',
      body: { type: 'link', url: 'https://radarr.local', icon: 'di:radarr', integration_id: integ.id, config: { views: ['status'] } },
    });

    const doc = parseYaml(await (await fetch(`${s.base}/api/config/export`)).text());
    const tileDoc = doc.pages.flatMap((p) => p.tiles).find((t) => t.type === 'link' && t.integration);
    assert.ok(tileDoc, 'exported doc has the link tile with its attached integration');
    assert.equal(tileDoc.url, 'https://radarr.local');
    assert.equal(typeof tileDoc.integration, 'string', 'exported as a portable ref, not a raw db id');
    assert.deepEqual(tileDoc.config.views, ['status']);

    const importRes = await fetch(`${s.base}/api/config/import`, {
      method: 'POST',
      headers: { 'content-type': 'text/yaml' },
      body: stringifyYaml(doc),
    });
    assert.equal(importRes.status, 200);

    const integrationsAfter = (await s.request('/api/integrations')).body;
    const newInteg = integrationsAfter.find((i) => i.name === 'Linked Link');
    const pageAfter = (await s.request('/api/pages')).body[0];
    const tilesAfter = (await s.request(`/api/pages/${pageAfter.id}/tiles`)).body;
    const linkAfter = tilesAfter.find((t) => t.type === 'link' && t.integration_id === newInteg.id);
    assert.ok(linkAfter, 'link tile survived the reimport, bound to the new integration id');
    assert.equal(linkAfter.url, 'https://radarr.local');
    assert.deepEqual(linkAfter.config.views, ['status']);
  });

  it('POST /api/config/import?settings=0 leaves settings untouched', async () => {
    await s.request('/api/settings', { method: 'PATCH', body: { site_title: 'Keep Me' } });
    const yaml = 'version: 1\nsettings:\n  site_title: Should Not Apply\npages:\n  - name: Only\n    slug: only\n    tiles: []\n';
    const res = await fetch(`${s.base}/api/config/import?settings=0`, { method: 'POST', headers: { 'content-type': 'text/yaml' }, body: yaml });
    assert.equal(res.status, 200);
    assert.equal((await s.request('/api/settings')).body.site_title, 'Keep Me');
  });
});
