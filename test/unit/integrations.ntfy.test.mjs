import test from 'node:test';
import assert from 'node:assert/strict';
import NtfyIntegration from '../../src/integrations/ntfy.integration.js';

function makeHttp({ body = '', ok = true, status = 200 } = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      return { ok, status, statusText: ok ? 'OK' : 'Error', text: async () => body };
    },
  };
}

const cfg = (over = {}) => ({ url: 'http://ntfy.local', topic: 'alerts', ...over });

const ndjson = (...objs) => objs.map((o) => JSON.stringify(o)).join('\n') + '\n';

test('ntfy messages: parses NDJSON, keeps only message events, newest-first', async () => {
  const http = makeHttp({
    body: ndjson(
      { id: 'a', event: 'open', topic: 'alerts' },
      { id: 'b', event: 'message', time: 1000, topic: 'alerts', title: 'Low disk', message: 'root at 95%' },
      { id: 'c', event: 'keepalive', time: 1500 },
      { id: 'd', event: 'message', time: 2000, topic: 'alerts', message: 'plain body only' }
    ),
  });
  const { byView } = await new NtfyIntegration().fetchData({ config: cfg(), http });
  assert.equal(byView.messages.type, 'list');
  assert.equal(byView.messages.items.length, 2);
  assert.equal(byView.messages.items[0].title, 'plain body only'); // time 2000 sorts first
  assert.equal(byView.messages.items[1].title, 'Low disk');
});

test('ntfy messages: default 12h window, overridable via config.since; topic is URL-encoded', async () => {
  const http = makeHttp({ body: '' });
  await new NtfyIntegration().fetchData({ config: cfg({ topic: 'my alerts', since: '2d' }), http });
  assert.ok(http.calls[0].url.includes('/my%20alerts/json?poll=1&since=2d'));

  const http2 = makeHttp({ body: '' });
  await new NtfyIntegration().fetchData({ config: cfg(), http: http2 });
  assert.ok(http2.calls[0].url.includes('since=12h'));
});

test('ntfy messages: no messages → placeholder row naming the window', async () => {
  const http = makeHttp({ body: ndjson({ event: 'open' }) });
  const { byView } = await new NtfyIntegration().fetchData({ config: cfg(), http });
  assert.deepEqual(byView.messages.items, [{ title: 'No messages in the last 12h' }]);
});

test('ntfy: sends a bearer token only when configured', async () => {
  const withTok = makeHttp({ body: '' });
  await new NtfyIntegration().fetchData({ config: cfg({ token: 'tk_abc' }), http: withTok });
  assert.equal(withTok.calls[0].opts.headers.Authorization, 'Bearer tk_abc');

  const noTok = makeHttp({ body: '' });
  await new NtfyIntegration().fetchData({ config: cfg(), http: noTok });
  assert.equal(noTok.calls[0].opts.headers.Authorization, undefined);
});

test('ntfy: a non-OK HTTP response rejects', async () => {
  const http = makeHttp({ ok: false, status: 403 });
  await assert.rejects(() => new NtfyIntegration().fetchData({ config: cfg(), http }), /403/);
});
