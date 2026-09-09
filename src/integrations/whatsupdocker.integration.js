import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// What's Up Docker: GET /api/containers, no auth by default. Each entry carries
// updateAvailable + the current tag (image.tag.value) and the new one (result.tag).

const VIEWS = {
  list: { label: 'Update available', run: fetchUpdates },
  stats: { label: 'Container stats', run: fetchStats },
};

export default class WhatsUpDockerIntegration extends BaseIntegration {
  static key = 'whatsupdocker';
  static title = "What's Up Docker";
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [{ name: 'url', label: 'Server URL', type: 'url', required: true }],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchContainers({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const data = await http.fetchJson(`${base}/api/containers`);
  return Array.isArray(data) ? data : [];
}

async function fetchUpdates(ctx) {
  const containers = await fetchContainers(ctx);
  const updates = containers.filter((c) => c.updateAvailable);
  return {
    type: 'list',
    items: updates.length
      ? updates.map((c) => ({
          title: c.name,
          subtitle: `${c.image?.tag?.value ?? '?'} → ${c.result?.tag ?? c.updateKind?.remoteValue ?? '?'}`,
        }))
      : [{ title: 'All containers up to date' }],
  };
}

async function fetchStats(ctx) {
  const containers = await fetchContainers(ctx);
  const updates = containers.filter((c) => c.updateAvailable).length;
  return {
    type: 'stats',
    items: [
      { label: 'Monitored', value: containers.length },
      { label: 'Updates available', value: updates },
      { label: 'Up to date', value: containers.length - updates },
    ],
  };
}
