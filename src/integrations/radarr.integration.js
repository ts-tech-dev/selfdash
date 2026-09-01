import { BaseIntegration } from './_base.js';
import {
  fetchArrQueue,
  progressFromSize,
  arrQueueStatus,
  arrAgo,
  arrQuality,
  fetchArrHealth,
  fetchArrDiskspace,
  fetchArrHistory,
  fetchArrCalendar,
  arrPoster,
} from './_arrBase.js';
import { viewField, resolveViews, runViews } from './_views.js';

const LIST_CAP = 25;

const VIEWS = {
  queue: { label: 'Download queue', run: fetchQueue },
  stats: { label: 'Library stats', run: fetchLibraryStats },
  upcoming: { label: 'Upcoming releases', run: fetchUpcoming },
  calendar: { label: 'Release calendar', run: fetchCalendar },
  history: { label: 'Recently imported', run: fetchHistory },
  health: { label: 'Health', run: (ctx) => fetchArrHealth(ctx) },
  disk: { label: 'Disk space', run: (ctx) => fetchArrDiskspace(ctx) },
};

export default class RadarrIntegration extends BaseIntegration {
  static key = 'radarr';
  static title = 'Radarr';
  static defaultInterval = 60;
  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      viewField(VIEWS, { defaultKey: 'queue' }),
      { name: 'upcomingDays', label: 'Upcoming window (days)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'queue'));
  }
}

function fetchQueue({ config, http }) {
  return fetchArrQueue({
    config,
    http,
    apiPath: '/api/v3/queue',
    // Without includeMovie the row has no `movie` and falls back to the raw release name.
    query: 'includeMovie=true',
    mapRecord: (r) => ({
      title: r.movie?.title || r.title || 'Unknown',
      status: arrQueueStatus(r),
      progress: progressFromSize(r),
    }),
  });
}

async function fetchLibraryStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const movies = await http.fetchJson(`${base}/api/v3/movie`, { headers: { 'X-Api-Key': config.apiKey } });

  return {
    type: 'stats',
    items: [
      { label: 'Movies', value: movies.length },
      { label: 'Monitored', value: movies.filter((m) => m.monitored).length },
      { label: 'Downloaded', value: movies.filter((m) => m.hasFile).length },
      { label: 'Missing', value: movies.filter((m) => m.monitored && !m.hasFile).length },
    ],
  };
}

async function fetchUpcoming({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const days = Number(config.upcomingDays) > 0 ? Number(config.upcomingDays) : 30;
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const isoDate = (d) => d.toISOString().slice(0, 10);

  const movies = await http.fetchJson(
    `${base}/api/v3/calendar?start=${isoDate(start)}&end=${isoDate(end)}&unmonitored=false`,
    { headers: { 'X-Api-Key': config.apiKey } }
  );

  movies.sort((a, b) => earliestReleaseTimestamp(a) - earliestReleaseTimestamp(b));

  return {
    type: 'list',
    items: movies.slice(0, LIST_CAP).map((m) => {
      const ts = earliestReleaseTimestamp(m);
      return {
        title: m.title,
        subtitle: Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : undefined,
        image: arrPoster(m.images),
      };
    }),
  };
}

function fetchCalendar({ config, http }) {
  return fetchArrCalendar({
    config,
    http,
    mapEvent: (m) => ({ ts: earliestReleaseTimestamp(m), title: m.title, subtitle: releaseKind(m) }),
  });
}

function fetchHistory({ config, http }) {
  return fetchArrHistory({
    config,
    http,
    query: 'includeMovie=true',
    limit: LIST_CAP,
    mapRecord: (r) => ({
      title: r.movie?.title || r.sourceTitle || 'Unknown',
      subtitle: [arrQuality(r), arrAgo(r.date)].filter(Boolean).join(' · ') || undefined,
      image: arrPoster(r.movie?.images),
    }),
  });
}

function earliestReleaseTimestamp(movie) {
  const dates = [movie.inCinemas, movie.digitalRelease, movie.physicalRelease]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  return dates.length ? Math.min(...dates) : Infinity;
}

// Which of the three release dates the calendar is actually plotting, so the tile can
// say "Digital" / "Cinemas" / "Physical" instead of just a bare date.
function releaseKind(movie) {
  const ts = earliestReleaseTimestamp(movie);
  if (!Number.isFinite(ts)) return undefined;
  if (movie.inCinemas && new Date(movie.inCinemas).getTime() === ts) return 'Cinemas';
  if (movie.digitalRelease && new Date(movie.digitalRelease).getTime() === ts) return 'Digital';
  if (movie.physicalRelease && new Date(movie.physicalRelease).getTime() === ts) return 'Physical';
  return undefined;
}
