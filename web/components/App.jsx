import { useEffect, useState } from 'preact/hooks';
import {
  activePage,
  error,
  loadPages,
  loadSettings,
  loading,
  settings,
  loadIntegrations,
  loadAvailableIntegrations,
} from '../store.js';
import { applyAppearance } from '../appearance.js';
import { PageTabs } from './PageTabs.jsx';
import { TileGrid } from './TileGrid.jsx';
import { SettingsView } from './SettingsView.jsx';
import { ComposeScanPanel } from './ComposeScanPanel.jsx';

const INTEGRATION_POLL_MS = 10_000;

export function App() {
  const [view, setView] = useState('dashboard');
  const currentSettings = settings.value;
  const currentPage = activePage.value;

  useEffect(() => {
    loadPages();
    loadSettings();
    loadIntegrations();
    loadAvailableIntegrations();
    const timer = setInterval(loadIntegrations, INTEGRATION_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    applyAppearance(currentSettings, currentPage);
    if (currentSettings.dark_mode !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyAppearance(currentSettings, currentPage);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [currentSettings, currentPage]);

  return (
    <div class="app">
      <header class="app-header">
        <h1>{currentSettings.site_title}</h1>
        <nav class="view-tabs">
          <button class={`view-tab${view === 'dashboard' ? ' active' : ''}`} onClick={() => setView('dashboard')}>
            Dashboard
          </button>
          <button class={`view-tab${view === 'settings' ? ' active' : ''}`} onClick={() => setView('settings')}>
            Settings
          </button>
        </nav>
      </header>
      {error.value && <div class="banner banner-error">{error.value}</div>}

      {view === 'dashboard' ? (
        <>
          <PageTabs />
          {currentPage && <TileGrid page={currentPage} />}
          {!loading.value && !currentPage && <p class="empty-state">No pages yet. Add one to get started.</p>}
          <ComposeScanPanel pageId={currentPage?.id} />
        </>
      ) : (
        <SettingsView />
      )}
    </div>
  );
}
