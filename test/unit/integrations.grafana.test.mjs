import test from 'node:test';
import assert from 'node:assert/strict';
import GrafanaIntegration from '../../src/integrations/grafana.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        const hit = typeof match === 'function' ? match(url) : url.includes(match);
        if (hit) return typeof payload === 'function' ? payload() : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, apiKey: 'tok' });

function baseRoutes(over = {}) {
  return [
    ['/api/search', over.dashboards ?? []],
    ['/api/datasources', over.datasources ?? []],
    ['/api/alertmanager/grafana/api/v2/alerts', over.alerts ?? []],
  ];
}

test('grafana stats: counts dashboards/datasources and only "active" alerts as firing', async () => {
  const http = makeHttp(
    baseRoutes({
      dashboards: [{ id: 1 }, { id: 2 }],
      datasources: [{ id: 1 }],
      alerts: [
        { status: { state: 'active' }, labels: { alertname: 'HighCPU' } },
        { status: { state: 'suppressed' }, labels: { alertname: 'Ignored' } },
      ],
    })
  );
  const { byView } = await new GrafanaIntegration().fetchData({ config: cfg('http://grafana-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Dashboards', value: 2 },
      { label: 'Data sources', value: 1 },
      { label: 'Alerts firing', value: 1 },
    ],
  });
});

test('grafana alerts: lists firing alerts with a summary/severity subtitle, or a clean-state row', async () => {
  const http = makeHttp(
    baseRoutes({
      alerts: [{ status: { state: 'active' }, labels: { alertname: 'HighCPU', severity: 'critical' }, annotations: { summary: 'CPU > 90%' } }],
    })
  );
  const { byView } = await new GrafanaIntegration().fetchData({ config: cfg('http://grafana-b.local'), http });
  assert.deepEqual(byView.alerts.items, [{ title: 'HighCPU', subtitle: 'CPU > 90%' }]);

  const httpClean = makeHttp(baseRoutes());
  const { byView: clean } = await new GrafanaIntegration().fetchData({ config: cfg('http://grafana-c.local'), http: httpClean });
  assert.deepEqual(clean.alerts.items, [{ title: 'No firing alerts' }]);
});

test('grafana: sends the service-account token as a bearer header', async () => {
  const http = makeHttp(baseRoutes());
  await new GrafanaIntegration().fetchData({ config: cfg('http://grafana-d.local'), http });
  assert.ok(http.calls.every((c) => c.opts.headers.Authorization === 'Bearer tok'));
});
