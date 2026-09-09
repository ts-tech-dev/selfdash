import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Home Assistant: GET /api/states with a long-lived access token (Profile -> Security
// -> Long-Lived Access Tokens). `entities` (optional, comma-separated entity IDs) lets
// the user surface specific entity states; without it, `stats` is just counts and
// `entities` (list) shows the first 20 states as a fallback.

const VIEWS = {
  stats: { label: 'Home stats', run: fetchStats },
  entities: { label: 'Chosen entities', run: fetchEntityList },
};

export default class HomeAssistantIntegration extends BaseIntegration {
  static key = 'homeassistant';
  static title = 'Home Assistant';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'token', label: 'Long-lived access token', type: 'password', required: true },
      { name: 'entities', label: 'Entity IDs to surface (comma-separated, optional)', type: 'text', required: false },
      { name: 'allowInsecureTLS', label: 'Allow self-signed / insecure TLS certificate', type: 'checkbox', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchStates({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const data = await http.fetchJson(`${base}/api/states`, {
    headers: { Authorization: `Bearer ${config.token}` },
    insecureTLS: config.allowInsecureTLS,
  });
  return Array.isArray(data) ? data : [];
}

function chosenEntityIds(config) {
  return String(config.entities || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function fetchStats(ctx) {
  const states = await fetchStates(ctx);
  const automations = states.filter((s) => s.entity_id.startsWith('automation.'));
  const items = [
    { label: 'Entities', value: states.length },
    { label: 'Automations', value: automations.length },
  ];

  for (const id of chosenEntityIds(ctx.config)) {
    const ent = states.find((s) => s.entity_id === id);
    items.push({ label: ent?.attributes?.friendly_name || id, value: ent ? ent.state : 'unavailable' });
  }
  return { type: 'stats', items };
}

async function fetchEntityList(ctx) {
  const states = await fetchStates(ctx);
  const chosen = chosenEntityIds(ctx.config);
  const list = chosen.length
    ? chosen.map((id) => states.find((s) => s.entity_id === id)).filter(Boolean)
    : states.slice(0, 20);

  return {
    type: 'list',
    items: list.map((s) => ({ title: s.attributes?.friendly_name || s.entity_id, subtitle: s.state })),
  };
}
