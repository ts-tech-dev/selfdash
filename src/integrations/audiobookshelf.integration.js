import { BaseIntegration } from './_base.js';
import { viewField, resolveViews, runViews } from './_views.js';

// Audiobookshelf: bearer-token auth (Settings -> Users -> your user -> API Token, or the
// long-lived token from /api/me). All endpoints below work with a normal (non-admin) user
// token; /api/sessions (server-wide playback) is admin-only and deliberately not used.

const VIEWS = {
  stats: { label: 'Library item counts', run: fetchLibraryStats },
  overview: { label: 'Library overview', run: fetchOverview },
  inprogress: { label: 'Continue listening', run: fetchInProgress },
  recent: { label: 'Recently added', run: fetchRecent },
  listening: { label: 'My listening', run: fetchListening },
};

export default class AudiobookshelfIntegration extends BaseIntegration {
  static key = 'audiobookshelf';
  static title = 'Audiobookshelf';
  static defaultInterval = 120;
  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      viewField(VIEWS, { defaultKey: 'stats' }),
      { name: 'recentLimit', label: 'Rows for list views (max 25)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'stats'));
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ Authorization: `Bearer ${config.apiKey}` });

function rowLimit(config) {
  return Math.min(25, Math.max(1, Number(config.recentLimit) || 10));
}

function fmtDuration(seconds) {
  const s = Number(seconds) || 0;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 2 * 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  return n >= 1e12 ? `${(n / 1e12).toFixed(2)} TB` : `${(n / 1e9).toFixed(1)} GB`;
}

function ago(ms) {
  const diff = Date.now() - Number(ms);
  const day = 86400000;
  if (!Number.isFinite(diff) || diff < 0) return undefined;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(Number(ms)).toLocaleDateString();
}

const titleOf = (item) => item?.media?.metadata?.title || item?.media?.metadata?.name || 'Untitled';
const authorOf = (item) => item?.media?.metadata?.authorName || item?.media?.metadata?.author || undefined;

async function listLibraries({ config, http }) {
  const { libraries } = await http.fetchJson(`${baseOf(config)}/api/libraries`, { headers: authHeaders(config) });
  return libraries || [];
}

// Existing view, unchanged: one row per library with its total item count.
async function fetchLibraryStats({ config, http }) {
  const base = baseOf(config);
  const headers = authHeaders(config);

  const libraries = await listLibraries({ config, http });
  const items = [];
  for (const lib of libraries) {
    try {
      const stats = await http.fetchJson(`${base}/api/libraries/${lib.id}/items?limit=0`, { headers });
      items.push({ label: lib.name, value: stats.total ?? 0 });
    } catch {
      items.push({ label: lib.name, value: '?' });
    }
  }
  return { type: 'stats', items };
}

// Aggregate totals across every library: titles, authors, runtime, on-disk size.
async function fetchOverview({ config, http }) {
  const base = baseOf(config);
  const headers = authHeaders(config);
  const libraries = await listLibraries({ config, http });

  const totals = { items: 0, authors: 0, duration: 0, size: 0 };
  for (const lib of libraries) {
    try {
      const s = await http.fetchJson(`${base}/api/libraries/${lib.id}/stats`, { headers });
      totals.items += Number(s.totalItems) || 0;
      totals.authors += Number(s.totalAuthors) || 0;
      totals.duration += Number(s.totalDuration) || 0;
      totals.size += Number(s.totalSize) || 0;
    } catch {
      // skip a library whose stats endpoint errors; the rest still count
    }
  }

  return {
    type: 'stats',
    items: [
      { label: 'Titles', value: totals.items },
      { label: 'Authors', value: totals.authors },
      { label: 'Duration', value: fmtDuration(totals.duration) },
      { label: 'Size', value: fmtSize(totals.size) },
    ],
  };
}

// Books this user has started but not finished, most-recently-listened first, with a
// progress bar. `items-in-progress` gives the ordering; `/api/me` carries the fractions.
async function fetchInProgress({ config, http }) {
  const base = baseOf(config);
  const headers = authHeaders(config);

  const [{ libraryItems = [] }, me] = await Promise.all([
    http.fetchJson(`${base}/api/me/items-in-progress`, { headers }),
    http.fetchJson(`${base}/api/me`, { headers }),
  ]);

  const progressById = new Map(
    (me.mediaProgress || []).map((p) => [p.libraryItemId, p])
  );

  const items = libraryItems
    .map((li) => ({ li, mp: progressById.get(li.id) }))
    .filter(({ mp }) => !mp || !mp.isFinished)
    .slice(0, rowLimit(config))
    .map(({ li, mp }) => ({
      title: titleOf(li),
      status: authorOf(li),
      progress: mp && Number.isFinite(mp.progress) ? Math.max(0, Math.min(1, mp.progress)) : undefined,
    }));

  return { type: 'queue', items };
}

// Newest items across all libraries, merged and re-sorted by date added.
async function fetchRecent({ config, http }) {
  const base = baseOf(config);
  const headers = authHeaders(config);
  const limit = rowLimit(config);
  const libraries = await listLibraries({ config, http });

  const perLib = await Promise.all(
    libraries.map((lib) =>
      http
        .fetchJson(`${base}/api/libraries/${lib.id}/items?sort=addedAt&desc=1&limit=${limit}`, { headers })
        .then((d) => d.results || [])
        .catch(() => [])
    )
  );

  const merged = perLib
    .flat()
    .sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0))
    .slice(0, limit);

  return {
    type: 'list',
    items: merged.map((it) => ({
      title: titleOf(it),
      subtitle: [authorOf(it), ago(it.addedAt)].filter(Boolean).join(' · ') || undefined,
    })),
  };
}

// This user's own listening totals (not server-wide).
async function fetchListening({ config, http }) {
  const d = await http.fetchJson(`${baseOf(config)}/api/me/listening-stats`, { headers: authHeaders(config) });
  const distinct = (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0);

  return {
    type: 'stats',
    items: [
      { label: 'Today', value: fmtDuration(d.today) },
      { label: 'All time', value: fmtDuration(d.totalTime) },
      { label: 'Titles', value: distinct(d.items) },
      { label: 'Days', value: distinct(d.days) },
    ],
  };
}
