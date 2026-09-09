import test from 'node:test';
import assert from 'node:assert/strict';
import NextcloudIntegration from '../../src/integrations/nextcloud.integration.js';

function makeHttp(data) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      return { ocs: { meta: { status: 'ok' }, data } };
    },
  };
}

const cfg = (url) => ({ url, username: 'admin', password: 'app-pass' });

test('nextcloud stats: maps serverinfo fields, free space formatted', async () => {
  const http = makeHttp({
    nextcloud: { system: { freespace: 5 * 1024 ** 3, apps: { num_updates_available: 3 } }, storage: { num_users: 12, num_files: 4200 } },
    activeUsers: { last24hours: 7 },
  });
  const { byView } = await new NextcloudIntegration().fetchData({ config: cfg('http://nc-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Active (24h)', value: 7 },
      { label: 'Users', value: 12 },
      { label: 'Files', value: 4200 },
      { label: 'Free space', value: '5.0 GB' },
      { label: 'Updates', value: 3 },
    ],
  });
});

test('nextcloud: missing sections fall back to 0 instead of throwing', async () => {
  const http = makeHttp({});
  const { byView } = await new NextcloudIntegration().fetchData({ config: cfg('http://nc-b.local'), http });
  assert.deepEqual(byView.stats.items, [
    { label: 'Active (24h)', value: 0 },
    { label: 'Users', value: 0 },
    { label: 'Files', value: 0 },
    { label: 'Free space', value: '0 KB' },
    { label: 'Updates', value: 0 },
  ]);
});

test('nextcloud: sends OCS-APIRequest + basic auth headers', async () => {
  const http = makeHttp({});
  await new NextcloudIntegration().fetchData({ config: cfg('http://nc-c.local'), http });
  const call = http.calls[0];
  assert.equal(call.opts.headers['OCS-APIRequest'], 'true');
  assert.equal(call.opts.headers.Authorization, `Basic ${Buffer.from('admin:app-pass').toString('base64')}`);
});
