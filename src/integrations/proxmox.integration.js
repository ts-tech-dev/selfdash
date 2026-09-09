import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Proxmox VE: GET /api2/json/cluster/resources with an API token
// (`Authorization: PVEAPIToken=<user>@<realm>!<tokenId>=<secret>`, created under
// Datacenter -> Permissions -> API Tokens). One flat list of every resource in the
// cluster, told apart by `type` (node/qemu/lxc/storage/...). Proxmox's own web UI runs
// over a self-signed cert by default, hence the insecure-TLS toggle.

const VIEWS = {
  stats: { label: 'Cluster stats', run: fetchStats },
  nodes: { label: 'Per-node load', run: fetchNodeList },
};

export default class ProxmoxIntegration extends BaseIntegration {
  static key = 'proxmox';
  static title = 'Proxmox VE';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL (e.g. https://host:8006)', type: 'url', required: true },
      { name: 'tokenId', label: 'API Token ID (user@realm!tokenname)', type: 'text', required: true },
      { name: 'tokenSecret', label: 'API Token Secret', type: 'password', required: true },
      { name: 'allowInsecureTLS', label: 'Allow self-signed / insecure TLS certificate', type: 'checkbox', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchResources({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const data = await http.fetchJson(`${base}/api2/json/cluster/resources`, {
    headers: { Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}` },
    insecureTLS: config.allowInsecureTLS,
  });
  return Array.isArray(data.data) ? data.data : [];
}

const running = (list) => list.filter((r) => r.status === 'running').length;
const pct = (used, total) => (total > 0 ? `${Math.round((used / total) * 100)}%` : '-');

async function fetchStats(ctx) {
  const resources = await fetchResources(ctx);
  const nodes = resources.filter((r) => r.type === 'node');
  const vms = resources.filter((r) => r.type === 'qemu');
  const lxcs = resources.filter((r) => r.type === 'lxc');
  const storages = resources.filter((r) => r.type === 'storage');

  const cpuUsed = nodes.reduce((sum, n) => sum + (n.cpu || 0) * (n.maxcpu || 0), 0);
  const cpuTotal = nodes.reduce((sum, n) => sum + (n.maxcpu || 0), 0);
  const memUsed = nodes.reduce((sum, n) => sum + (n.mem || 0), 0);
  const memTotal = nodes.reduce((sum, n) => sum + (n.maxmem || 0), 0);
  const diskUsed = storages.reduce((sum, s) => sum + (s.disk || 0), 0);
  const diskTotal = storages.reduce((sum, s) => sum + (s.maxdisk || 0), 0);

  return {
    type: 'stats',
    items: [
      { label: 'Nodes up', value: `${nodes.filter((n) => n.status === 'online').length}/${nodes.length}` },
      { label: 'VMs running', value: `${running(vms)}/${vms.length}` },
      { label: 'LXCs running', value: `${running(lxcs)}/${lxcs.length}` },
      { label: 'CPU', value: pct(cpuUsed, cpuTotal) },
      { label: 'Memory', value: pct(memUsed, memTotal) },
      { label: 'Storage', value: pct(diskUsed, diskTotal) },
    ],
  };
}

async function fetchNodeList(ctx) {
  const resources = await fetchResources(ctx);
  const nodes = resources.filter((r) => r.type === 'node');
  return {
    type: 'list',
    items: nodes.map((n) => ({
      title: n.node,
      subtitle: `${n.status} · CPU ${pct(n.cpu * (n.maxcpu || 0), n.maxcpu)} · RAM ${pct(n.mem, n.maxmem)}`,
    })),
  };
}
