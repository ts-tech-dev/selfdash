import { BaseIntegration } from './_base.js';
import { viewField, resolveViews, runViews } from './_views.js';

// Overseerr / Jellyseerr / seerr all speak the same API: /api/v1, X-Api-Key header.
// The /count endpoints are cheap; the list views resolve each item's title through the
// server's own TMDB proxy (/api/v1/movie|tv/{tmdbId}), memoized per poll.

const VIEWS = {
  requests: { label: 'Request counts', run: fetchRequestCounts },
  issues: { label: 'Issue counts', run: fetchIssueCounts },
  media: { label: 'Media counts', run: fetchMediaCounts },
  recent: { label: 'Recent requests', run: fetchRecentRequests },
  available: { label: 'Recently available', run: fetchRecentlyAvailable },
  status: { label: 'Server status', run: fetchStatus },
};

export default class OverseerrIntegration extends BaseIntegration {
  static key = 'overseerr';
  static title = 'Overseerr';
  static defaultInterval = 120;
  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      viewField(VIEWS, { defaultKey: 'requests' }),
      { name: 'listLimit', label: 'Rows for list views (max 25)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'requests'));
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ 'X-Api-Key': config.apiKey });
const get = (config, http, path) => http.fetchJson(`${baseOf(config)}${path}`, { headers: authHeaders(config) });

function listLimit(config) {
  return Math.min(25, Math.max(1, Number(config.listLimit) || 12));
}

// MediaRequest.status and Media.status share this enum in Overseerr.
const REQUEST_STATUS = { 1: 'pending', 2: 'approved', 3: 'declined', 4: 'failed', 5: 'completed' };
const MEDIA_STATUS = { 1: 'unknown', 2: 'pending', 3: 'processing', 4: 'partial', 5: 'available' };

function ago(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return undefined;
  const diff = Date.now() - t;
  const day = 86400000;
  if (diff < 0) return new Date(t).toLocaleDateString();
  if (diff < 3600000) return `${Math.max(1, Math.round(diff / 60000))}m ago`;
  if (diff < day) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(t).toLocaleDateString();
}

// TMDB poster sizes: w92 w154 w185 … — w154 is plenty for a list thumbnail.
const POSTER_BASE = 'https://image.tmdb.org/t/p/w154';
const posterUrl = (path) => (path ? `${POSTER_BASE}${path}` : undefined);

// Requests/media carry only a tmdbId; resolve title + poster through the server's TMDB
// proxy, caching so a repeated item (or the same view across a multi-section tile) is
// only fetched once per poll.
function makeDetailResolver(config, http) {
  const cache = new Map();
  return function detail(mediaType, tmdbId) {
    if (!tmdbId) return Promise.resolve({ title: 'Unknown', posterPath: null });
    const key = `${mediaType}:${tmdbId}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        get(config, http, `/api/v1/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}`)
          .then((d) => ({
            title: d.title || d.name || d.originalTitle || d.originalName || `#${tmdbId}`,
            posterPath: d.posterPath || null,
          }))
          .catch(() => ({ title: `#${tmdbId}`, posterPath: null }))
      );
    }
    return cache.get(key);
  };
}

async function fetchRequestCounts({ config, http }) {
  const d = await get(config, http, '/api/v1/request/count');
  return {
    type: 'stats',
    items: [
      { label: 'Pending', value: d.pending ?? 0 },
      { label: 'Approved', value: d.approved ?? 0 },
      { label: 'Processing', value: d.processing ?? 0 },
      { label: 'Available', value: d.available ?? 0 },
    ],
  };
}

async function fetchIssueCounts({ config, http }) {
  const d = await get(config, http, '/api/v1/issue/count');
  return {
    type: 'stats',
    items: [
      { label: 'Open', value: d.open ?? 0 },
      { label: 'Closed', value: d.closed ?? 0 },
      { label: 'Total', value: d.total ?? 0 },
    ],
  };
}

// Media state across the whole library (distinct from request lifecycle counts above).
async function fetchMediaCounts({ config, http }) {
  const count = (filter) =>
    get(config, http, `/api/v1/media?take=1&filter=${filter}`)
      .then((d) => d.pageInfo?.results ?? 0)
      .catch(() => 0);
  const [available, partial, processing, pending] = await Promise.all([
    count('available'),
    count('partial'),
    count('processing'),
    count('pending'),
  ]);
  return {
    type: 'stats',
    items: [
      { label: 'Available', value: available },
      { label: 'Partial', value: partial },
      { label: 'Processing', value: processing },
      { label: 'Pending', value: pending },
    ],
  };
}

async function fetchRecentRequests({ config, http }) {
  const limit = listLimit(config);
  const d = await get(config, http, `/api/v1/request?take=${limit}&skip=0&sort=added&filter=all`);
  const resolve = makeDetailResolver(config, http);

  const items = await Promise.all(
    (d.results || []).map(async (r) => {
      const mediaStatus = MEDIA_STATUS[r.media?.status];
      const state =
        mediaStatus === 'available' || mediaStatus === 'partial'
          ? mediaStatus
          : REQUEST_STATUS[r.status] || 'requested';
      const { title, posterPath } = await resolve(r.type, r.media?.tmdbId);
      return {
        title: `${title}${r.is4k ? ' (4K)' : ''}`,
        subtitle:
          [r.requestedBy?.displayName || r.requestedBy?.username, state, ago(r.createdAt)]
            .filter(Boolean)
            .join(' · ') || undefined,
        image: posterUrl(posterPath),
      };
    })
  );
  return { type: 'list', items };
}

async function fetchRecentlyAvailable({ config, http }) {
  const limit = listLimit(config);
  const d = await get(config, http, `/api/v1/media?take=${limit}&skip=0&sort=mediaAdded&filter=available`);
  const resolve = makeDetailResolver(config, http);

  const items = await Promise.all(
    (d.results || []).map(async (m) => {
      const { title, posterPath } = await resolve(m.mediaType, m.tmdbId);
      return {
        title,
        subtitle: [m.mediaType === 'tv' ? 'TV' : 'Movie', ago(m.mediaAddedAt)].filter(Boolean).join(' · ') || undefined,
        image: posterUrl(posterPath),
      };
    })
  );
  return { type: 'list', items };
}

async function fetchStatus({ config, http }) {
  const d = await get(config, http, '/api/v1/status');
  return {
    type: 'stats',
    items: [
      { label: 'Version', value: d.version || '-' },
      { label: 'Update', value: d.updateAvailable ? 'available' : 'up to date' },
      { label: 'Behind', value: Number(d.commitsBehind) || 0 },
    ],
  };
}
