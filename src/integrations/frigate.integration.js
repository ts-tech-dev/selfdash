import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Frigate NVR: `/api/stats` (cameras + service storage), `/api/events/summary` (per-day
// event counts) and `/api/events` (recent events). No auth on the API by default; a
// reverse-proxy in front may add its own.

const VIEWS = {
  stats: { label: 'NVR stats', run: fetchStats },
  events: { label: 'Recent events', run: fetchEvents },
};

export default class FrigateIntegration extends BaseIntegration {
  static key = 'frigate';
  static title = 'Frigate';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [{ name: 'url', label: 'Server URL', type: 'url', required: true }],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function fetchStats({ config, http }) {
  const base = baseOf(config);
  const [stats, summary] = await Promise.all([
    http.fetchJson(`${base}/api/stats`),
    http.fetchJson(`${base}/api/events/summary`).catch(() => []),
  ]);

  const cameras = stats.cameras && typeof stats.cameras === 'object' ? Object.keys(stats.cameras) : [];
  const today = localDay();
  const eventsToday = (Array.isArray(summary) ? summary : [])
    .filter((r) => r.day === today)
    .reduce((sum, r) => sum + (Number(r.count) || 0), 0);

  const storage = stats.service?.storage || {};
  const recordings =
    storage['/media/frigate/recordings'] || Object.values(storage).find((v) => v && v.total) || null;
  const storagePct =
    recordings && Number(recordings.total) > 0
      ? Math.round((Number(recordings.used) / Number(recordings.total)) * 100)
      : null;

  const items = [
    { label: 'Cameras', value: cameras.length },
    { label: 'Events today', value: eventsToday },
  ];
  if (storagePct != null) items.push({ label: 'Storage', value: `${storagePct}%` });
  if (stats.service?.version) items.push({ label: 'Version', value: stats.service.version });
  return { type: 'stats', items };
}

async function fetchEvents({ config, http }) {
  const data = await http.fetchJson(`${baseOf(config)}/api/events?limit=20`);
  const events = Array.isArray(data) ? data : [];
  if (events.length === 0) return { type: 'list', items: [{ title: 'No recent events' }] };
  return {
    type: 'list',
    items: events.map((e) => ({
      title: [e.label, e.camera].filter(Boolean).join(' · ') || `Event ${e.id}`,
      subtitle: e.start_time ? new Date(e.start_time * 1000).toLocaleString() : undefined,
    })),
  };
}
