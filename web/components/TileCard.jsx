import { integrations, tileHealth } from '../store.js';
import { WidgetTile } from './WidgetTile.jsx';
import { registryEntry } from '../tiles/registry.jsx';
import { resolveIcon } from '../tiles/icons.js';

function HealthDot({ state, label }) {
  return <span class={`tile-health tile-health-${state}`} title={label} aria-label={label} />;
}

// Widget tiles: reuse the integration poller's verdict.
function widgetHealth(tile) {
  const integ = tile.integration_id
    ? integrations.value.find((i) => i.id === tile.integration_id)
    : null;
  if (!integ) return { state: 'unknown', label: 'No integration linked' };
  if (!integ.enabled) return { state: 'unknown', label: 'Integration disabled' };
  if (integ.last_status === 'ok') {
    return { state: 'online', label: `Online — last OK ${integ.last_ok_at || 'recently'}` };
  }
  if (integ.last_status === 'unknown') return { state: 'unknown', label: 'Waiting for first poll…' };
  return { state: 'offline', label: `Offline — ${integ.last_error || integ.last_status}` };
}

// Link / iframe tiles: reuse the /api/health/check ping result for the tile URL.
function urlHealth(url) {
  const h = url ? tileHealth.value[url] : null;
  if (!h) return { state: 'unknown', label: 'Checking…' };
  return h.status === 'online'
    ? { state: 'online', label: `Online (HTTP ${h.code})` }
    : { state: 'offline', label: 'Offline — no response' };
}

// Per-tile appearance overrides (config.appearance) -> inline CSS vars + flags.
function appearanceStyle(tile) {
  const a = tile.config?.appearance || {};
  const style = {};
  if (a.accent) style['--accent'] = a.accent;
  if (a.iconBg) style['--tile-icon-bg'] = a.iconBg;
  return style;
}

// Per-tile controls (drag handle, Edit button, resize grip) only appear while the page is
// in edit mode; Delete now lives inside the edit modal rather than on the tile itself.
export function TileCard({ tile, editing, onEdit, onResizeStart, sizeOverride }) {
  const w = sizeOverride?.w ?? tile.w;
  const h = sizeOverride?.h ?? tile.h;
  const gridSpan = { gridColumn: `span ${w}`, gridRow: `span ${h}`, ...appearanceStyle(tile) };
  const hideTitle = Boolean(tile.config?.appearance?.hideTitle);

  const dragHandle = editing && (
    <span class="tile-drag-handle" title="Drag to reorder">
      ⋮⋮
    </span>
  );
  const editButton = editing && (
    <button class="tile-edit-btn" onClick={onEdit}>
      Edit
    </button>
  );
  const resizeHandle = editing && (
    <span class="tile-resize-handle" title="Drag to resize" onPointerDown={onResizeStart}>
      ◢
    </span>
  );

  // Built-in info/data panel tile (clock, weather, notes, …).
  const panel = registryEntry(tile.type);
  if (panel) {
    const Body = panel.Component;
    return (
      <div class="tile tile-panel-card" data-id={tile.id} style={gridSpan}>
        <div class="tile-toolbar">
          {dragHandle}
          {!hideTitle && <span class="tile-toolbar-title">{tile.title || panel.label}</span>}
          {editButton && <div class="tile-toolbar-actions">{editButton}</div>}
        </div>
        <Body tile={tile} />
        {resizeHandle}
      </div>
    );
  }

  if (tile.type === 'widget') {
    return (
      <div class="tile tile-widget" data-id={tile.id} style={gridSpan}>
        <HealthDot {...widgetHealth(tile)} />
        <div class="tile-toolbar">
          {dragHandle}
          {!hideTitle && <span class="tile-toolbar-title">{tile.title || 'Widget'}</span>}
          {editButton && <div class="tile-toolbar-actions">{editButton}</div>}
        </div>
        <WidgetTile tile={tile} />
        {resizeHandle}
      </div>
    );
  }

  if (tile.open_mode === 'iframe') {
    const cfg = tile.config || {};
    const iframeStyle =
      cfg.sizing === 'height'
        ? { height: `${cfg.height || 400}px`, aspectRatio: 'auto' }
        : { aspectRatio: cfg.aspectRatio || '16/9', height: 'auto' };

    return (
      <div class="tile tile-iframe" data-id={tile.id} style={gridSpan}>
        <HealthDot {...urlHealth(tile.url)} />
        <div class="tile-toolbar">
          {dragHandle}
          {!hideTitle && <span class="tile-toolbar-title">{tile.title || tile.url}</span>}
          {editButton && <div class="tile-toolbar-actions">{editButton}</div>}
        </div>
        <div class="tile-iframe-scroll">
          <iframe
            class="tile-iframe-embed"
            src={tile.url}
            title={tile.title || tile.url}
            sandbox={cfg.sandbox}
            loading="lazy"
            style={iframeStyle}
          />
        </div>
        {resizeHandle}
      </div>
    );
  }

  const target = tile.open_mode === 'newtab' ? '_blank' : undefined;

  return (
    <div class="tile" data-id={tile.id} style={gridSpan}>
      <HealthDot {...urlHealth(tile.url)} />
      {dragHandle}
      <a
        class="tile-link"
        href={tile.url || '#'}
        target={target}
        rel={target ? 'noopener noreferrer' : undefined}
      >
        {tile.icon && <img class="tile-icon" src={resolveIcon(tile.icon)} alt="" />}
        {!hideTitle && <span class="tile-title">{tile.title || tile.url}</span>}
        {tile.description && <span class="tile-desc">{tile.description}</span>}
      </a>
      {editButton && <div class="tile-actions">{editButton}</div>}
      {resizeHandle}
    </div>
  );
}
