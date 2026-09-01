import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Gluetun's HTTP control server (default :8000). Auth is optional — older builds have none;
// newer builds can require a Bearer API key (HTTP_CONTROL_SERVER_AUTH). The VPN-status path
// was renamed (/v1/openvpn/status -> /v1/vpn/status), so both are tried.

const VIEWS = {
  status: { label: 'VPN status', run: fetchStatus },
};

export default class GluetunIntegration extends BaseIntegration {
  static key = 'gluetun';
  static title = 'Gluetun';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Control server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API key (if control server auth is enabled)', type: 'password', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchStatus({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const headers = config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};

  const [ipRes, pfRes] = await Promise.allSettled([
    http.fetchJson(`${base}/v1/publicip/ip`, { headers }),
    http.fetchJson(`${base}/v1/portforwarded`, { headers }),
  ]);

  let vpn = 'unknown';
  for (const path of ['/v1/vpn/status', '/v1/openvpn/status']) {
    try {
      const r = await http.fetchJson(`${base}${path}`, { headers });
      if (r?.status) {
        vpn = r.status;
        break;
      }
    } catch {
      /* try the next path */
    }
  }

  // If we couldn't reach the control server for anything, fail the poll so the tile keeps
  // its last good data rather than showing a row of dashes.
  if (ipRes.status === 'rejected' && vpn === 'unknown') {
    throw new Error(ipRes.reason?.message || 'gluetun control server unreachable');
  }

  const ip = ipRes.status === 'fulfilled' ? ipRes.value : {};
  const pf = pfRes.status === 'fulfilled' ? pfRes.value : {};

  return {
    type: 'stats',
    items: [
      { label: 'VPN', value: vpn },
      { label: 'Public IP', value: ip.public_ip || ip.ip || '-' },
      { label: 'Location', value: [ip.city, ip.country].filter(Boolean).join(', ') || ip.region || '-' },
      { label: 'Fwd port', value: pf.port || '-' },
    ],
  };
}
