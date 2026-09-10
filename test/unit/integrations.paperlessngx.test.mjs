import test from 'node:test';
import assert from 'node:assert/strict';
import PaperlessNgxIntegration from '../../src/integrations/paperlessngx.integration.js';

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

const cfg = (url) => ({ url, token: 'abc123' });

const stats = (over = {}) => ({
  documents_total: 812,
  documents_inbox: 3,
  inbox_tags: [9],
  tag_count: 21,
  correspondent_count: 12,
  document_type_count: 5,
  ...over,
});

test('paperless stats: maps the statistics payload', async () => {
  const http = makeHttp([['/api/statistics/', stats()]]);
  const { byView } = await new PaperlessNgxIntegration().fetchData({ config: cfg('http://p-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Documents', value: 812 },
      { label: 'Inbox', value: 3 },
      { label: 'Tags', value: 21 },
      { label: 'Correspondents', value: 12 },
      { label: 'Doc types', value: 5 },
    ],
  });
});

test('paperless inbox: queries documents by the inbox tag id, newest first', async () => {
  const http = makeHttp([
    ['/api/statistics/', stats()],
    [
      '/api/documents/?tags__id__in=9',
      { results: [{ id: 4, title: 'Electric bill', created: '2026-09-01T10:00:00Z' }, { id: 5, title: '', created: '2026-08-30T09:00:00Z' }] },
    ],
  ]);
  const { byView } = await new PaperlessNgxIntegration().fetchData({ config: cfg('http://p-b.local'), http });
  assert.equal(byView.inbox.type, 'list');
  assert.equal(byView.inbox.items[0].title, 'Electric bill');
  assert.equal(byView.inbox.items[1].title, 'Document #5');
  assert.ok(http.calls.some((c) => c.url.includes('ordering=-created')));
});

test('paperless inbox: legacy single inbox_tag is still honored', async () => {
  const http = makeHttp([
    ['/api/statistics/', stats({ inbox_tags: undefined, inbox_tag: 2 })],
    ['/api/documents/?tags__id__in=2', { results: [] }],
  ]);
  const { byView } = await new PaperlessNgxIntegration().fetchData({ config: cfg('http://p-c.local'), http });
  assert.deepEqual(byView.inbox.items, [{ title: 'Inbox is empty' }]);
});

test('paperless: sends the token as an Authorization: Token header', async () => {
  const http = makeHttp([
    ['/api/statistics/', stats({ inbox_tags: [] })],
  ]);
  await new PaperlessNgxIntegration().fetchData({ config: cfg('http://p-d.local'), http });
  assert.ok(http.calls.every((c) => c.opts.headers.Authorization === 'Token abc123'));
});
