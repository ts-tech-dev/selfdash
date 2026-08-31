import { BaseIntegration } from './_base.js';
import { viewField, resolveViews, runViews } from './_views.js';

// Tautulli exposes a single endpoint: GET /api/v2?apikey=<key>&cmd=<command>&<params...>
// Every response is wrapped in { response: { result: 'success' | 'error', message, data } }
// and comes back HTTP 200 even on a command error — so the envelope has to be checked
// explicitly (same shape of guard as the SABnzbd integration's `data.error`).

const VIEWS = {
  activity: { label: 'Now playing', run: fetchActivity },
  streams: { label: 'All active streams', run: fetchStreams },
  stats: { label: 'Activity stats', run: fetchActivityStats },
  libraries: { label: 'Library counts', run: fetchLibraries },
  history: { label: 'Recent history', run: fetchHistory },
};

export default class TautulliIntegration extends BaseIntegration {
  static key = 'tautulli';
  static title = 'Tautulli';
  static defaultInterval = 30;
  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
      viewField(VIEWS, { defaultKey: 'activity' }),
      // The image proxy needs the API key as a query param, so enabling art puts the key
      // in browser-visible <img> URLs — same trade-off the Plex integration already makes
      // with X-Plex-Token. Off by default; opt in if the widget is only exposed to trusted eyes.
      { name: 'art', label: 'Show poster art (embeds API key in image URLs)', type: 'checkbox', required: false },
      { name: 'historyLimit', label: 'History rows (max 25)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'activity'));
  }
}

async function tautulliCall({ config, http }, cmd, params = {}) {
  const base = config.url.replace(/\/+$/, '');
  const qs = new URLSearchParams({ apikey: config.apiKey, cmd, out_type: 'json', ...params });
  const body = await http.fetchJson(`${base}/api/v2?${qs}`);
  const res = body?.response;
  if (!res || res.result !== 'success') {
    throw new Error(res?.message || `Tautulli command '${cmd}' failed`);
  }
  return res.data;
}

function pctFraction(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : undefined;
}

// e.g. "playing · transcode", "paused"
function streamStatus(session) {
  const decision = session.transcode_decision;
  const kind = decision === 'transcode' ? 'transcode' : decision === 'copy' ? 'direct stream' : 'direct play';
  return [session.state, kind].filter(Boolean).join(' · ');
}

function artUrl(base, apiKey, imgPath) {
  const qs = new URLSearchParams({
    apikey: apiKey,
    cmd: 'pms_image_proxy',
    img: imgPath,
    width: '300',
    height: '450',
    fallback: 'poster',
  });
  return `${base}/api/v2?${qs}`;
}

function sessionsOf(data) {
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

async function fetchActivity({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const data = await tautulliCall({ config, http }, 'get_activity');
  const sessions = sessionsOf(data);

  // The nowplaying renderer only shows items[0]; float an actively-playing stream to the front.
  const order = { playing: 0, buffering: 1, paused: 2 };
  sessions.sort((a, b) => (order[a.state] ?? 3) - (order[b.state] ?? 3));

  return {
    type: 'nowplaying',
    items: sessions.map((s) => ({
      title: s.full_title || s.title || 'Unknown',
      subtitle: [s.friendly_name, s.product || s.player].filter(Boolean).join(' · ') || undefined,
      image: config.art && s.thumb ? artUrl(base, config.apiKey, s.thumb) : undefined,
      progress: pctFraction(s.progress_percent),
    })),
  };
}

async function fetchStreams({ config, http }) {
  const data = await tautulliCall({ config, http }, 'get_activity');
  return {
    type: 'queue',
    items: sessionsOf(data).map((s) => ({
      title: s.full_title || s.title || 'Unknown',
      status: streamStatus(s),
      progress: pctFraction(s.progress_percent),
    })),
  };
}

async function fetchActivityStats({ config, http }) {
  const d = await tautulliCall({ config, http }, 'get_activity');
  const mbps = (Number(d?.total_bandwidth) || 0) / 1000; // Tautulli reports bandwidth in kbps
  return {
    type: 'stats',
    items: [
      { label: 'Streams', value: Number(d?.stream_count) || 0 },
      { label: 'Direct Play', value: Number(d?.stream_count_direct_play) || 0 },
      { label: 'Transcode', value: Number(d?.stream_count_transcode) || 0 },
      { label: 'Bandwidth', value: `${mbps.toFixed(1)} Mbps` },
    ],
  };
}

async function fetchLibraries({ config, http }) {
  const libs = await tautulliCall({ config, http }, 'get_libraries');
  const rows = Array.isArray(libs) ? libs : [];
  return {
    type: 'stats',
    // `count` is the top-level item count (movies, or shows for a TV library — not episodes).
    items: rows.map((l) => ({ label: l.section_name, value: Number(l.count) || 0 })),
  };
}

async function fetchHistory({ config, http }) {
  const limit = Math.min(25, Math.max(1, Number(config.historyLimit) || 5));
  const data = await tautulliCall({ config, http }, 'get_history', {
    length: String(limit),
    order_column: 'date',
    order_dir: 'desc',
  });
  // `length` is passed to Tautulli, but slice too in case a version ignores the pagination param.
  const rows = (Array.isArray(data?.data) ? data.data : []).slice(0, limit);

  return {
    type: 'list',
    items: rows.map((r) => {
      const when = Number(r.date) ? new Date(Number(r.date) * 1000).toLocaleString() : undefined;
      return {
        title: r.full_title || 'Unknown',
        subtitle: [r.friendly_name, when].filter(Boolean).join(' · ') || undefined,
      };
    }),
  };
}
