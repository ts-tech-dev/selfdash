import test from 'node:test';
import assert from 'node:assert/strict';
import NpmIntegration from '../../src/integrations/npm.integration.js';

// npm.integration.js keeps a module-level token cache keyed by (url, email), so each test
// uses its own url to stay independent.
function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts, method: opts?.method || 'GET' });
      for (const [match, payload] of routes) {
        const hit = typeof match === 'function' ? match(url) : match instanceof RegExp ? match.test(url) : url.includes(match);
        if (hit) return typeof payload === 'function' ? payload(url, opts) : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const future = () => new Date(Date.now() + 86400_000).toISOString();
const inDays = (n) => new Date(Date.now() + n * 86400_000).toISOString();

function baseRoutes(over = {}) {
  return [
    ['/api/tokens', () => ({ token: 'tok-1', expires: future() })],
    ['/api/nginx/proxy-hosts', over.proxy ?? []],
    ['/api/nginx/redirection-hosts', over.redir ?? []],
    ['/api/nginx/streams', over.streams ?? []],
    ['/api/nginx/dead-hosts', over.dead ?? []],
    ['/api/nginx/certificates', over.certs ?? []],
  ];
}

const cfg = (url) => ({ url, email: 'admin@example.com', password: 'changeme' });

test('npm stats: counts hosts, disabled and offline proxy hosts', async () => {
  const http = makeHttp(
    baseRoutes({
      proxy: [
        { id: 1, enabled: true, meta: { nginx_online: true } },
        { id: 2, enabled: false, meta: { nginx_online: true } },
        { id: 3, enabled: true, meta: { nginx_online: false } },
      ],
      redir: [{ id: 1 }, { id: 2 }],
      streams: [{ id: 1 }],
    })
  );
  const { byView } = await new NpmIntegration().fetchData({ config: cfg('http://npm-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Proxy hosts', value: 3 },
      { label: 'Redirections', value: 2 },
      { label: 'Streams', value: 1 },
      { label: 'Disabled', value: 1 },
      { label: 'Offline', value: 1 },
    ],
  });
});

test('npm certs: keeps only certs inside the window, sorted soonest-first, with a days-left subtitle', async () => {
  const http = makeHttp(
    baseRoutes({
      certs: [
        { id: 1, nice_name: 'far.example.com', expires_on: inDays(90) }, // outside default 30d
        { id: 2, nice_name: 'soon.example.com', expires_on: inDays(10) },
        { id: 3, domain_names: ['expired.example.com'], expires_on: inDays(-3) },
      ],
    })
  );
  const { byView } = await new NpmIntegration().fetchData({ config: cfg('http://npm-b.local'), http });
  assert.equal(byView.certs.type, 'list');
  assert.deepEqual(
    byView.certs.items.map((i) => i.title),
    ['expired.example.com', 'soon.example.com']
  );
  assert.match(byView.certs.items[0].subtitle, /expired/);
  assert.match(byView.certs.items[1].subtitle, /\(10d\)/);
});

test('npm certs: certDays widens the window', async () => {
  const http = makeHttp(baseRoutes({ certs: [{ id: 1, nice_name: 'q', expires_on: inDays(75) }] }));
  const { byView } = await new NpmIntegration().fetchData({ config: { ...cfg('http://npm-c.local'), certDays: 120 }, http });
  assert.equal(byView.certs.items.length, 1);
});

test('npm: the bearer token is fetched once and reused across polls', async () => {
  const http = makeHttp(baseRoutes());
  const config = cfg('http://npm-d.local');
  await new NpmIntegration().fetchData({ config, http });
  await new NpmIntegration().fetchData({ config, http });
  const logins = http.calls.filter((c) => c.url.includes('/api/tokens'));
  assert.equal(logins.length, 1, 'second poll reused the cached token');
});

test('npm: a 401 on a data call triggers exactly one re-auth, then succeeds', async () => {
  let proxyHits = 0;
  let logins = 0;
  const http = makeHttp([
    ['/api/tokens', () => ({ token: `tok-${++logins}`, expires: future() })],
    [
      '/api/nginx/proxy-hosts',
      () => {
        proxyHits += 1;
        if (proxyHits === 1) throw new Error('GET http://npm-e.local/api/nginx/proxy-hosts responded 401 Unauthorized');
        return [{ id: 1, enabled: true }];
      },
    ],
    ['/api/nginx/redirection-hosts', []],
    ['/api/nginx/streams', []],
    ['/api/nginx/dead-hosts', []],
    ['/api/nginx/certificates', []],
  ]);
  const { byView } = await new NpmIntegration().fetchData({ config: cfg('http://npm-e.local'), http });
  assert.equal(byView.stats.items[0].value, 1, 'recovered after re-auth');
  assert.equal(logins, 2, 'logged in once up front, once more after the 401');
});
