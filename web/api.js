const BASE = '/api';

async function request(path, opts = {}) {
  // Only set Content-Type when there's actually a body — Fastify's JSON body parser
  // rejects a request that declares application/json but sends an empty body, which
  // every bodyless call here (DELETE, poll-now) was doing unconditionally before.
  const headers = opts.body ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(BASE + path, {
    headers,
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listPages: () => request('/pages'),
  createPage: (name) => request('/pages', { method: 'POST', body: JSON.stringify({ name }) }),
  updatePage: (id, patch) => request(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePage: (id) => request(`/pages/${id}`, { method: 'DELETE' }),

  listTiles: (pageId) => request(`/pages/${pageId}/tiles`),
  createTile: (pageId, tile) =>
    request(`/pages/${pageId}/tiles`, { method: 'POST', body: JSON.stringify(tile) }),
  updateTile: (id, patch) => request(`/tiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTile: (id) => request(`/tiles/${id}`, { method: 'DELETE' }),
  reorderTiles: (pageId, order) =>
    request(`/pages/${pageId}/tiles/reorder`, { method: 'POST', body: JSON.stringify({ order }) }),

  getSettings: () => request('/settings'),
  updateSettings: (patch) => request('/settings', { method: 'PATCH', body: JSON.stringify(patch) }),

  getComposeScan: (refresh = false) => request(`/compose-scan${refresh ? '?refresh=1' : ''}`),

  checkHealth: (urls) => request('/health/check', { method: 'POST', body: JSON.stringify({ urls }) }),

  listAvailableIntegrations: () => request('/integrations/available'),
  listIntegrations: () => request('/integrations'),
  createIntegration: (payload) => request('/integrations', { method: 'POST', body: JSON.stringify(payload) }),
  updateIntegration: (id, patch) => request(`/integrations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteIntegration: (id) => request(`/integrations/${id}`, { method: 'DELETE' }),
  pollIntegration: (id) => request(`/integrations/${id}/poll`, { method: 'POST' }),

  async upload(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },

  exportBackupUrl: `${BASE}/backup/export`,

  async importBackup(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/backup/import`, { method: 'POST', body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `${res.status} ${res.statusText}`);
    }
    return res.json();
  },
};
