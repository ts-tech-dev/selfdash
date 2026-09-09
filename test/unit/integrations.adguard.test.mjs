import test from 'node:test';
import assert from 'node:assert/strict';
import AdguardIntegration from '../../src/integrations/adguard.integration.js';

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

const STATS = {
  num_dns_queries: 10000,
  num_blocked_filtering: 1500,
  avg_processing_time: 0.023,
  top_blocked_domains: [{ 'ads.example.com': 42 }, { 'track.net': 7 }],
};

test('adguard stats: query counts, computed block %, latency in ms, protection flag', async () => {
  const http = makeHttp([
    ['/control/stats', STATS],
    ['/control/status', { protection_enabled: true }],
  ]);
  const { byView } = await new AdguardIntegration().fetchData({ config: { url: 'http://ag.local/' }, http });

  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Queries', value: 10000 },
      { label: 'Blocked', value: 1500 },
      { label: 'Blocked %', value: '15.0%' },
      { label: 'Avg latency', value: '23 ms' },
      { label: 'Protection', value: 'on' },
    ],
  });
});

test('adguard stats: protection reads "off" only when explicitly disabled; a failed /status defaults to "on"', async () => {
  const off = makeHttp([
    ['/control/stats', STATS],
    ['/control/status', { protection_enabled: false }],
  ]);
  const a = await new AdguardIntegration().fetchData({ config: { url: 'http://ag.local' }, http: off });
  assert.equal(a.byView.stats.items.at(-1).value, 'off');

  const noStatus = makeHttp([
    ['/control/stats', STATS],
    [
      '/control/status',
      () => {
        throw new Error('500');
      },
    ],
  ]);
  const b = await new AdguardIntegration().fetchData({ config: { url: 'http://ag.local' }, http: noStatus });
  assert.equal(b.byView.stats.items.at(-1).value, 'on');
});

test('adguard blocked: maps the single-key {domain: count} objects to a list', async () => {
  const http = makeHttp([
    ['/control/stats', STATS],
    ['/control/status', {}],
  ]);
  const { byView } = await new AdguardIntegration().fetchData({ config: { url: 'http://ag.local' }, http });
  assert.deepEqual(byView.blocked, {
    type: 'list',
    items: [
      { title: 'ads.example.com', subtitle: '42 hits' },
      { title: 'track.net', subtitle: '7 hits' },
    ],
  });
});

test('adguard: HTTP basic auth header only when a username is configured', async () => {
  const anon = makeHttp([
    ['/control/stats', STATS],
    ['/control/status', {}],
  ]);
  await new AdguardIntegration().fetchData({ config: { url: 'http://ag.local' }, http: anon });
  assert.equal(anon.calls[0].opts.headers.Authorization, undefined);

  const authed = makeHttp([
    ['/control/stats', STATS],
    ['/control/status', {}],
  ]);
  await new AdguardIntegration().fetchData({ config: { url: 'http://ag.local', username: 'admin', password: 'pw' }, http: authed });
  const expected = `Basic ${Buffer.from('admin:pw').toString('base64')}`;
  assert.ok(authed.calls.every((c) => c.opts.headers.Authorization === expected));
});

test('adguard exposes stats + blocked views and merges in the dns group', () => {
  assert.equal(AdguardIntegration.mergeGroup, 'dns');
  assert.deepEqual(Object.keys(AdguardIntegration.views), ['stats', 'blocked']);
});
