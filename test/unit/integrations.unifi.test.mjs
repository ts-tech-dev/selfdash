import test from 'node:test';
import assert from 'node:assert/strict';
import UnifiIntegration from '../../src/integrations/unifi.integration.js';

function makeHttp({ clients = [], devices = [], apiKeyMode = false } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, opts) => {
      calls.push({ url, opts, kind: 'fetch' });
      if (url.endsWith('/api/login')) {
        return { ok: true, headers: { getSetCookie: () => ['unifises=abc123; Path=/'] } };
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    fetchJson: async (url, opts) => {
      calls.push({ url, opts, kind: 'fetchJson' });
      if (url.includes('/stat/sta')) return { data: clients };
      if (url.includes('/stat/device')) return { data: devices };
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const clients = [{ is_wired: true }, { is_wired: false }, { is_wired: false }];
const devices = [
  { type: 'uap', state: 1 },
  { type: 'uap', state: 0 },
  { type: 'ugw', state: 1 },
];

test('unifi stats (api key auth): counts wired/wifi clients, APs up, and WAN from the gateway', async () => {
  const http = makeHttp({ clients, devices });
  const { byView } = await new UnifiIntegration().fetchData({
    config: { url: 'http://unifi-a.local', apiKey: 'key123' },
    http,
  });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Wired clients', value: 1 },
      { label: 'WiFi clients', value: 2 },
      { label: 'APs up', value: '1/2' },
      { label: 'WAN', value: 'up' },
    ],
  });
  assert.ok(http.calls.every((c) => c.kind !== 'fetch'), 'api-key auth never logs in');
  assert.equal(http.calls[0].opts.headers['X-API-Key'], 'key123');
});

test('unifi stats (username/password auth): logs in once and reuses the session cookie', async () => {
  const http = makeHttp({ clients, devices });
  await new UnifiIntegration().fetchData({
    config: { url: 'http://unifi-b.local', username: 'admin', password: 'pw' },
    http,
  });
  const logins = http.calls.filter((c) => c.url.endsWith('/api/login'));
  assert.equal(logins.length, 1);
  const dataCalls = http.calls.filter((c) => c.kind === 'fetchJson');
  assert.ok(dataCalls.every((c) => c.opts.headers.Cookie === 'unifises=abc123'));
});

test('unifi: no gateway device found reports WAN as "unknown"', async () => {
  const http = makeHttp({ clients: [], devices: [{ type: 'uap', state: 1 }] });
  const { byView } = await new UnifiIntegration().fetchData({ config: { url: 'http://unifi-c.local', apiKey: 'k' }, http });
  assert.equal(byView.stats.items.find((i) => i.label === 'WAN').value, 'unknown');
});
