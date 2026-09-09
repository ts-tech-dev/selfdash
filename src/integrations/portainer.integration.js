import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Portainer. Auth is an API access token (X-API-Key, created under My account -> Access
// tokens). /api/endpoints carries a cached "snapshot" per environment with all the
// container/image/volume/stack counts *and* the raw container list, so both views need
// no Docker-proxy calls in the common case (a proxy fallback covers snapshots that were
// fetched with ?excludeSnapshots).

const VIEWS = {
  stats: { label: 'Container stats', run: fetchStats },
  down: { label: 'Stopped / unhealthy', run: fetchDown },
};

export default class PortainerIntegration extends BaseIntegration {
  static key = 'portainer';
  static title = 'Portainer';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API access token', type: 'password', required: true },
      { name: 'endpointId', label: 'Environment ID (blank = all)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ 'X-API-Key': config.apiKey });

// Standalone Docker exposes the snapshot as Snapshots[0]; some shapes use .Snapshot.
function snapshotOf(endpoint) {
  return (Array.isArray(endpoint.Snapshots) && endpoint.Snapshots[0]) || endpoint.Snapshot || null;
}

async function selectEndpoints({ config, http }) {
  const all = await http.fetchJson(`${baseOf(config)}/api/endpoints`, { headers: authHeaders(config) });
  const list = Array.isArray(all) ? all : [];
  const wanted = Number(config.endpointId);
  const picked = wanted > 0 ? list.filter((e) => e.Id === wanted) : list;
  return picked.filter(snapshotOf);
}

async function fetchStats(ctx) {
  const eps = await selectEndpoints(ctx);
  const sum = (pick) => eps.reduce((n, e) => n + (Number(pick(snapshotOf(e))) || 0), 0);
  return {
    type: 'stats',
    items: [
      { label: 'Running', value: sum((s) => s.RunningContainerCount) },
      { label: 'Stopped', value: sum((s) => s.StoppedContainerCount) },
      { label: 'Images', value: sum((s) => s.ImageCount) },
      { label: 'Volumes', value: sum((s) => s.VolumeCount) },
      { label: 'Stacks', value: sum((s) => s.StackCount) },
    ],
  };
}

async function fetchDown(ctx) {
  const { config, http } = ctx;
  const eps = await selectEndpoints(ctx);
  const multi = eps.length > 1;
  const items = [];

  for (const e of eps) {
    let containers = snapshotOf(e)?.DockerSnapshotRaw?.Containers;
    if (!Array.isArray(containers)) {
      containers = await http
        .fetchJson(`${baseOf(config)}/api/endpoints/${e.Id}/docker/containers/json?all=1`, {
          headers: authHeaders(config),
        })
        .catch(() => []);
    }

    for (const c of Array.isArray(containers) ? containers : []) {
      const status = c.Status || '';
      const unhealthy = /unhealthy/i.test(status);
      const stopped = c.State && c.State !== 'running';
      if (!unhealthy && !stopped) continue;
      const name = (Array.isArray(c.Names) && c.Names[0] ? c.Names[0] : c.Id || '?').replace(/^\//, '');
      items.push({
        title: name,
        subtitle: [multi ? e.Name : null, status || c.State].filter(Boolean).join(' · ') || undefined,
      });
    }
  }

  return { type: 'list', items };
}
