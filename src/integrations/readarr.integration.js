import { BaseIntegration } from './_base.js';
import {
  fetchArrQueue,
  progressFromSize,
  arrQueueStatus,
  fetchArrHealth,
  fetchArrDiskspace,
} from './_arrBase.js';
import { runAllViews } from './_views.js';

// Readarr, like Lidarr, is still on the v1 API — Radarr/Sonarr moved to v3.
const V = 'v1';

const VIEWS = {
  queue: { label: 'Download queue', run: fetchQueue },
  stats: { label: 'Library stats', run: fetchLibraryStats },
  upcoming: { label: 'Upcoming releases', run: fetchUpcoming },
  health: { label: 'Health', run: (ctx) => fetchArrHealth({ ...ctx, apiVersion: V }) },
  disk: { label: 'Disk space', run: (ctx) => fetchArrDiskspace({ ...ctx, apiVersion: V }) },
};

export default class ReadarrIntegration extends BaseIntegration {
  static key = 'readarr';
  static title = 'Readarr';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      { name: 'upcomingDays', label: 'Upcoming window (days)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

function fetchQueue({ config, http }) {
  return fetchArrQueue({
    config,
    http,
    apiPath: '/api/v1/queue',
    query: 'includeAuthor=true&includeBook=true',
    mapRecord: (r) => ({
      title: r.author?.authorName
        ? `${r.author.authorName} — ${r.book?.title || ''}`.trim().replace(/ —$/, '')
        : r.title || 'Unknown',
      status: arrQueueStatus(r),
      progress: progressFromSize(r),
    }),
  });
}

async function fetchLibraryStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const authors = await http.fetchJson(`${base}/api/v1/author`, { headers: { 'X-Api-Key': config.apiKey } });

  const monitored = authors.filter((a) => a.monitored).length;
  const booksDownloaded = authors.reduce((sum, a) => sum + (a.statistics?.bookFileCount || 0), 0);
  // availableBookCount = monitored books whose release date has passed (the right denominator for
  // "missing"); bookCount alone can include books that haven't released yet, unlike Sonarr's
  // episodeCount which already excludes unaired episodes. Fall back to bookCount if not present —
  // Readarr's statistics resource is less consistently documented than Sonarr's.
  const booksAvailable = authors.reduce(
    (sum, a) => sum + (a.statistics?.availableBookCount ?? a.statistics?.bookCount ?? 0),
    0
  );

  return {
    type: 'stats',
    items: [
      { label: 'Authors', value: authors.length },
      { label: 'Monitored', value: monitored },
      { label: 'Books', value: booksDownloaded },
      { label: 'Missing', value: Math.max(0, booksAvailable - booksDownloaded) },
    ],
  };
}

async function fetchUpcoming({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const days = Number(config.upcomingDays) > 0 ? Number(config.upcomingDays) : 30;
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const isoDate = (d) => d.toISOString().slice(0, 10);

  const books = await http.fetchJson(
    `${base}/api/v1/calendar?start=${isoDate(start)}&end=${isoDate(end)}&includeAuthor=true`,
    { headers: { 'X-Api-Key': config.apiKey } }
  );

  books.sort((a, b) => releaseTimestamp(a) - releaseTimestamp(b));

  return {
    type: 'list',
    items: books.map((b) => {
      const ts = releaseTimestamp(b);
      return {
        title: b.author?.authorName ? `${b.author.authorName} — ${b.title || ''}`.trim() : b.title || 'Unknown',
        subtitle: Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : undefined,
      };
    }),
  };
}

function releaseTimestamp(book) {
  const raw = book.releaseDate;
  if (!raw) return Infinity;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? Infinity : ts;
}
