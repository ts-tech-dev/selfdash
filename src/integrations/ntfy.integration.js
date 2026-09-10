import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// ntfy: read cached messages for a topic with `GET /<topic>/json?poll=1&since=<window>`.
// The body is newline-delimited JSON — one object per line, `event` is one of
// open / keepalive / message; we keep only `message` events. Auth is an optional
// bearer token (needed for a protected topic).

const VIEWS = {
  messages: { label: 'Recent messages', run: fetchMessages },
};

export default class NtfyIntegration extends BaseIntegration {
  static key = 'ntfy';
  static title = 'ntfy';
  static defaultInterval = 60;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'topic', label: 'Topic', type: 'text', required: true },
      { name: 'token', label: 'Access Token', type: 'password', required: false },
      { name: 'since', label: 'Lookback window (e.g. 12h, 1d)', type: 'text', required: false },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

async function fetchMessages({ config, http }) {
  const base = config.url.replace(/\/+$/, '');
  const topic = encodeURIComponent(config.topic);
  const since = config.since && String(config.since).trim() ? String(config.since).trim() : '12h';
  const headers = { Accept: 'application/x-ndjson' };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  const res = await http.fetch(`${base}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`, { headers });
  if (!res.ok) throw new Error(`ntfy responded ${res.status} ${res.statusText}`);
  const text = await res.text();

  const msgs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((m) => m && m.event === 'message')
    .sort((a, b) => (b.time || 0) - (a.time || 0))
    .slice(0, 20);

  if (msgs.length === 0) return { type: 'list', items: [{ title: `No messages in the last ${since}` }] };

  return {
    type: 'list',
    items: msgs.map((m) => ({
      title: m.title || m.message?.replace(/\s+/g, ' ').trim().slice(0, 80) || '(no content)',
      subtitle: [m.title ? m.message?.replace(/\s+/g, ' ').trim().slice(0, 140) : null, m.time ? new Date(m.time * 1000).toLocaleString() : null]
        .filter(Boolean)
        .join(' · ') || undefined,
    })),
  };
}
