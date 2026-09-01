import { integrations, tileHealth } from '../store.js';
import { WidgetTile } from './WidgetTile.jsx';
import { registryEntry } from '../tiles/registry.jsx';
import { resolveIcon } from '../tiles/icons.js';
import { t } from '../i18n.js';

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

// Where the tile sits in the grid. `placement.colStart` present -> explicit
// free placement; absent (narrow screens) -> plain span with auto-flow.
function placementStyle(tile, placement) {
  const w = placement?.w ?? tile.w;
  const h = placement?.h ?? tile.h;
  if (placement?.colStart) {
    return {
      gridColumn: `${placement.colStart} / span ${w}`,
      gridRow: `${placement.rowStart} / span ${h}`,
    };
  }
  return { gridColumn: `span ${w}`, gridRow: `span ${h}` };
}

// Per-tile controls (drag handle, Edit button, resize grips) only appear while the
// page is in edit mode; Delete lives inside the edit modal.
export function TileCard({
  tile,
  editing,
  narrow,
  placement,
  dragging,
  resizing,
  sizeLabel,
  onEdit,
  onDragStart,
  onResizeStart,
}) {
  const style = { ...placementStyle(tile, placement), ...appearanceStyle(tile) };
  const hideTitle = Boolean(tile.config?.appearance?.hideTitle);

  const panel = registryEntry(tile.type);
  const className = [
    'tile',
    panel ? 'tile-panel-card' : '',
    tile.type === 'widget' ? 'tile-widget' : '',
    tile.open_mode === 'iframe' ? 'tile-iframe' : '',
    dragging ? 'tile-dragging' : '',
    resizing ? 'tile-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dragHandle = editing && !narrow && (
    <span class="tile-drag-handle" title="Drag to move" onPointerDown={onDragStart}>
      ⋮⋮
    </span>
  );
  const editButton = editing && (
    <button class="tile-edit-btn" onClick={onEdit}>
      {t('tile.edit')}
    </button>
  );
  const resizeGrips = editing && (
    <>
      <span
        class="tile-resize tile-resize-e"
        title="Drag to change width"
        onPointerDown={(e) => onResizeStart('x', e)}
      />
      {!narrow && (
        <span
          class="tile-resize tile-resize-s"
          title="Drag to change height"
          onPointerDown={(e) => onResizeStart('y', e)}
        />
      )}
      <span
        class="tile-resize tile-resize-se"
        title="Drag to resize"
        onPointerDown={(e) => onResizeStart(narrow ? 'x' : 'both', e)}
      >
        ⤡
      </span>
    </>
  );
  const badge = sizeLabel && <span class="tile-size-badge">{sizeLabel}</span>;

  // Built-in info/data panel tile (clock, weather, notes, …).
  if (panel) {
    const Body = panel.Component;
    return (
      <div class={className} data-id={tile.id} style={style}>
        <div class="tile-toolbar">
          {dragHandle}
          {!hideTitle && <span class="tile-toolbar-title">{tile.title || panel.label}</span>}
          {editButton && <div class="tile-toolbar-actions">{editButton}</div>}
        </div>
        <Body tile={tile} />
        {resizeGrips}
        {badge}
      </div>
    );
  }

  if (tile.type === 'widget') {
    return (
      <div class={className} data-id={tile.id} style={style}>
        <HealthDot {...widgetHealth(tile)} />
        <div class="tile-toolbar">
          {dragHandle}
          {!hideTitle && <span class="tile-toolbar-title">{tile.title || 'Widget'}</span>}
          {editButton && <div class="tile-toolbar-actions">{editButton}</div>}
        </div>
        <WidgetTile tile={tile} />
        {resizeGrips}
        {badge}
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
      <div class={className} data-id={tile.id} style={style}>
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
        {resizeGrips}
        {badge}
      </div>
    );
  }

  const target = tile.open_mode === 'newtab' ? '_blank' : undefined;

  return (
    <div class={className} data-id={tile.id} style={style}>
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
      {resizeGrips}
      {badge}
    </div>
  );
}
