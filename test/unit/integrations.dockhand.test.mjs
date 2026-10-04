import test from 'node:test';
import assert from 'node:assert/strict';
import DockhandIntegration from '../../src/integrations/dockhand.integration.js';

// Shapes captured live from fnsys/dockhand 1.0.51 (socket environment, real update check):
// /api/dashboard/stats is an array with one entry per environment; pending updates need
// ?env=<id>; login sets a dockhand_session cookie; bad credentials are a plain 401.
const envStats = (id, name, { running, stopped, total, pendingUpdates, stacksRunning, stacksTotal, metrics }) => ({
  id,
  name,
  online: true,
  containers: { total, running, stopped, paused: 0, restarting: 0, unhealthy: 0, pendingUpdates },
  stacks: { total: stacksTotal, running: stacksRunning, partial: 0, stopped: stacksTotal - stacksRunning },
  metrics,
  images: { total: 10, totalSize: 1 },
  events: { total: 0, today: 0 },
});

const STATS = [
  envStats(1, 'local', { running: 30, stopped: 1, total: 31, pendingUpdates: 2, stacksRunning: 8, stacksTotal: 9, metrics: { cpuPercent: 4, memoryPercent: 20 } }),
  envStats(2, 'nas', { running: 5, stopped: 2, total: 7, pendingUpdates: 1, stacksRunning: 2, stacksTotal: 2, metrics: { cpuPercent: 10, memoryPercent: 50 } }),
];
const ENVS = [{ id: 1, name: 'local' }, { id: 2, name: 'nas' }];
const PENDING = {
  1: [
    { containerId: 'aaa', containerName: 'tautulli', currentImage: 'lscr.io/linuxserver/tautulli:latest', hasImageUpdate: true },
    { containerId: 'bbb', containerName: 'navidrome', currentImage: 'deluan/navidrome:latest', hasImageUpdate: true },
  ],
  2: [{ containerId: 'ccc', containerName: 'immich_server', currentImage: 'ghcr.io/immich-app/immich-server:v3', hasImageUpdate: true }],
};

function makeHttp({ stats = STATS, envs = ENVS, pending = PENDING, needAuth = false, loginOk = true } = {}) {
  const calls = [];
  const authed = (opts) => !needAuth || opts?.headers?.Authorization === 'Bearer dh_good' || opts?.headers?.Cookie === 'dockhand_session=s1';
  const deny = (url) => {
    throw new Error(`${url} responded 401 Unauthorized`);
  };
  return {
    calls,
    fetch: async (url, opts) => {
      calls.push({ url, opts, kind: 'fetch' });
      if (url.endsWith('/api/auth/login')) {
        return loginOk
          ? { ok: true, headers: { getSetCookie: () => ['dockhand_session=s1; Max-Age=86400; Path=/; HttpOnly'] } }
          : { ok: false, status: 401, headers: { getSetCookie: () => [] } };
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    fetchJson: async (url, opts) => {
      calls.push({ url, opts, kind: 'fetchJson' });
      if (!authed(opts)) deny(url);
      if (url.endsWith('/api/dashboard/stats')) return stats;
      if (url.endsWith('/api/environments')) return envs;
      const m = url.match(/\/api\/containers\/pending-updates\?env=(\d+)$/);
      if (m) return { environmentId: Number(m[1]), minimumReleaseAgeHours: 0, pendingUpdates: pending[m[1]] || [] };
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const run = (http, config) => new DockhandIntegration().fetchData({ config, http });

test('dockhand stats: sums containers/updates/stacks across environments and averages CPU/memory', async () => {
  const http = makeHttp();
  const { byView } = await run(http, { url: 'http://dockhand-a.local/' });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Running', value: 35 },
      { label: 'Stopped', value: 3 },
      { label: 'Total', value: 38 },
      { label: 'Updates', value: 3 },
      { label: 'Stacks', value: '10/11' },
      { label: 'CPU', value: '7.0%' },
      { label: 'Memory', value: '35.0%' },
    ],
  });
  const statsCall = http.calls.find((c) => c.url === 'http://dockhand-a.local/api/dashboard/stats');
  assert.ok(statsCall.opts.timeout > 10_000, 'stats call gets a longer timeout than the 10s default (it routinely takes ~10s)');
  assert.ok(http.calls.every((c) => c.kind !== 'fetch'), 'no credentials configured = anonymous, no login');
});

test('dockhand: environment filter matches by name (case-insensitive) or id', async () => {
  const byName = await run(makeHttp(), { url: 'http://dockhand-b.local', environment: 'NAS' });
  assert.deepEqual(byName.byView.stats.items[0], { label: 'Running', value: 5 });
  assert.deepEqual(byName.byView.updates.items, [{ title: 'immich_server', subtitle: 'ghcr.io/immich-app/immich-server:v3' }]);

  const byId = await run(makeHttp(), { url: 'http://dockhand-b.local', environment: '1' });
  assert.deepEqual(byId.byView.stats.items[3], { label: 'Updates', value: 2 });
});

test('dockhand: unknown environment is an error, not a silent zero', async () => {
  await assert.rejects(run(makeHttp(), { url: 'http://dockhand-c.local', environment: 'nope' }), /environment "nope" not found/);
});

test('dockhand stats: metrics null (not collected yet) shows 0% instead of throwing', async () => {
  const stats = [envStats(1, 'local', { running: 1, stopped: 0, total: 1, pendingUpdates: 0, stacksRunning: 0, stacksTotal: 0, metrics: null })];
  const { byView } = await run(makeHttp({ stats }), { url: 'http://dockhand-d.local' });
  assert.deepEqual(byView.stats.items.slice(5), [{ label: 'CPU', value: '0.0%' }, { label: 'Memory', value: '0.0%' }]);
});

test('dockhand updates: lists pending containers per environment, tagging the environment when there are several', async () => {
  const { byView } = await run(makeHttp(), { url: 'http://dockhand-e.local' });
  assert.deepEqual(byView.updates.items, [
    { title: 'tautulli', subtitle: 'lscr.io/linuxserver/tautulli:latest · local' },
    { title: 'navidrome', subtitle: 'deluan/navidrome:latest · local' },
    { title: 'immich_server', subtitle: 'ghcr.io/immich-app/immich-server:v3 · nas' },
  ]);
});

test('dockhand updates: none pending shows a single "all up to date" row', async () => {
  const { byView } = await run(makeHttp({ pending: {} }), { url: 'http://dockhand-f.local' });
  assert.deepEqual(byView.updates.items, [{ title: 'All containers up to date' }]);
});

test('dockhand auth: API token goes out as a Bearer header and never logs in', async () => {
  const http = makeHttp({ needAuth: true });
  const { byView } = await run(http, { url: 'http://dockhand-g.local', apiKey: 'dh_good', username: 'ignored' });
  assert.equal(byView.stats.items[0].value, 35);
  assert.ok(http.calls.every((c) => c.kind !== 'fetch'));
});

test('dockhand auth: username/password logs in once and reuses the session cookie for both views', async () => {
  const http = makeHttp({ needAuth: true });
  const config = { url: 'http://dockhand-h.local', username: 'admin', password: 'pw' };
  await run(http, config);
  await run(http, config);
  const logins = http.calls.filter((c) => c.url.endsWith('/api/auth/login'));
  assert.equal(logins.length, 1, 'concurrent first logins are deduped and the cookie is cached');
  assert.deepEqual(JSON.parse(logins[0].opts.body), { username: 'admin', password: 'pw', provider: 'local' });
});

test('dockhand auth: failures come back as readable errors', async () => {
  await assert.rejects(run(makeHttp({ needAuth: true }), { url: 'http://dockhand-i.local', apiKey: 'dh_bad' }), /rejected the API token/);
  await assert.rejects(run(makeHttp({ needAuth: true }), { url: 'http://dockhand-i.local' }), /requires authentication/);
  await assert.rejects(
    run(makeHttp({ needAuth: true, loginOk: false }), { url: 'http://dockhand-j.local', username: 'admin', password: 'x' }),
    /login failed/,
  );
});

test('dockhand containerUpdates (hidden, feeds tile badges): rows per environment, sharing one pending-updates fetch per poll', async () => {
  const http = makeHttp();
  const result = await run(http, { url: 'http://dockhand-k.local' });
  assert.deepEqual(Object.keys(result.byView), ['stats', 'updates'], 'not a tile view');
  assert.deepEqual(DockhandIntegration.views, { stats: 'Container stats', updates: 'Pending updates' });
  assert.deepEqual(result.hidden.containerUpdates.items, [
    { name: 'tautulli', image: 'lscr.io/linuxserver/tautulli:latest', environment: 'local' },
    { name: 'navidrome', image: 'deluan/navidrome:latest', environment: 'local' },
    { name: 'immich_server', image: 'ghcr.io/immich-app/immich-server:v3', environment: 'nas' },
  ]);
  const pendingCalls = http.calls.filter((c) => c.url.includes('/pending-updates?env=1'));
  assert.equal(pendingCalls.length, 1, 'updates list and containerUpdates share the per-poll fetch');
});
