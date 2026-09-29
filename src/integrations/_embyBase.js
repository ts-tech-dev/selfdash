// Shared by the Jellyfin and Emby integrations. Jellyfin is a fork of Emby and the two
// still speak the same API for what we need: `/Sessions` for active playback, `/Items/Counts`
// for library totals. The two integration files differ only in their static key/title.
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

// Jellyfin 12.x's `DisableLegacyAuthorization` migration rejects any request carrying the
// old `?api_key=` query param with a 401 outright, regardless of whether a valid auth header
// is also present. So API calls go through the header-only, non-deprecated `Authorization:
// MediaBrowser ...` scheme (Emby/older Jellyfin also accept `X-Emby-Token`, kept alongside
// for back-compat). Image URLs still need the token in the query string since a plain <img>
// tag can't set headers, and image endpoints aren't covered by that migration.
const authHeaders = (config) => ({
  'X-Emby-Token': config.apiKey,
  Authorization: `MediaBrowser Client="selfdash", Device="selfdash", DeviceId="selfdash", Version="1.0.0", Token="${config.apiKey}"`,
  Accept: 'application/json',
});

async function fetchNowPlaying({ config, http }) {
  const base = baseOf(config);
  const sessions = await http.fetchJson(`${base}/Sessions`, { headers: authHeaders(config) });
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
  const c = await http.fetchJson(`${base}/Items/Counts`, { headers: authHeaders(config) });
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
