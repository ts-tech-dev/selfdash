import test from 'node:test';
import assert from 'node:assert/strict';
import PiholeIntegration from '../../src/integrations/pihole.integration.js';

function makeHttp(routes) {
  const calls = [];
  const fetchCalls = [];
  const resolve = (url) => {
    for (const [match, payload] of routes) {
      const hit = typeof match === 'function' ? match(url) : match instanceof RegExp ? match.test(url) : url.includes(match);
      if (hit) return typeof payload === 'function' ? payload(url) : payload;
    }
    throw new Error(`unrouted: ${url}`);
  };
  return {
    calls,
    fetchCalls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      return resolve(url);
    },
    fetch: async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, status: 200, json: async () => resolve(url) };
    },
  };
}

const V6_SUMMARY = {
  queries: { total: 12345, blocked: 2469, percent_blocked: 20.0 },
  clients: { active: 7, total: 12 },
  gravity: { domains_being_blocked: 1234567 },
};

test('pihole v6: authenticates, maps /api/stats/summary, sends X-FTL-SID, frees the session', async () => {
  const http = makeHttp([
    ['/api/auth', { session: { sid: 'sid-abc', valid: true } }],
    ['/api/stats/summary', V6_SUMMARY],
  ]);
  const { byView } = await new PiholeIntegration().fetchData({ config: { url: 'http://pi.hole/' }, http });

  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Queries', value: 12345 },
      { label: 'Blocked', value: 2469 },
      { label: 'Blocked %', value: '20.0%' },
      { label: 'Domains', value: 1234567 },
      { label: 'Clients', value: 7 },
    ],
  });

  const summaryCall = http.calls.find((c) => c.url.includes('/api/stats/summary'));
  assert.equal(summaryCall.opts.headers['X-FTL-SID'], 'sid-abc');

  const del = http.fetchCalls.find((c) => c.url.includes('/api/auth') && c.opts.method === 'DELETE');
  assert.ok(del, 'the session is deleted afterwards');
  assert.equal(del.opts.headers['X-FTL-SID'], 'sid-abc');
});

test('pihole v6: a passwordless box (sid null, valid true) still reads the summary, no SID header, no delete', async () => {
  const http = makeHttp([
    ['/api/auth', { session: { sid: null, valid: true } }],
    ['/api/stats/summary', V6_SUMMARY],
  ]);
  const { byView } = await new PiholeIntegration().fetchData({ config: { url: 'http://pi.hole' }, http });
  assert.equal(byView.stats.items[0].value, 12345);

  const summaryCall = http.calls.find((c) => c.url.includes('/api/stats/summary'));
  assert.equal(summaryCall.opts.headers['X-FTL-SID'], undefined);
  assert.equal(http.fetchCalls.length, 0, 'nothing to delete without a sid');
});

test('pihole v5: falls back to /admin/api.php?summaryRaw when v6 /api/auth is absent', async () => {
  const http = makeHttp([
    [
      '/api/auth',
      () => {
        throw new Error('/api/auth responded 404 Not Found');
      },
    ],
    [
      '/admin/api.php',
      {
        dns_queries_today: 8000,
        ads_blocked_today: 800,
        ads_percentage_today: 10,
        domains_being_blocked: 900000,
        unique_clients: 4,
      },
    ],
  ]);
  const { byView } = await new PiholeIntegration().fetchData({ config: { url: 'http://pi.hole', password: 'tok' }, http });

  assert.deepEqual(byView.stats.items, [
    { label: 'Queries', value: 8000 },
    { label: 'Blocked', value: 800 },
    { label: 'Blocked %', value: '10.0%' },
    { label: 'Domains', value: 900000 },
    { label: 'Clients', value: 4 },
  ]);
  const v5Call = http.calls.find((c) => c.url.includes('/admin/api.php'));
  assert.ok(v5Call.url.includes('summaryRaw&auth=tok'), 'passes the API token as ?auth=');
});

test('pihole: when both APIs fail the poll rejects with a combined message', async () => {
  const http = makeHttp([
    [
      '/api/auth',
      () => {
        throw new Error('401 Unauthorized');
      },
    ],
    ['/admin/api.php', []], // PHP endpoint returns [] on a bad token
  ]);
  await assert.rejects(
    () => new PiholeIntegration().fetchData({ config: { url: 'http://pi.hole', password: 'x' }, http }),
    /Pi-hole v6:.*v5:/s
  );
});
