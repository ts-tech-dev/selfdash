import { BaseIntegration } from './_base.js';
import { runAllViews } from './_views.js';

// Paperless-ngx: token auth (`Authorization: Token <token>`). `/api/statistics/` is a
// single cheap call carrying the document/inbox counts and the inbox tag id; the inbox
// list view then pulls the newest documents carrying that tag.

const VIEWS = {
  stats: { label: 'Document stats', run: fetchStats },
  inbox: { label: 'Inbox', run: fetchInbox },
};

export default class PaperlessNgxIntegration extends BaseIntegration {
  static key = 'paperlessngx';
  static title = 'Paperless-ngx';
  static defaultInterval = 300;
  static views = Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v.label]));

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'token', label: 'API Token', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return runAllViews(ctx, VIEWS);
  }
}

const baseOf = (config) => config.url.replace(/\/+$/, '');
const auth = (config) => ({ headers: { Authorization: `Token ${config.token}`, Accept: 'application/json' } });

async function fetchStatistics(ctx) {
  return http_get(ctx, '/api/statistics/');
}

async function http_get({ config, http }, path) {
  return http.fetchJson(`${baseOf(config)}${path}`, auth(config));
}

async function fetchStats(ctx) {
  const s = await fetchStatistics(ctx);
  return {
    type: 'stats',
    items: [
      { label: 'Documents', value: Number(s.documents_total) || 0 },
      { label: 'Inbox', value: Number(s.documents_inbox) || 0 },
      { label: 'Tags', value: Number(s.tag_count) || 0 },
      { label: 'Correspondents', value: Number(s.correspondent_count) || 0 },
      { label: 'Doc types', value: Number(s.document_type_count) || 0 },
    ],
  };
}

async function fetchInbox(ctx) {
  const s = await fetchStatistics(ctx);
  // Paperless 1.x exposed a single `inbox_tag`; 2.x switched to an `inbox_tags` array.
  const inboxTags = Array.isArray(s.inbox_tags) ? s.inbox_tags : s.inbox_tag != null ? [s.inbox_tag] : [];
  if (inboxTags.length === 0) {
    return { type: 'list', items: [{ title: 'No inbox tag configured' }] };
  }
  const data = await http_get(
    ctx,
    `/api/documents/?tags__id__in=${inboxTags.join(',')}&ordering=-created&page_size=20`
  );
  const results = Array.isArray(data.results) ? data.results : [];
  if (results.length === 0) {
    return { type: 'list', items: [{ title: 'Inbox is empty' }] };
  }
  return {
    type: 'list',
    items: results.map((d) => ({
      title: d.title || `Document #${d.id}`,
      subtitle: d.created ? new Date(d.created).toLocaleDateString() : undefined,
    })),
  };
}
