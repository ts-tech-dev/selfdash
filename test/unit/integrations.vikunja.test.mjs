import test from 'node:test';
import assert from 'node:assert/strict';
import VikunjaIntegration from '../../src/integrations/vikunja.integration.js';

function makeHttp(tasks) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      if (url.includes('/api/v1/tasks?')) return tasks;
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const cfg = (url) => ({ url, token: 'tk_secret' });
const ZERO = '0001-01-01T00:00:00Z';
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

test('vikunja due: lists open tasks with a real due date, flags overdue ones', async () => {
  const http = makeHttp([
    { id: 1, title: 'Ship release', done: false, due_date: iso(-86400_000) },
    { id: 2, title: 'Water plants', done: false, due_date: iso(3 * 86400_000) },
    { id: 3, title: 'Done thing', done: true, due_date: iso(-1000) },
    { id: 4, title: 'Someday', done: false, due_date: ZERO },
  ]);
  const { byView } = await new VikunjaIntegration().fetchData({ config: cfg('http://vk-a.local'), http });
  assert.equal(byView.due.type, 'list');
  assert.equal(byView.due.items.length, 2);
  assert.equal(byView.due.items[0].title, 'Ship release');
  assert.ok(byView.due.items[0].subtitle.startsWith('overdue — '));
  assert.ok(byView.due.items[1].subtitle.startsWith('due '));
});

test('vikunja due: nothing due → placeholder row', async () => {
  const http = makeHttp([{ id: 4, title: 'Someday', done: false, due_date: ZERO }]);
  const { byView } = await new VikunjaIntegration().fetchData({ config: cfg('http://vk-b.local'), http });
  assert.deepEqual(byView.due.items, [{ title: 'Nothing due' }]);
});

test('vikunja stats: counts open tasks, overdue, and due-today', async () => {
  const http = makeHttp([
    { id: 1, title: 'a', done: false, due_date: iso(-86400_000) },
    { id: 2, title: 'b', done: false, due_date: iso(60_000) },
    { id: 3, title: 'c', done: false, due_date: iso(10 * 86400_000) },
    { id: 4, title: 'd', done: false, due_date: ZERO },
    { id: 5, title: 'e', done: true, due_date: iso(-999) },
  ]);
  const { byView } = await new VikunjaIntegration().fetchData({ config: cfg('http://vk-c.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Open tasks', value: 4 },
    { label: 'Overdue', value: 1 },
    { label: 'Due today', value: 1 },
  ]);
});

test('vikunja: sends the token as a bearer header', async () => {
  const http = makeHttp([]);
  await new VikunjaIntegration().fetchData({ config: cfg('http://vk-d.local'), http });
  assert.ok(http.calls.every((c) => c.opts.headers.Authorization === 'Bearer tk_secret'));
});
