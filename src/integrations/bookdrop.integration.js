import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Bookdrop: a self-hosted tracker for upcoming audiobook releases from the authors in your
// Audiobookshelf library. Plain JSON API under /api/v1, no auth by default (an optional
// Bearer key is accepted in case a build puts the control endpoints behind one).
//
//   GET /api/v1/stats              -> { authors_tracked, upcoming_count, next_release }
//   GET /api/v1/releases/upcoming  -> { count, releases: [ { title, author, release_date,
//                                       days_until, series, series_sequence, status,
//                                       cover_url, ... } ] }

const VIEWS = {
  stats: { label: 'Overview', run: fetchStats },
  upcoming: { label: 'Upcoming releases', run: fetchUpcoming },
};

export default class BookdropIntegration extends BaseIntegration {
  static key = 'bookdrop';
  static title = 'Bookdrop';
  static defaultInterval = 900;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API key (only if the API is behind auth)', type: 'password', required: false },
      { name: 'listLimit', label: 'Rows for the upcoming list (max 30)', type: 'number', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const headersOf = (config) => (config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {});
const get = (config, http, path) => http.fetchJson(`${baseOf(config)}${path}`, { headers: headersOf(config) });

function listLimit(config) {
  return Math.min(30, Math.max(1, Number(config.listLimit) || 12));
}

// Bookdrop already computes days_until server-side; turn it into a short relative label.
function relDays(days) {
  if (days == null || !Number.isFinite(Number(days))) return undefined;
  const n = Number(days);
  if (n <= 0) return 'out now';
  if (n === 1) return 'tomorrow';
  return `in ${n}d`;
}

function dateLabel(iso) {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(t).toLocaleDateString();
}

function seriesLabel(r) {
  if (!r.series) return undefined;
  return r.series_sequence ? `${r.series} #${r.series_sequence}` : r.series;
}

async function fetchStats({ config, http }) {
  const d = await get(config, http, '/api/v1/stats');
  const next = d.next_release || null;
  return {
    type: 'stats',
    items: [
      { label: 'Authors tracked', value: d.authors_tracked ?? 0 },
      { label: 'Upcoming', value: d.upcoming_count ?? 0 },
      { label: 'Next release', value: next?.title || '—' },
      { label: 'Arrives', value: next ? relDays(next.days_until) || dateLabel(next.release_date) || '—' : '—' },
    ],
  };
}

async function fetchUpcoming({ config, http }) {
  const d = await get(config, http, '/api/v1/releases/upcoming');
  const releases = Array.isArray(d.releases) ? d.releases : [];

  return {
    type: 'list',
    items: releases.slice(0, listLimit(config)).map((r) => {
      const when = [dateLabel(r.release_date), relDays(r.days_until) && `(${relDays(r.days_until)})`]
        .filter(Boolean)
        .join(' ');
      return {
        title: r.title || 'Untitled',
        subtitle: [r.author, seriesLabel(r), when || undefined].filter(Boolean).join(' · ') || undefined,
        image: r.cover_url || undefined,
      };
    }),
  };
}
