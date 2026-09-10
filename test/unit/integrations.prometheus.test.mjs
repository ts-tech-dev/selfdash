import test from 'node:test';
import assert from 'node:assert/strict';
import PrometheusIntegration from '../../src/integrations/prometheus.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        if (url.includes(match)) {
          if (payload instanceof Error) throw payload;
          return typeof payload === 'function' ? payload() : payload;
        }
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url, extra = {}) => ({ url, ...extra });

const targets = (arr) => ({ status: 'success', data: { activeTargets: arr } });
const alerts = (arr) => ({ status: 'success', data: { alerts: arr } });

test('prometheus stats: counts up/down targets and firing (not pending) alerts', async () => {
  const http = makeHttp([
    ['/api/v1/targets', targets([
      { health: 'up', labels: { job: 'node' } },
      { health: 'up', labels: { job: 'node' } },
      { health: 'down', labels: { job: 'cadvisor' }, lastError: 'connection refused' },
      { health: 'unknown', labels: { job: 'blackbox' } },
    ])],
    ['/api/v1/alerts', alerts([{ state: 'firing' }, { state: 'pending' }, { state: 'firing' }])],
  ]);
  const { byView } = await new PrometheusIntegration().fetchData({ config: cfg('http://pm-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Targets up', value: 2 },
      { label: 'Targets down', value: 2 },
      { label: 'Alerts firing', value: 2 },
    ],
  });
});

test('prometheus stats: a broken /alerts call is caught (0 firing), targets still counted', async () => {
  const http = makeHttp([
    ['/api/v1/targets', targets([{ health: 'up' }])],
    ['/api/v1/alerts', new Error('alerting not enabled')],
  ]);
  const { byView } = await new PrometheusIntegration().fetchData({ config: cfg('http://pm-b.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Targets up', value: 1 },
    { label: 'Targets down', value: 0 },
    { label: 'Alerts firing', value: 0 },
  ]);
});

test('prometheus down: lists unhealthy targets with the last scrape error, or an all-clear row', async () => {
  const http = makeHttp([
    ['/api/v1/targets', targets([
      { health: 'up', labels: { job: 'node' } },
      { health: 'down', labels: { job: 'cadvisor', instance: 'box:8080' }, lastError: 'context deadline exceeded' },
    ])],
    ['/api/v1/alerts', alerts([])],
  ]);
  const { byView } = await new PrometheusIntegration().fetchData({ config: cfg('http://pm-c.local'), http });
  assert.deepEqual(byView.down.items, [{ title: 'cadvisor', subtitle: 'context deadline exceeded' }]);

  const clean = makeHttp([
    ['/api/v1/targets', targets([{ health: 'up', labels: { job: 'node' } }])],
    ['/api/v1/alerts', alerts([])],
  ]);
  const { byView: c } = await new PrometheusIntegration().fetchData({ config: cfg('http://pm-d.local'), http: clean });
  assert.deepEqual(c.down.items, [{ title: 'All targets up' }]);
});

test('prometheus: sends basic auth only when a username is set', async () => {
  const withAuth = makeHttp([
    ['/api/v1/targets', targets([])],
    ['/api/v1/alerts', alerts([])],
  ]);
  await new PrometheusIntegration().fetchData({ config: cfg('http://pm-e.local', { username: 'u', password: 'p' }), http: withAuth });
  const expected = `Basic ${Buffer.from('u:p').toString('base64')}`;
  assert.ok(withAuth.calls.every((c) => c.opts.headers.Authorization === expected));

  const noAuth = makeHttp([
    ['/api/v1/targets', targets([])],
    ['/api/v1/alerts', alerts([])],
  ]);
  await new PrometheusIntegration().fetchData({ config: cfg('http://pm-f.local'), http: noAuth });
  assert.ok(noAuth.calls.every((c) => c.opts.headers.Authorization === undefined));
});

test('prometheus: an error-status API body rejects the poll', async () => {
  const http = makeHttp([['/api/v1/targets', { status: 'error', error: 'bad query' }]]);
  await assert.rejects(() => new PrometheusIntegration().fetchData({ config: cfg('http://pm-g.local'), http }), /bad query/);
});
