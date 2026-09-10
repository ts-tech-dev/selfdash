import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Gotify: a client token (`X-Gotify-Key` header, or `?token=`). `/message` returns the
// most recent messages newest-first; `/application` and `/client` give the counts.

const VIEWS = {
  messages: { label: 'Recent messages', run: fetchMessages },
  stats: { label: 'Server stats', run: fetchStats },
};

export default class GotifyIntegration extends BaseIntegration {
  static key = 'gotify';
  static title = 'Gotify';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'clientToken', label: 'Client Token', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const auth = (config) => ({ headers: { 'X-Gotify-Key': config.clientToken, Accept: 'application/json' } });

async function fetchMessages({ config, http }) {
  const data = await http.fetchJson(`${baseOf(config)}/message?limit=20`, auth(config));
  const messages = Array.isArray(data.messages) ? data.messages : [];
  if (messages.length === 0) return { type: 'list', items: [{ title: 'No messages' }] };
  return {
    type: 'list',
    items: messages.map((m) => ({
      title: m.title || 'Message',
      subtitle: [m.message?.replace(/\s+/g, ' ').trim().slice(0, 140), m.date ? new Date(m.date).toLocaleString() : null]
        .filter(Boolean)
        .join(' · ') || undefined,
    })),
  };
}

async function fetchStats({ config, http }) {
  const [apps, clients] = await Promise.all([
    http.fetchJson(`${baseOf(config)}/application`, auth(config)).catch(() => []),
    http.fetchJson(`${baseOf(config)}/client`, auth(config)).catch(() => []),
  ]);
  return {
    type: 'stats',
    items: [
      { label: 'Applications', value: Array.isArray(apps) ? apps.length : 0 },
      { label: 'Clients', value: Array.isArray(clients) ? clients.length : 0 },
    ],
  };
}
