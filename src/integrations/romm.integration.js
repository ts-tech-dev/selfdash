import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';
import { fmtBytes } from '../shared/format.js';

// RomM (retro-game library manager): `GET /api/stats` returns the whole-library
// counts in one call. Auth is HTTP basic (username/password) — optional on instances
// that leave the API open.

const VIEWS = {
  stats: { label: 'Library stats', run: fetchStats },
};

export default class RommIntegration extends BaseIntegration {
  static key = 'romm';
  static title = 'RomM';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text', required: false },
      { name: 'password', label: 'Password', type: 'password', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchStats({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const headers = { Accept: 'application/json' };
  if (config.username) {
    headers.Authorization = `Basic ${Buffer.from(`${config.username}:${config.password || ''}`).toString('base64')}`;
  }
  const s = await http.fetchJson(`${base}/api/stats`, { headers });
  return {
    type: 'stats',
    items: [
      { label: 'Platforms', value: Number(s.PLATFORMS) || 0 },
      { label: 'ROMs', value: Number(s.ROMS) || 0 },
      { label: 'Saves', value: Number(s.SAVES) || 0 },
      { label: 'States', value: Number(s.STATES) || 0 },
      { label: 'Library size', value: fmtBytes(Number(s.TOTAL_FILESIZE_BYTES) || 0) },
    ],
  };
}
