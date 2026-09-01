import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

const VIEWS = {
  queue: { label: 'Download queue', run: fetchQueue },
  stats: { label: 'Queue stats', run: fetchStats },
};

export default class SabnzbdIntegration extends BaseIntegration {
  static key = 'sabnzbd';
  static title = 'SABnzbd';
  static defaultInterval = 30;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchQueueRaw({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const url = `${base}/api?mode=queue&output=json&apikey=${encodeURIComponent(config.apiKey)}`;
  const data = await http.fetchJson(url);
  if (data.error) throw new Error(data.error);
  return data.queue || {};
}

async function fetchQueue(ctx) {
  const slots = (await fetchQueueRaw(ctx)).slots || [];
  return {
    type: 'queue',
    items: slots.map((s) => ({
      title: s.filename,
      status: s.status,
      progress: s.percentage !== undefined ? Number(s.percentage) / 100 : undefined,
    })),
  };
}

async function fetchStats(ctx) {
  const queue = await fetchQueueRaw(ctx);
  const slots = queue.slots || [];
  return {
    type: 'stats',
    items: [
      { label: 'Queue items', value: slots.length },
      { label: 'MB left', value: Math.round(Number(queue.mbleft) || 0) },
      // Passed through as SABnzbd reports it (unit varies by version/config) rather than
      // guessing a conversion factor and risking a confidently wrong number.
      { label: 'Speed', value: queue.speed ?? '0' },
      { label: 'Paused', value: queue.paused ? 'Yes' : 'No' },
    ],
  };
}
