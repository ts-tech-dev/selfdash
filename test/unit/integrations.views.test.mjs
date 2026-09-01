import test from 'node:test';
import assert from 'node:assert/strict';
import { runAllViews } from '../../src/integrations/_views.js';

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
