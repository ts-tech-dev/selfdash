import test from 'node:test';
import assert from 'node:assert/strict';
import NavidromeIntegration from '../../src/integrations/navidrome.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url) => {
      calls.push(url);
      for (const [match, payload] of routes) {
        if (url.includes(match)) return typeof payload === 'function' ? payload() : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, username: 'admin', password: 'secret' });

test('navidrome nowplaying: maps entries to title + "artist · user", tolerates a single (non-array) entry', async () => {
  const http = makeHttp([
    ['getNowPlaying', { 'subsonic-response': { status: 'ok', nowPlaying: { entry: { title: 'Song A', artist: 'Band', username: 'bob' } } } }],
    ['getScanStatus', { 'subsonic-response': { status: 'ok', scanStatus: { count: 10, folderCount: 2 } } }],
  ]);
  const { byView } = await new NavidromeIntegration().fetchData({ config: cfg('http://nd-a.local'), http });
  assert.deepEqual(byView.nowplaying, {
    type: 'nowplaying',
    items: [{ title: 'Song A', subtitle: 'Band · bob' }],
  });
});

test('navidrome stats: reads scan status song/folder counts + scanning flag', async () => {
  const http = makeHttp([
    ['getNowPlaying', { 'subsonic-response': { status: 'ok', nowPlaying: {} } }],
    ['getScanStatus', { 'subsonic-response': { status: 'ok', scanStatus: { count: 4231, folderCount: 87, scanning: false } } }],
  ]);
  const { byView } = await new NavidromeIntegration().fetchData({ config: cfg('http://nd-b.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Songs', value: 4231 },
      { label: 'Folders', value: 87 },
      { label: 'Scanning', value: 'no' },
    ],
  });
});

test('navidrome: a "failed" subsonic-response surfaces the upstream error message', async () => {
  const http = makeHttp([
    ['getNowPlaying', { 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } }],
    ['getScanStatus', { 'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } } }],
  ]);
  await assert.rejects(
    () => new NavidromeIntegration().fetchData({ config: cfg('http://nd-c.local'), http }),
    /Wrong username or password/
  );
});

test('navidrome: sends salted-token auth params (u/t/s), never the raw password', async () => {
  const http = makeHttp([
    ['getNowPlaying', { 'subsonic-response': { status: 'ok', nowPlaying: {} } }],
    ['getScanStatus', { 'subsonic-response': { status: 'ok', scanStatus: { count: 0 } } }],
  ]);
  await new NavidromeIntegration().fetchData({ config: cfg('http://nd-d.local'), http });
  assert.ok(http.calls.every((u) => /[?&]u=admin(&|$)/.test(u) && /[?&]t=[a-f0-9]{32}/.test(u) && /[?&]s=/.test(u)));
  assert.ok(http.calls.every((u) => !u.includes('secret')));
});
