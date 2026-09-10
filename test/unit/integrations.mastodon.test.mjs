import test from 'node:test';
import assert from 'node:assert/strict';
import MastodonIntegration from '../../src/integrations/mastodon.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url) => {
      calls.push(url);
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

const cfg = (url) => ({ url });

test('mastodon stats: reads the classic v1 instance stats block', async () => {
  const http = makeHttp([
    ['/api/v1/instance', { version: '4.3.1', stats: { user_count: 1200, status_count: 98000, domain_count: 45000 } }],
  ]);
  const { byView } = await new MastodonIntegration().fetchData({ config: cfg('http://m-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Users', value: 1200 },
      { label: 'Statuses', value: 98000 },
      { label: 'Connections', value: 45000 },
      { label: 'Version', value: '4.3.1' },
    ],
  });
});

test('mastodon stats: falls back to v2 (active-month + version) when v1 is gone', async () => {
  const http = makeHttp([
    ['/api/v1/instance', new Error('404 Not Found')],
    ['/api/v2/instance', { version: '5.0.0', usage: { users: { active_month: 320 } } }],
  ]);
  const { byView } = await new MastodonIntegration().fetchData({ config: cfg('http://m-b.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Active (month)', value: 320 },
    { label: 'Version', value: '5.0.0' },
  ]);
});

test('mastodon stats: both endpoints failing rejects the poll', async () => {
  const http = makeHttp([
    ['/api/v1/instance', new Error('404')],
    ['/api/v2/instance', new Error('502 Bad Gateway')],
  ]);
  await assert.rejects(() => new MastodonIntegration().fetchData({ config: cfg('http://m-c.local'), http }), /502/);
});
