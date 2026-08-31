import { signal, computed } from '@preact/signals';
import { api } from './api.js';

export const pages = signal([]);
export const activePageId = signal(null);
export const tiles = signal([]);
export const loading = signal(false);
export const error = signal(null);
export const settings = signal({
  site_title: 'selfdash',
  favicon: null,
  theme: 'minimal',
  dark_mode: 'system',
  accent: '#5b8def',
  font_family: '',
  custom_css: '',
  custom_js: '',
  custom_js_enabled: false,
  global_background: null,
  compose_scan_enabled: false,
  compose_scan_dir: null,
  compose_scan_page_id: null, // null = every page; a page id = only that page
});

export const activePage = computed(() => pages.value.find((p) => p.id === activePageId.value) || null);

export async function loadPages() {
  loading.value = true;
  error.value = null;
  try {
    pages.value = await api.listPages();
    if (!pages.value.some((p) => p.id === activePageId.value)) {
      activePageId.value = pages.value[0]?.id ?? null;
    }
    if (activePageId.value) await loadTiles(activePageId.value);
    else tiles.value = [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

export async function loadTiles(pageId) {
  tiles.value = await api.listTiles(pageId);
}

export async function selectPage(id) {
  activePageId.value = id;
  await loadTiles(id);
}

export async function addPage(name) {
  const page = await api.createPage(name);
  await loadPages();
  activePageId.value = page.id;
  await loadTiles(page.id);
}

export async function renamePage(id, name) {
  await api.updatePage(id, { name });
  await loadPages();
}

export async function setPageBackground(id, background) {
  await api.updatePage(id, { background });
  await loadPages();
}

export async function updatePageOptions(id, options) {
  await api.updatePage(id, { options });
  await loadPages();
}

export async function removePage(id) {
  await api.deletePage(id);
  activePageId.value = null;
  await loadPages();
}

export async function addTile(tile) {
  await api.createTile(activePageId.value, tile);
  await loadTiles(activePageId.value);
}

export async function editTile(id, patch) {
  await api.updateTile(id, patch);
  await loadTiles(activePageId.value);
}

export async function removeTile(id) {
  await api.deleteTile(id);
  await loadTiles(activePageId.value);
}

export async function reorderTiles(orderedIds) {
  const byId = new Map(tiles.value.map((t) => [t.id, t]));
  tiles.value = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  await api.reorderTiles(activePageId.value, orderedIds);
}

export async function loadSettings() {
  settings.value = await api.getSettings();
}

export async function updateSettings(patch) {
  settings.value = await api.updateSettings(patch);
}

export const integrations = signal([]);
export const availableIntegrations = signal([]);

export async function loadIntegrations() {
  integrations.value = await api.listIntegrations();
}

export async function loadAvailableIntegrations() {
  availableIntegrations.value = await api.listAvailableIntegrations();
}

export async function addIntegration(payload) {
  await api.createIntegration(payload);
  await loadIntegrations();
}

export async function editIntegration(id, patch) {
  await api.updateIntegration(id, patch);
  await loadIntegrations();
}

export async function removeIntegration(id) {
  await api.deleteIntegration(id);
  await loadIntegrations();
}

export async function pollIntegrationNow(id) {
  await api.pollIntegration(id);
  await loadIntegrations();
}

// url -> { status: 'online' | 'offline', code?: number, at: string }
export const tileHealth = signal({});

export async function refreshTileHealth(urls) {
  const list = [...new Set((urls || []).filter(Boolean))];
  if (!list.length) return;
  try {
    const res = await api.checkHealth(list);
    tileHealth.value = { ...tileHealth.value, ...res };
  } catch {
    // network hiccup fetching our own API — keep the last known statuses
  }
}

export const composeScan = signal(null);

export async function loadComposeScan(refresh = false) {
  try {
    composeScan.value = await api.getComposeScan(refresh);
  } catch (err) {
    composeScan.value = { enabled: true, dir: null, result: { error: err.message, stacks: [], errors: [] } };
  }
}
