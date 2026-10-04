import { BaseIntegration } from './_base.js';
import { runAllViews, viewCatalog, perPoll } from './_views.js';

// What's Up Docker: GET /api/containers, no auth by default. Each entry carries
// updateAvailable + the current tag (image.tag.value) and the new one (result.tag).

const VIEWS = {
  list: { label: 'Update available', run: fetchUpdates },
  stats: { label: 'Container stats', run: fetchStats },
  // Feeds the per-tile update badge (src/shared/containerUpdates.js), not a tile view.
  containerUpdates: { label: 'Container updates', hidden: true, run: fetchContainerUpdates },
};

export default class WhatsUpDockerIntegration extends BaseIntegration {
  static key = 'whatsupdocker';
  static title = "What's Up Docker";
  static defaultInterval = 300;
  static views = viewCatalog(VIEWS);

  static configSchema = {
    fields: [{ name: 'url', label: 'Server URL', type: 'url', required: true }],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

// Once per poll, shared by every view.
function fetchContainers(ctx) {
  return perPoll(ctx, 'containers', async () => {
    const base = ctx.config.url.replace(/\/+$/, '');
    const data = await ctx.http.fetchJson(`${base}/api/containers`);
    return Array.isArray(data) ? data : [];
  });
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

async function fetchContainerUpdates(ctx) {
  const containers = await fetchContainers(ctx);
  return {
    type: 'containerUpdates',
    items: containers
      .filter((c) => c.updateAvailable && c.name)
      .map((c) => ({ name: c.name, image: c.image?.name ? `${c.image.name}:${c.image.tag?.value ?? ''}`.replace(/:$/, '') : null, environment: c.watcher ?? null })),
  };
}
