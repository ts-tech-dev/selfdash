import test from 'node:test';
import assert from 'node:assert/strict';
import { runAllViews, viewCatalog, perPoll } from '../../src/integrations/_views.js';

test('runAllViews: every view fetched and keyed by its view key', async () => {
  const views = {
    a: { label: 'A', run: async () => ({ type: 'stats', items: [{ label: 'x', value: 1 }] }) },
    b: { label: 'B', run: async () => ({ type: 'list', items: [] }) },
  };
  const result = await runAllViews({}, views);
  assert.equal(result.type, 'multi');
  assert.deepEqual(Object.keys(result.byView), ['a', 'b']);
  assert.equal(result.byView.a.type, 'stats');
  assert.equal(result.byView.b.type, 'list');
});

test('runAllViews: one failing view becomes an error in its own slot; the rest still land', async () => {
  const views = {
    ok: { label: 'OK', run: async () => ({ type: 'stats', items: [] }) },
    broken: { label: 'Broken', run: async () => { throw new Error('upstream 500'); } },
  };
  const result = await runAllViews({}, views);
  assert.equal(result.byView.ok.type, 'stats');
  assert.equal(result.byView.broken.type, 'error');
  assert.equal(result.byView.broken.error, 'upstream 500');
});

test('runAllViews: every view failing throws (poll marked unreachable, last-good data kept on screen)', async () => {
  const views = {
    a: { label: 'A', run: async () => { throw new Error('timeout'); } },
    b: { label: 'B', run: async () => { throw new Error('401'); } },
  };
  await assert.rejects(() => runAllViews({}, views), /A: timeout.*B: 401|B: 401.*A: timeout/s);
});

test('runAllViews: a view that failed but has last-good data falls back to it (tagged stale) instead of blanking out', async () => {
  const views = {
    queue: { label: 'Queue', run: async () => { throw new Error('login failed'); } },
    stats: { label: 'Stats', run: async () => ({ type: 'stats', items: [{ label: 'x', value: 1 }] }) },
  };
  const previous = {
    type: 'multi',
    byView: { queue: { type: 'queue', items: [{ title: 'still downloading' }] }, stats: { type: 'stats', items: [] } },
  };
  const result = await runAllViews({ previous }, views);
  assert.equal(result.byView.queue.type, 'queue');
  assert.deepEqual(result.byView.queue.items, [{ title: 'still downloading' }]);
  assert.equal(result.byView.queue.stale, true);
  assert.equal(result.byView.queue.error, 'login failed');
  assert.equal(result.byView.stats.type, 'stats');
});

test('runAllViews: a failing view with no previous data (or previous data that was itself an error) still becomes a hard error', async () => {
  const views = {
    queue: { label: 'Queue', run: async () => { throw new Error('login failed'); } },
    stats: { label: 'Stats', run: async () => ({ type: 'stats', items: [] }) },
  };
  const noPrevious = await runAllViews({}, views);
  assert.equal(noPrevious.byView.queue.type, 'error');

  const previous = { type: 'multi', byView: { queue: { type: 'error', error: 'earlier failure' } } };
  const staleErrorPrevious = await runAllViews({ previous }, views);
  assert.equal(staleErrorPrevious.byView.queue.type, 'error');
});

test('runAllViews: hidden views land in `hidden`, never in byView', async () => {
  const views = {
    list: { label: 'List', run: async () => ({ type: 'list', items: [] }) },
    containerUpdates: { label: 'CU', hidden: true, run: async () => ({ type: 'containerUpdates', items: [{ name: 'a' }] }) },
  };
  const result = await runAllViews({}, views);
  assert.deepEqual(Object.keys(result.byView), ['list']);
  assert.deepEqual(result.hidden.containerUpdates.items, [{ name: 'a' }]);
  assert.deepEqual(viewCatalog(views), { list: 'List' }, 'hidden views are not offered to tiles');
});

test('runAllViews: a failing hidden view falls back to its last-good data and never fails the poll on its own', async () => {
  const views = {
    list: { label: 'List', run: async () => ({ type: 'list', items: [] }) },
    containerUpdates: { label: 'CU', hidden: true, run: async () => { throw new Error('boom'); } },
  };
  const previous = { type: 'multi', byView: {}, hidden: { containerUpdates: { type: 'containerUpdates', items: [{ name: 'old' }] } } };
  const result = await runAllViews({ previous }, views);
  assert.deepEqual(result.hidden.containerUpdates.items, [{ name: 'old' }]);
  assert.equal(result.hidden.containerUpdates.stale, true);

  const allVisibleFail = {
    list: { label: 'List', run: async () => { throw new Error('down'); } },
    containerUpdates: { label: 'CU', hidden: true, run: async () => ({ type: 'containerUpdates', items: [] }) },
  };
  await assert.rejects(() => runAllViews({}, allVisibleFail), /List: down/);
});

test('perPoll: one upstream call per poll ctx, fresh per new ctx', async () => {
  let calls = 0;
  const load = () => perPoll(ctx, 'k', async () => ++calls);
  let ctx = {};
  assert.deepEqual(await Promise.all([load(), load()]), [1, 1]);
  ctx = {};
  assert.equal(await load(), 2);
});
