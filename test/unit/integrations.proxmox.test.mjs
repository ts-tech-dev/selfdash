import test from 'node:test';
import assert from 'node:assert/strict';
import ProxmoxIntegration from '../../src/integrations/proxmox.integration.js';

function makeHttp(resources) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      return { data: resources };
    },
  };
}

const cfg = (url) => ({ url, tokenId: 'root@pam!selfdash', tokenSecret: 'secret-uuid' });

const resources = [
  { type: 'node', node: 'pve1', status: 'online', cpu: 0.5, maxcpu: 4, mem: 4 * 1024 ** 3, maxmem: 8 * 1024 ** 3 },
  { type: 'node', node: 'pve2', status: 'offline', cpu: 0, maxcpu: 4, mem: 0, maxmem: 8 * 1024 ** 3 },
  { type: 'qemu', vmid: 100, status: 'running' },
  { type: 'qemu', vmid: 101, status: 'stopped' },
  { type: 'lxc', vmid: 200, status: 'running' },
  { type: 'storage', storage: 'local', disk: 50 * 1024 ** 3, maxdisk: 100 * 1024 ** 3 },
];

test('proxmox stats: sums node CPU/RAM, storage, and counts running VMs/LXCs/nodes', async () => {
  const http = makeHttp(resources);
  const { byView } = await new ProxmoxIntegration().fetchData({ config: cfg('http://pve-a.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Nodes up', value: '1/2' },
      { label: 'VMs running', value: '1/2' },
      { label: 'LXCs running', value: '1/1' },
      { label: 'CPU', value: '25%' },
      { label: 'Memory', value: '25%' },
      { label: 'Storage', value: '50%' },
    ],
  });
});

test('proxmox nodes list: one row per node with status/CPU/RAM', async () => {
  const http = makeHttp(resources);
  const { byView } = await new ProxmoxIntegration().fetchData({ config: cfg('http://pve-b.local'), http });
  assert.deepEqual(byView.nodes.items, [
    { title: 'pve1', subtitle: 'online · CPU 50% · RAM 50%' },
    { title: 'pve2', subtitle: 'offline · CPU 0% · RAM 0%' },
  ]);
});

test('proxmox: sends the PVEAPIToken authorization header', async () => {
  const http = makeHttp([]);
  await new ProxmoxIntegration().fetchData({ config: cfg('http://pve-c.local'), http });
  assert.equal(http.calls[0].opts.headers.Authorization, 'PVEAPIToken=root@pam!selfdash=secret-uuid');
});
