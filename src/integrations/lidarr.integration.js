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
import { runAllViews } from './_views.js';

// Lidarr, like Readarr, is still on the v1 API — Radarr/Sonarr moved to v3. Records are
// album-shaped, hydrated with the linked artist via `includeArtist`.
const V = 'v1';
const LIST_CAP = 25;

const VIEWS = {
  queue: { label: 'Download queue', run: fetchQueue },
  stats: { label: 'Library stats', run: fetchLibraryStats },
  upcoming: { label: 'Upcoming releases', run: fetchUpcoming },
  calendar: { label: 'Release calendar', run: fetchCalendar },
  history: { label: 'Recently imported', run: fetchHistory },
  health: { label: 'Health', run: (ctx) => fetchArrHealth({ ...ctx, apiVersion: V }) },
  disk: { label: 'Disk space', run: (ctx) => fetchArrDiskspace({ ...ctx, apiVersion: V }) },
};

export default class LidarrIntegration extends BaseIntegration {
  static key = 'lidarr';
  static title = 'Lidarr';
  static mergeGroup = 'arr';
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

// "Artist — Album", trimmed cleanly when one side is missing.
function releaseTitle(artistName, albumTitle) {
  return [artistName, albumTitle].filter(Boolean).join(' — ') || 'Unknown';
}

function fetchQueue({ config, http }) {
  return fetchArrQueue({
    config,
    http,
    apiPath: '/api/v1/queue',
    query: 'includeArtist=true&includeAlbum=true',
    mapRecord: (r) => ({
      title: r.artist?.artistName || r.album?.title ? releaseTitle(r.artist?.artistName, r.album?.title) : r.title || 'Unknown',
      status: arrQueueStatus(r),
      progress: progressFromSize(r),
    }),
  });
}

async function fetchLibraryStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const artists = await http.fetchJson(`${base}/api/v1/artist`, { headers: { 'X-Api-Key': config.apiKey } });

  const monitored = artists.filter((a) => a.monitored).length;
  const tracksDownloaded = artists.reduce((sum, a) => sum + (a.statistics?.trackFileCount || 0), 0);
  // trackCount = tracks Lidarr expects to have (released, monitored); trackFileCount = on disk.
  const tracksWanted = artists.reduce((sum, a) => sum + (a.statistics?.trackCount || 0), 0);

  return {
    type: 'stats',
    items: [
      { label: 'Artists', value: artists.length },
      { label: 'Monitored', value: monitored },
      { label: 'Tracks', value: tracksDownloaded },
      { label: 'Missing', value: Math.max(0, tracksWanted - tracksDownloaded) },
    ],
  };
}

async function fetchUpcoming({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const days = Number(config.upcomingDays) > 0 ? Number(config.upcomingDays) : 30;
  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  const isoDate = (d) => d.toISOString().slice(0, 10);

  const albums = await http.fetchJson(
    `${base}/api/v1/calendar?start=${isoDate(start)}&end=${isoDate(end)}&includeArtist=true&unmonitored=false`,
    { headers: { 'X-Api-Key': config.apiKey } }
  );

  albums.sort((a, b) => releaseTimestamp(a) - releaseTimestamp(b));

  return {
    type: 'list',
    items: albums.slice(0, LIST_CAP).map((a) => {
      const ts = releaseTimestamp(a);
      return {
        title: releaseTitle(a.artist?.artistName, a.title),
        subtitle: Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : undefined,
        image: arrPoster(a.artist?.images),
      };
    }),
  };
}

function fetchCalendar({ config, http }) {
  return fetchArrCalendar({
    config,
    http,
    apiVersion: V,
    query: 'includeArtist=true',
    mapEvent: (a) => ({
      ts: releaseTimestamp(a),
      title: a.artist?.artistName || a.title || 'Unknown',
      subtitle: a.artist?.artistName ? a.title : undefined,
      image: arrPoster(a.artist?.images),
    }),
  });
}

function fetchHistory({ config, http }) {
  return fetchArrHistory({
    config,
    http,
    apiVersion: V,
    query: 'includeArtist=true&includeAlbum=true',
    limit: LIST_CAP,
    mapRecord: (r) => ({
      title: releaseTitle(r.artist?.artistName, r.album?.title || r.sourceTitle),
      subtitle: [arrQuality(r), arrAgo(r.date)].filter(Boolean).join(' · ') || undefined,
      image: arrPoster(r.artist?.images),
    }),
  });
}

function releaseTimestamp(album) {
  const raw = album.releaseDate;
  if (!raw) return Infinity;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? Infinity : ts;
}
