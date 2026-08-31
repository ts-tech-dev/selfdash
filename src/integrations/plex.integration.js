import { BaseIntegration } from './_base.js';
import { viewField, resolveViews, runViews } from './_views.js';

const VIEWS = {
  nowplaying: { label: 'Now playing', run: fetchNowPlaying },
  stats: { label: 'Library stats', run: fetchLibraryStats },
};

export default class PlexIntegration extends BaseIntegration {
  static key = 'plex';
  static title = 'Plex';
  static defaultInterval = 45;
  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'token', label: 'X-Plex-Token', type: 'password', required: true },
      viewField(VIEWS, { defaultKey: 'nowplaying' }),
    ],
  };

  async fetchData(ctx) {
    return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'nowplaying'));
  }
}

async function fetchNowPlaying({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const url = `${base}/status/sessions?X-Plex-Token=${encodeURIComponent(config.token)}`;
  const data = await http.fetchJson(url, { headers: { Accept: 'application/json' } });
  const items = data.MediaContainer?.Metadata || [];

  return {
    type: 'nowplaying',
    items: items.map((m) => ({
      title: m.title,
      subtitle: m.grandparentTitle || m.parentTitle || m.User?.title || undefined,
      image: m.thumb ? `${base}${m.thumb}?X-Plex-Token=${encodeURIComponent(config.token)}` : undefined,
      progress: m.duration ? Math.max(0, Math.min(1, (m.viewOffset || 0) / m.duration)) : undefined,
    })),
  };
}

async function fetchLibraryStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const token = encodeURIComponent(config.token);
  const headers = { Accept: 'application/json' };

  const sectionsData = await http.fetchJson(`${base}/library/sections?X-Plex-Token=${token}`, { headers });
  const sections = sectionsData.MediaContainer?.Directory || [];

  const items = [];
  for (const section of sections) {
    try {
      // X-Plex-Container-Size=0 is meant to ask for the count only. Docs (and some Plex
      // versions) put that count in `totalSize` while `size` stays 0; the real server this
      // was tested against instead ignores the container-size hint and returns `size` as the
      // true count with `totalSize` undefined — so check both rather than trust one.
      const countData = await http.fetchJson(
        `${base}/library/sections/${section.key}/all?X-Plex-Token=${token}&X-Plex-Container-Size=0`,
        { headers }
      );
      // totalSize checked first, not size — `??` only falls through on null/undefined, and on
      // a server that DOES honor container-size=0 (size: 0, totalSize: <real count>), checking
      // size first would wrongly stop at 0 instead of falling through to the real count.
      const count = countData.MediaContainer?.totalSize ?? countData.MediaContainer?.size ?? 0;
      items.push({ label: section.title, value: count });
    } catch {
      items.push({ label: section.title, value: '?' });
    }
  }

  return { type: 'stats', items };
}
