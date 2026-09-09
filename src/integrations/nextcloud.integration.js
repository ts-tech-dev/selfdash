import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';
import { fmtBytes } from '../shared/format.js';

// Nextcloud's serverinfo app: GET /ocs/v2.php/apps/serverinfo/api/v1/info?format=json
// with an `OCS-APIRequest: true` header and HTTP basic auth (an app password is
// recommended over the account password). Requires the bundled "serverinfo" app to be
// enabled (it is by default).

const VIEWS = {
  stats: { label: 'Server stats', run: fetchStats },
};

export default class NextcloudIntegration extends BaseIntegration {
  static key = 'nextcloud';
  static title = 'Nextcloud';
  static defaultInterval = 120;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password (app password recommended)', type: 'password', required: true },
      { name: 'allowInsecureTLS', label: 'Allow self-signed / insecure TLS certificate', type: 'checkbox', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchInfo({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const basic = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const res = await http.fetchJson(`${base}/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`, {
    headers: { 'OCS-APIRequest': 'true', Authorization: `Basic ${basic}` },
    insecureTLS: config.allowInsecureTLS,
  });
  return res?.ocs?.data || {};
}

async function fetchStats(ctx) {
  const data = await fetchInfo(ctx);
  const nc = data.nextcloud || {};
  // Confirmed live: `system.apps` (update count) is absent on a fresh install with no
  // apps needing updates — `?? 0` below just reads as "no updates" rather than crashing.
  const sys = nc.system || {};
  const storage = nc.storage || {};
  const active = data.activeUsers || {};

  return {
    type: 'stats',
    items: [
      { label: 'Active (24h)', value: active.last24hours ?? 0 },
      { label: 'Users', value: storage.num_users ?? 0 },
      { label: 'Files', value: storage.num_files ?? 0 },
      { label: 'Free space', value: fmtBytes(sys.freespace) },
      { label: 'Updates', value: sys.apps?.num_updates_available ?? 0 },
    ],
  };
}
