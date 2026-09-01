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

export default class SonarrIntegration extends BaseIntegration {
  static key = 'sonarr';
  static title = 'Sonarr';
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
    // Without these the linked records aren't hydrated and every row falls back to the raw
    // release name; `status` also needs trackedDownload* which the record carries by default.
    query: 'includeSeries=true&includeEpisode=true',
    mapRecord: (r) => ({
      title: r.series?.title ? `${r.series.title}${episodeTag(r.episode)}` : r.title || 'Unknown',
      status: arrQueueStatus(r),
      progress: progressFromSize(r),
    }),
  });
}

async function fetchLibraryStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const series = await http.fetchJson(`${base}/api/v3/series`, { headers: { 'X-Api-Key': config.apiKey } });

  const monitored = series.filter((s) => s.monitored).length;
  // episodeCount = monitored episodes that have aired (excludes future/unmonitored) — the right
  // denominator for "missing", unlike totalEpisodeCount which also counts unaired/unmonitored ones.
  const episodesAired = series.reduce((sum, s) => sum + (s.statistics?.episodeCount || 0), 0);
  const episodesDownloaded = series.reduce((sum, s) => sum + (s.statistics?.episodeFileCount || 0), 0);

  return {
    type: 'stats',
    items: [
      { label: 'Series', value: series.length },
      { label: 'Monitored', value: monitored },
      { label: 'Episodes', value: episodesDownloaded },
      { label: 'Missing', value: Math.max(0, episodesAired - episodesDownloaded) },
    ],
  };
}

async function fetchUpcoming({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const days = Number(config.upcomingDays) > 0 ? Number(config.upcomingDays) : 30;
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const isoDate = (d) => d.toISOString().slice(0, 10);

  const episodes = await http.fetchJson(
    `${base}/api/v3/calendar?start=${isoDate(start)}&end=${isoDate(end)}&includeSeries=true&unmonitored=false`,
    { headers: { 'X-Api-Key': config.apiKey } }
  );

  episodes.sort((a, b) => airTimestamp(a) - airTimestamp(b));

  return {
    type: 'list',
    items: episodes.slice(0, LIST_CAP).map((e) => {
      const ts = airTimestamp(e);
      return {
        title: e.series?.title ? `${e.series.title}${episodeTag(e)}` : e.title || 'Unknown',
        subtitle: Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : undefined,
        image: arrPoster(e.series?.images),
      };
    }),
  };
}

function fetchCalendar({ config, http }) {
  return fetchArrCalendar({
    config,
    http,
    query: 'includeSeries=true',
    mapEvent: (e) => {
      const tag = episodeTag(e).trim();
      const epName = e.title && e.title !== e.series?.title ? e.title : '';
      return {
        ts: airTimestamp(e),
        title: e.series?.title || e.title || 'Unknown',
        subtitle: [tag, epName].filter(Boolean).join(' · ') || undefined,
      };
    },
  });
}

function fetchHistory({ config, http }) {
  return fetchArrHistory({
    config,
    http,
    query: 'includeSeries=true&includeEpisode=true',
    limit: LIST_CAP,
    mapRecord: (r) => ({
      title: r.series?.title ? `${r.series.title}${episodeTag(r.episode)}` : r.sourceTitle || 'Unknown',
      subtitle: [arrQuality(r), arrAgo(r.date)].filter(Boolean).join(' · ') || undefined,
      image: arrPoster(r.series?.images),
    }),
  });
}

function episodeTag(episode) {
  const season = episode?.seasonNumber;
  const num = episode?.episodeNumber;
  if (season === undefined || num === undefined) return '';
  return ` S${String(season).padStart(2, '0')}E${String(num).padStart(2, '0')}`;
}

function airTimestamp(episode) {
  const raw = episode.airDateUtc || episode.airDate;
  if (!raw) return Infinity;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? Infinity : ts;
}
