import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Komga: HTTP basic auth. The v1 list endpoints all return a Spring `Page` object whose
// `totalElements` is the count we want, so `?size=1` is enough to read a total cheaply.

const VIEWS = {
  stats: { label: 'Library stats', run: fetchStats },
};

export default class KomgaIntegration extends BaseIntegration {
  static key = 'komga';
  static title = 'Komga';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');

function authHeaders(config) {
  const basic = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  return { headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' } };
}

async function total({ config, http }, path) {
  const sep = path.includes('?') ? '&' : '?';
  const data = await http.fetchJson(`${baseOf(config)}${path}${sep}size=1`, authHeaders(config));
  return Number(data.totalElements) || 0;
}

async function fetchStats(ctx) {
  const [series, books, readBooks] = await Promise.all([
    total(ctx, '/api/v1/series'),
    total(ctx, '/api/v1/books'),
    total(ctx, '/api/v1/books?read_status=READ'),
  ]);
  const readPct = books > 0 ? Math.round((readBooks / books) * 100) : 0;
  return {
    type: 'stats',
    items: [
      { label: 'Series', value: series },
      { label: 'Books', value: books },
      { label: 'Read', value: `${readPct}%` },
    ],
  };
}
