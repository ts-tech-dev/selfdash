import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Scrutiny (analogj/scrutiny) SMART disk monitoring. GET /api/summary, no auth by
// default. Response is `{ data: { <wwn>: { device: {...}, smart: { status, temp } } } }`
// keyed by drive WWN rather than a plain array — a non-zero `smart.status` means SMART
// has flagged the drive.

const VIEWS = {
  status: { label: 'Drive health', run: fetchStatus },
  stats: { label: 'Health summary', run: fetchStats },
};

export default class ScrutinyIntegration extends BaseIntegration {
  static key = 'scrutiny';
  static title = 'Scrutiny';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [{ name: 'url', label: 'Server URL', type: 'url', required: true }],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchDevices({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const data = await http.fetchJson(`${base}/api/summary`);
  return data?.data && typeof data.data === 'object' ? Object.values(data.data) : [];
}

const isFailing = (d) => Number(d.smart?.status ?? d.device?.device_status ?? 0) !== 0;

async function fetchStatus(ctx) {
  const devices = await fetchDevices(ctx);
  return {
    type: 'status',
    items: devices.map((d) => {
      const temp = d.smart?.temp ?? d.device?.temp;
      return {
        label: d.device?.device_name || d.device?.model_name || 'disk',
        state: isFailing(d) ? 'down' : 'up',
        detail: typeof temp === 'number' ? `${temp}°C` : undefined,
      };
    }),
  };
}

async function fetchStats(ctx) {
  const devices = await fetchDevices(ctx);
  const failed = devices.filter(isFailing).length;
  return {
    type: 'stats',
    items: [
      { label: 'Passed', value: devices.length - failed },
      { label: 'Failed', value: failed },
      { label: 'Total', value: devices.length },
    ],
  };
}
