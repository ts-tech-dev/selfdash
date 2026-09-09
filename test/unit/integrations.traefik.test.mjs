import test from 'node:test';
import assert from 'node:assert/strict';
import TraefikIntegration from '../../src/integrations/traefik.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [frag, payload] of routes) {
        if (url.includes(frag)) return typeof payload === 'function' ? payload(url) : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const OVERVIEW = {
  http: {
    routers: { total: 10, warnings: 0, errors: 1 },
    services: { total: 8, warnings: 1, errors: 2 },
    middlewares: { total: 5, warnings: 0, errors: 0 },
  },
  tcp: { routers: { total: 3 }, services: { total: 2 } },
};

test('traefik stats: maps /api/overview totals and sums the error counts', async () => {
  const http = makeHttp([['/api/overview', OVERVIEW]]);
  const { byView } = await new TraefikIntegration().fetchData({ config: { url: 'http://traefik:8080/' }, http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'HTTP routers', value: 10 },
      { label: 'HTTP services', value: 8 },
      { label: 'Middlewares', value: 5 },
      { label: 'TCP routers', value: 3 },
      { label: 'Errors', value: 3 },
    ],
  });
});

test('traefik stats: a bare {} overview yields all zeros, not a crash', async () => {
  const http = makeHttp([['/api/overview', {}]]);
  const { byView } = await new TraefikIntegration().fetchData({ config: { url: 'http://traefik:8080' }, http });
  assert.deepEqual(
    byView.stats.items.map((i) => i.value),
    [0, 0, 0, 0, 0]
  );
});

test('traefik: basic-auth header only when a username is set', async () => {
  const anon = makeHttp([['/api/overview', OVERVIEW]]);
  await new TraefikIntegration().fetchData({ config: { url: 'http://traefik:8080' }, http: anon });
  assert.equal(anon.calls[0].opts.headers.Authorization, undefined);

  const authed = makeHttp([['/api/overview', OVERVIEW]]);
  await new TraefikIntegration().fetchData({ config: { url: 'http://traefik:8080', username: 'u', password: 'p' }, http: authed });
  assert.equal(authed.calls[0].opts.headers.Authorization, `Basic ${Buffer.from('u:p').toString('base64')}`);
});
