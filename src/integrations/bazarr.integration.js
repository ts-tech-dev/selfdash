import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Bazarr manages subtitles for Sonarr/Radarr libraries. Its API is its own thing (not the
// *arr v3 API): unversioned `/api/...` paths, an `X-API-KEY` header (create the key under
// Settings -> General -> Security). `mergeGroup: 'arr'` so its `history` / `health` list
// views can combine with Sonarr/Radarr's in one tile.

const VIEWS = {
  stats: { label: 'Missing / health', run: fetchBadges },
  wanted: { label: 'Wanted subtitles', run: fetchWanted },
  history: { label: 'Recently downloaded', run: fetchHistory },
  health: { label: 'Health', run: fetchHealth },
};

export default class BazarrIntegration extends BaseIntegration {
  static key = 'bazarr';
  static title = 'Bazarr';
  static mergeGroup = 'arr';
  static defaultInterval = 120;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      { name: 'listLimit', label: 'Rows for list views (max 50)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ 'X-API-KEY': config.apiKey });
const get = (config, http, path) => http.fetchJson(`${baseOf(config)}${path}`, { headers: authHeaders(config) });

function rowLimit(config) {
  return Math.min(50, Math.max(1, Number(config.listLimit) || 20));
}

// missing_subtitles: [{ name: 'English', code2: 'en', ... }] -> "en, es"
function langs(missing) {
  const list = (Array.isArray(missing) ? missing : [])
    .map((m) => m.code2 || m.code3 || m.name)
    .filter(Boolean);
  return list.length ? list.join(', ') : undefined;
}

function epTag(record) {
  const raw = record.episode_number || record.episode;
  if (!raw) return '';
  // Bazarr already formats this as "1x04" on the episode rows; pass it through if so.
  return typeof raw === 'string' ? ` ${raw}` : '';
}

async function fetchBadges({ config, http }) {
  const d = await get(config, http, '/api/badges');
  return {
    type: 'stats',
    items: [
      { label: 'Episodes', value: d.episodes ?? 0 },
      { label: 'Movies', value: d.movies ?? 0 },
      { label: 'Health', value: d.status ?? d.health ?? 0 },
      { label: 'Providers', value: d.providers ?? 0 },
    ],
  };
}

async function fetchWanted({ config, http }) {
  const limit = rowLimit(config);
  const [eps, movies] = await Promise.all([
    get(config, http, `/api/episodes/wanted?start=0&length=${limit}`).catch(() => ({ data: [] })),
    get(config, http, `/api/movies/wanted?start=0&length=${limit}`).catch(() => ({ data: [] })),
  ]);

  const epItems = (eps.data || []).map((e) => ({
    title: `${e.seriesTitle || 'Unknown'}${epTag(e)}${e.episodeTitle ? ` — ${e.episodeTitle}` : ''}`,
    subtitle: langs(e.missing_subtitles),
  }));
  const movieItems = (movies.data || []).map((m) => ({
    title: m.title || 'Unknown',
    subtitle: langs(m.missing_subtitles),
  }));

  return { type: 'list', items: [...epItems, ...movieItems].slice(0, limit) };
}

async function fetchHistory({ config, http }) {
  const limit = rowLimit(config);
  const [eps, movies] = await Promise.all([
    get(config, http, `/api/episodes/history?start=0&length=${limit}`).catch(() => ({ data: [] })),
    get(config, http, `/api/movies/history?start=0&length=${limit}`).catch(() => ({ data: [] })),
  ]);

  const row = (r, name) => ({
    title: `${name || 'Unknown'}${r.episodeTitle ? ` — ${r.episodeTitle}` : ''}`,
    subtitle: [r.language?.name || r.language, r.provider, r.timestamp].filter(Boolean).join(' · ') || undefined,
  });

  const items = [
    ...(eps.data || []).map((r) => row(r, r.seriesTitle)),
    ...(movies.data || []).map((r) => row(r, r.title)),
  ].slice(0, limit);

  return { type: 'list', items };
}

async function fetchHealth({ config, http }) {
  const d = await get(config, http, '/api/system/health');
  const list = Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
  return {
    type: 'list',
    items: list.length
      ? list.map((h) => ({ title: h.issue || h.message || 'Issue', subtitle: h.object || undefined }))
      : [{ title: 'No health issues' }],
  };
}
