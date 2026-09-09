// Shared by the Jellyfin and Emby integrations. Jellyfin is a fork of Emby and the two
// still speak the same API for what we need: an access token in an `X-Emby-Token` header
// (also accepted as an `api_key` query param, which is what the image URLs want),
// `/Sessions` for active playback, `/Items/Counts` for library totals. The two
// integration files differ only in their static key/title.
import { runAllViews } from './_views.js';

const VIEWS = {
  nowplaying: { label: 'Now playing', run: fetchNowPlaying },
  stats: { label: 'Library stats', run: fetchLibraryStats },
};

// { viewKey: label } for `static views` — same shape the other integrations expose.
export const embyViews = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

export function fetchEmbyData(ctx) {
  return runAllViews(ctx, VIEWS);
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const authHeaders = (config) => ({ 'X-Emby-Token': config.apiKey, Accept: 'application/json' });
// The token also has to ride in the query string for image URLs (which the browser loads
// directly, with no chance to set a header) and for servers that only check the param.
const withKey = (base, path, config) =>
  `${base}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(config.apiKey)}`;

async function fetchNowPlaying({ config, http }) {
  const base = baseOf(config);
  const sessions = await http.fetchJson(withKey(base, '/Sessions', config), { headers: authHeaders(config) });
  // Most sessions are idle (a paused client, a web UI sitting open) — only the ones with a
  // NowPlayingItem are actually playing something.
  const active = (Array.isArray(sessions) ? sessions : []).filter((s) => s && s.NowPlayingItem);

  return {
    type: 'nowplaying',
    items: active.map((s) => {
      const item = s.NowPlayingItem || {};
      const runtimeTicks = Number(item.RunTimeTicks) || 0; // ticks = 100-ns units
      const posTicks = Number(s.PlayState && s.PlayState.PositionTicks) || 0;
      // An episode/track looks best under its show/album poster; fall back to the item itself.
      const imageId = item.SeriesId || item.AlbumId || item.ParentId || item.Id;
      return {
        title: item.Name || 'Unknown',
        subtitle:
          item.SeriesName ||
          item.Album ||
          (Array.isArray(item.Artists) ? item.Artists.join(', ') : undefined) ||
          s.UserName ||
          undefined,
        image: imageId
          ? `${base}/Items/${imageId}/Images/Primary?api_key=${encodeURIComponent(config.apiKey)}&fillHeight=180`
          : undefined,
        progress: runtimeTicks ? Math.max(0, Math.min(1, posTicks / runtimeTicks)) : undefined,
      };
    }),
  };
}

async function fetchLibraryStats({ config, http }) {
  const base = baseOf(config);
  const c = await http.fetchJson(withKey(base, '/Items/Counts', config), { headers: authHeaders(config) });
  return {
    type: 'stats',
    items: [
      { label: 'Movies', value: c.MovieCount ?? 0 },
      { label: 'Series', value: c.SeriesCount ?? 0 },
      { label: 'Episodes', value: c.EpisodeCount ?? 0 },
      { label: 'Songs', value: c.SongCount ?? 0 },
    ],
  };
}
