// Shared by radarr/sonarr/readarr — the *arr family exposes the same resource shapes
// (queue / health / diskspace / history), differing only in API version and the
// `include*` params needed to hydrate the linked movie/series/episode/author records.

export function arrGet(config, http, path) {
  const base = config.url.replace(/\/+$/, '');
  return http.fetchJson(`${base}${path}`, { headers: { 'X-Api-Key': config.apiKey } });
}

export async function fetchArrQueue({ config, http, apiPath, query = '', pageSize = 50, mapRecord }) {
  const sep = apiPath.includes('?') ? '&' : '?';
  const data = await arrGet(config, http, `${apiPath}${sep}pageSize=${pageSize}${query ? `&${query}` : ''}`);
  const records = data.records || (Array.isArray(data) ? data : []);
  return { type: 'queue', items: records.map(mapRecord) };
}

export function progressFromSize(record) {
  const size = record.size;
  const sizeleft = record.sizeleft ?? record.sizeLeft;
  if (!size) return undefined;
  return Math.max(0, Math.min(1, 1 - (sizeleft ?? size) / size));
}

// "00:12:34" or "1.02:03:04" (d.hh:mm:ss) -> "12m" / "2h 3m" / "1d 2h"
function fmtTimeleft(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const days = Number(m[1] || 0);
  const hours = Number(m[2]);
  const mins = Number(m[3]);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const STATE_LABELS = {
  downloading: 'downloading',
  importPending: 'import pending',
  importBlocked: 'import blocked',
  importing: 'importing',
  imported: 'imported',
  failedPending: 'failed',
  failed: 'failed',
  ignored: 'ignored',
  stalled: 'stalled',
};

// A readable one-line status for a queue row: normalized state, ETA while downloading,
// and a ⚠ + reason when the *arr has flagged the download (stalled, missing files, …).
export function arrQueueStatus(record) {
  const state = record.trackedDownloadState || record.status || '';
  const label = STATE_LABELS[state] || state || 'queued';
  const flagged = record.trackedDownloadStatus === 'warning' || record.trackedDownloadStatus === 'error';
  const eta = state === 'downloading' ? fmtTimeleft(record.timeleft) : null;

  let reason = null;
  if (flagged && !eta) {
    const fromMessages =
      Array.isArray(record.statusMessages) && record.statusMessages.length
        ? record.statusMessages[0].messages?.[0] || record.statusMessages[0].title
        : null;
    reason = record.errorMessage || fromMessages || null;
    if (reason && reason.length > 48) reason = `${reason.slice(0, 47)}…`;
  }

  return [flagged ? '⚠' : null, label, eta ? `· ${eta}` : null, reason ? `· ${reason}` : null]
    .filter(Boolean)
    .join(' ');
}

function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  return n >= 1e12 ? `${(n / 1e12).toFixed(2)} TB` : `${(n / 1e9).toFixed(1)} GB`;
}

export function arrAgo(value) {
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

// Health-check issues (System → Status). Shared verbatim across the family.
export async function fetchArrHealth({ config, http, apiVersion = 'v3' }) {
  const rows = await arrGet(config, http, `/api/${apiVersion}/health`);
  const list = Array.isArray(rows) ? rows : [];
  return {
    type: 'list',
    items: list.length
      ? list.map((h) => ({ title: h.message || h.source || 'Issue', subtitle: h.type }))
      : [{ title: 'No health issues' }],
  };
}

// Free space per mount. *arr returns one row per bind mount, so rows that map to the
// same underlying disk (identical free/total) are collapsed.
export async function fetchArrDiskspace({ config, http, apiVersion = 'v3' }) {
  const rows = await arrGet(config, http, `/api/${apiVersion}/diskspace`);
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  const items = [];
  for (const d of list) {
    const key = `${d.freeSpace}/${d.totalSpace}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const free = Number(d.freeSpace) || 0;
    const total = Number(d.totalSpace) || 0;
    const pctFree = total ? Math.round((free / total) * 100) : 0;
    items.push({
      title: d.label || d.path || 'disk',
      subtitle: `${fmtBytes(free)} free of ${fmtBytes(total)} (${pctFree}%)`,
    });
  }
  return { type: 'list', items };
}

// Recently grabbed-and-imported items (history eventType 3 = downloadFolderImported).
export async function fetchArrHistory({ config, http, apiVersion = 'v3', query = '', mapRecord, limit = 15 }) {
  const data = await arrGet(
    config,
    http,
    `/api/${apiVersion}/history?page=1&pageSize=${limit}&sortKey=date&sortDirection=descending` +
      `&eventType=3${query ? `&${query}` : ''}`
  );
  const records = data.records || (Array.isArray(data) ? data : []);
  return { type: 'list', items: records.map(mapRecord) };
}

export function arrQuality(record) {
  return record.quality?.quality?.name || undefined;
}

// Release calendar for a month-grid visualization. Pulls /calendar over a window that
// starts a little in the past (so "aired this week" is still visible) and runs
// `config.upcomingDays` (default 35) ahead. `mapEvent(record)` returns
// { ts, title, subtitle } — rows without a finite `ts` are dropped. The frontend buckets
// by local day, so we only pass the instant, not a pre-formatted date.
export async function fetchArrCalendar({
  config,
  http,
  apiVersion = 'v3',
  query = '',
  mapEvent,
  pastDays = 7,
  defaultAheadDays = 35,
}) {
  const ahead = Number(config.upcomingDays) > 0 ? Number(config.upcomingDays) : defaultAheadDays;
  const start = new Date(Date.now() - pastDays * 86400000);
  const end = new Date(Date.now() + ahead * 86400000);
  const isoDate = (d) => d.toISOString().slice(0, 10);

  const rows = await arrGet(
    config,
    http,
    `/api/${apiVersion}/calendar?start=${isoDate(start)}&end=${isoDate(end)}&unmonitored=false` +
      `${query ? `&${query}` : ''}`
  );
  const list = Array.isArray(rows) ? rows : [];

  const items = list
    .map((r) => {
      const ev = mapEvent(r);
      return ev && Number.isFinite(ev.ts) ? { ts: ev.ts, title: ev.title, subtitle: ev.subtitle } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);

  return { type: 'calendar', items };
}

// Poster URL from an *arr `images` array. Uses the CDN `remoteUrl` (TheTVDB for Sonarr,
// TMDB for Radarr) so no API key rides along; TMDB "original" is downscaled for a thumb.
export function arrPoster(images) {
  const poster = (Array.isArray(images) ? images : []).find((i) => i.coverType === 'poster');
  const url = poster?.remoteUrl;
  if (!url) return undefined;
  return url.replace('https://image.tmdb.org/t/p/original/', 'https://image.tmdb.org/t/p/w154/');
}
