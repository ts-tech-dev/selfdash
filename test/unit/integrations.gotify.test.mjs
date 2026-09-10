import test from 'node:test';
import assert from 'node:assert/strict';
import GotifyIntegration from '../../src/integrations/gotify.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        if (url.includes(match)) return typeof payload === 'function' ? payload() : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, clientToken: 'CID-1' });

test('gotify messages: maps title + trimmed body/date subtitle, newest-first as returned', async () => {
  const http = makeHttp([
    ['/message?limit=20', {
      messages: [
        { id: 9, title: 'Backup done', message: 'nightly  backup\n completed', date: '2026-09-09T02:00:00Z' },
        { id: 8, title: '', message: 'disk at 90%', date: '2026-09-08T22:00:00Z' },
      ],
    }],
    ['/application', [{ id: 1 }]],
    ['/client', [{ id: 1 }, { id: 2 }]],
  ]);
  const { byView } = await new GotifyIntegration().fetchData({ config: cfg('http://g-a.local'), http });
  assert.equal(byView.messages.type, 'list');
  assert.equal(byView.messages.items[0].title, 'Backup done');
  assert.ok(byView.messages.items[0].subtitle.startsWith('nightly backup completed · '));
  assert.equal(byView.messages.items[1].title, 'Message');
});

test('gotify messages: empty list → a single placeholder row', async () => {
  const http = makeHttp([['/message', { messages: [] }]]);
  const { byView } = await new GotifyIntegration().fetchData({ config: cfg('http://g-b.local'), http });
  assert.deepEqual(byView.messages.items, [{ title: 'No messages' }]);
});

test('gotify stats: counts applications and clients, tolerating a failed sub-call', async () => {
  const http = makeHttp([
    ['/message', { messages: [] }],
    ['/application', [{ id: 1 }, { id: 2 }, { id: 3 }]],
    // no /client route -> that call rejects and is caught as 0
  ]);
  const { byView } = await new GotifyIntegration().fetchData({ config: cfg('http://g-c.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Applications', value: 3 },
    { label: 'Clients', value: 0 },
  ]);
});

test('gotify: sends the X-Gotify-Key header on every call', async () => {
  const http = makeHttp([
    ['/message', { messages: [] }],
    ['/application', []],
    ['/client', []],
  ]);
  await new GotifyIntegration().fetchData({ config: cfg('http://g-d.local'), http });
  assert.ok(http.calls.every((c) => c.opts.headers['X-Gotify-Key'] === 'CID-1'));
});
