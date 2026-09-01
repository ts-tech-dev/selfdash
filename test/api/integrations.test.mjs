import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';
import { GLUETUN_INTEGRATION } from '../helpers/fixtures.mjs';

describe('integrations API', () => {
  let s;
  before(async () => { s = await startServer(null, { appSecret: 'test-secret-key' }); });
  after(() => s.stop());

  it('GET /available lists every shipped integration with a schema', async () => {
    const r = await s.request('/api/integrations/available');
    assert.equal(r.status, 200);
    assert.ok(r.body.length >= 10, `expected the shipped integration catalog, got ${r.body.length}`);
    for (const key of ['gluetun', 'sonarr', 'radarr', 'qbittorrent', 'plex']) {
      const found = r.body.find((i) => i.key === key);
      assert.ok(found, `catalog includes ${key}`);
      assert.ok(Array.isArray(found.configSchema.fields), `${key} has configSchema.fields`);
      assert.equal(typeof found.defaultInterval, 'number');
    }
  });

  it('GET /available exposes each integration\'s view catalog (view selection lives on the tile now)', async () => {
    const r = await s.request('/api/integrations/available');
    const gluetun = r.body.find((i) => i.key === 'gluetun');
    const radarr = r.body.find((i) => i.key === 'radarr');
    assert.deepEqual(gluetun.views, { status: 'VPN status' });
    assert.deepEqual(Object.keys(radarr.views), ['queue', 'stats', 'upcoming', 'calendar', 'history', 'health', 'disk']);

    // mergeGroup gates which integrations "Also include" can combine. Download clients
    // and *arr apps both expose a `queue` view but must not merge into each other.
    const byKey = Object.fromEntries(r.body.map((i) => [i.key, i]));
    assert.equal(byKey.qbittorrent.mergeGroup, 'download');
    assert.equal(byKey.sabnzbd.mergeGroup, 'download');
    assert.equal(byKey.radarr.mergeGroup, 'arr');
    assert.equal(byKey.sonarr.mergeGroup, 'arr');
    assert.equal(byKey.readarr.mergeGroup, 'arr');
    // integrations with no explicit group fall back to their own key (merge only with same type)
    assert.equal(byKey.gluetun.mergeGroup, 'gluetun');
    assert.equal(byKey.plex.mergeGroup, 'plex');
    // No integration schema carries the old "Show" field any more — it moved to the tile.
    for (const typeDef of r.body) {
      assert.ok(!typeDef.configSchema.fields.some((f) => f.name === 'views'), `${typeDef.key}: no views field in config schema`);
    }
  });

  it('POST rejects an unknown key', async () => {
    const r = await s.request('/api/integrations', { method: 'POST', body: { key: 'nope', config: {} } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /unknown integration key/);
  });

  it('POST validates required config fields', async () => {
    const r = await s.request('/api/integrations', { method: 'POST', body: { key: 'gluetun', config: {} } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /URL|required/i);
  });

  it('POST creates one; interval floors at POLL_MIN_INTERVAL; secrets are masked in the response', async () => {
    const r = await s.request('/api/integrations', {
      method: 'POST',
      body: { ...GLUETUN_INTEGRATION, config: { url: 'http://127.0.0.1:8000', apiKey: 'shhh' }, interval: 1 },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.key, 'gluetun');
    assert.equal(r.body.interval, 15); // floored
    assert.equal(r.body.enabled, true);
    assert.equal(r.body.config.url, 'http://127.0.0.1:8000');
    assert.equal(r.body.config.apiKey, true); // masked: only "is set"
    assert.equal(r.body.last_status, 'unknown');
  });

  it('GET lists integrations with masked config', async () => {
    const r = await s.request('/api/integrations');
    assert.ok(r.body.length >= 1);
    assert.equal(r.body[0].config.apiKey, true);
  });

  it('PATCH rename without touching config; blank password keeps the secret', async () => {
    const { body: created } = await s.request('/api/integrations', {
      method: 'POST',
      body: { key: 'gluetun', name: 'VPN A', config: { url: 'http://h:1', apiKey: 'keepme' } },
    });
    const r = await s.request(`/api/integrations/${created.id}`, {
      method: 'PATCH',
      body: { name: 'VPN B', config: { url: 'http://h:2', apiKey: '' } },
    });
    assert.equal(r.body.name, 'VPN B');
    assert.equal(r.body.config.url, 'http://h:2');
    assert.equal(r.body.config.apiKey, true); // still set
  });

  it('PATCH validates the merged config', async () => {
    const { body: created } = await s.request('/api/integrations', {
      method: 'POST',
      body: { key: 'gluetun', config: { url: 'http://h:1' } },
    });
    const r = await s.request(`/api/integrations/${created.id}`, { method: 'PATCH', body: { config: { url: 'not-a-url' } } });
    assert.equal(r.status, 400);
  });

  it('POST /:id/poll runs immediately and records a status', async () => {
    const { body: created } = await s.request('/api/integrations', {
      method: 'POST',
      body: { key: 'gluetun', config: { url: 'http://127.0.0.1:59999' } }, // nothing listening -> error status
    });
    const r = await s.request(`/api/integrations/${created.id}/poll`, { method: 'POST' });
    assert.equal(r.status, 200);
    // nothing is listening on that port, so the poll resolves to a failure status
    assert.ok(['error', 'unreachable'].includes(r.body.last_status), `got ${r.body.last_status}`);
    assert.ok(r.body.last_error);
  });

  it('DELETE removes it; second delete -> 404', async () => {
    const { body: created } = await s.request('/api/integrations', {
      method: 'POST',
      body: { key: 'gluetun', config: { url: 'http://h:1' } },
    });
    assert.equal((await s.request(`/api/integrations/${created.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await s.request(`/api/integrations/${created.id}`, { method: 'DELETE' })).status, 404);
  });

  it('DELETE prunes the integration from any tile that merged it in as an extra source', async () => {
    const primary = (
      await s.request('/api/integrations', { method: 'POST', body: { key: 'gluetun', name: 'Primary', config: { url: 'http://a:1' } } })
    ).body;
    const extra = (
      await s.request('/api/integrations', { method: 'POST', body: { key: 'gluetun', name: 'Extra', config: { url: 'http://b:1' } } })
    ).body;
    const pageId = (await s.request('/api/pages')).body[0].id;
    const tile = (
      await s.request(`/api/pages/${pageId}/tiles`, {
        method: 'POST',
        body: { type: 'widget', integration_id: primary.id, config: { views: ['status'], moreIntegrationIds: [extra.id] } },
      })
    ).body;
    assert.deepEqual(tile.config.moreIntegrationIds, [extra.id]);

    assert.equal((await s.request(`/api/integrations/${extra.id}`, { method: 'DELETE' })).status, 204);

    const after = (await s.request(`/api/pages/${pageId}/tiles`)).body.find((t) => t.id === tile.id);
    assert.equal(after.config.moreIntegrationIds, undefined, 'the deleted extra id no longer lingers in config');
    // The tile itself, and its primary binding, are untouched.
    assert.equal(after.integration_id, primary.id);
  });
});
