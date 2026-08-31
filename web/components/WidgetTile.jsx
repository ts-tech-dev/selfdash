import { integrations } from '../store.js';

function StatsView({ items }) {
  return (
    <div class="widget-stats">
      {items.map((it, i) => (
        <div key={i} class="widget-stat">
          <span class="widget-stat-value">{it.value}</span>
          <span class="widget-stat-label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function NowPlayingView({ items }) {
  const item = items[0];
  if (!item) return <p class="widget-empty">Nothing playing</p>;
  return (
    <div class="widget-nowplaying">
      {item.image && <img src={item.image} alt="" class="widget-nowplaying-art" />}
      <div class="widget-nowplaying-info">
        <div class="widget-nowplaying-title">{item.title}</div>
        {item.subtitle && <div class="widget-nowplaying-subtitle">{item.subtitle}</div>}
        {typeof item.progress === 'number' && (
          <div class="widget-progress">
            <div class="widget-progress-bar" style={{ width: `${Math.round(item.progress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function QueueView({ items }) {
  if (!items.length) return <p class="widget-empty">Queue is empty</p>;
  return (
    <ul class="widget-queue">
      {items.map((it, i) => (
        <li key={i}>
          <div class="widget-queue-row">
            <span class="widget-queue-title">{it.title}</span>
            {it.status && <span class="widget-queue-status">{it.status}</span>}
          </div>
          {typeof it.progress === 'number' && (
            <div class="widget-progress">
              <div class="widget-progress-bar" style={{ width: `${Math.round(it.progress * 100)}%` }} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ListView({ items }) {
  if (!items.length) return <p class="widget-empty">No items</p>;
  return (
    <ul class="widget-list">
      {items.map((it, i) => (
        <li key={i} class={it.image ? 'widget-list-row' : undefined}>
          {it.image && <img src={it.image} alt="" class="widget-list-art" loading="lazy" />}
          <span class="widget-list-info">
            <span class="widget-list-title">{it.title}</span>
            {it.subtitle && <span class="widget-list-subtitle">{it.subtitle}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const RENDERERS = { stats: StatsView, nowplaying: NowPlayingView, queue: QueueView, list: ListView };

function renderModel(model) {
  if (model.type === 'error') return <p class="widget-empty">{model.error}</p>;
  const Renderer = RENDERERS[model.type];
  return Renderer ? (
    <Renderer items={model.items || []} />
  ) : (
    <p class="widget-empty">Unsupported widget type: {model.type}</p>
  );
}

// Compact, fixed-height views (a stat grid, a now-playing card) go in a static header that
// stays put while the taller views (queues, lists) scroll in their own region below it.
// A real two-box layout — not a sticky overlay — so nothing ever renders on top of
// anything else, including under translucent (glass/gradient) themes.
const PINNED_TYPES = new Set(['stats', 'nowplaying']);

function Sections({ sections }) {
  return sections.map(({ sec, key }) => (
    <div key={key} class="widget-section">
      {sec.title && <div class="widget-section-title">{sec.title}</div>}
      {renderModel(sec)}
    </div>
  ));
}

function SectionsView({ sections }) {
  if (!sections.length) return <p class="widget-empty">No data</p>;

  const tagged = sections.map((sec, i) => ({ sec, key: i, pinned: PINNED_TYPES.has(sec.type) }));
  const pinned = tagged.filter((s) => s.pinned);
  const rest = tagged.filter((s) => !s.pinned);

  // Split into header + scroll body only when there's something of each kind; with just
  // one kind a single scroll region is simpler. Header keeps its declared order; the
  // compact views still float to the top in the single-region case.
  if (!pinned.length || !rest.length) {
    return (
      <div class="widget-sections">
        <div class="widget-sections-scroll">
          <Sections sections={[...pinned, ...rest]} />
        </div>
      </div>
    );
  }

  return (
    <div class="widget-sections">
      <div class="widget-sections-pinned">
        <Sections sections={pinned} />
      </div>
      <div class="widget-sections-scroll">
        <Sections sections={rest} />
      </div>
    </div>
  );
}

export function WidgetTile({ tile }) {
  const integration = tile.integration_id
    ? integrations.value.find((i) => i.id === tile.integration_id)
    : null;

  if (!integration) {
    return <p class="widget-empty">Integration not found (was it deleted?)</p>;
  }

  if (!integration.data) {
    return (
      <p class="widget-empty">
        {integration.last_status === 'unreachable'
          ? `Unreachable: ${integration.last_error}`
          : 'Waiting for first poll…'}
      </p>
    );
  }

  return (
    <div
      class={`widget-body${integration.data.type === 'sections' ? ' widget-body-sections' : ''}${
        integration.enabled ? '' : ' widget-disabled'
      }`}
    >
      {integration.last_status === 'unreachable' && (
        <div class="widget-stale-banner" title={integration.last_error}>
          stale data — {integration.last_error}
        </div>
      )}
      {integration.data.type === 'sections' ? (
        <SectionsView sections={integration.data.sections || []} />
      ) : (
        renderModel(integration.data)
      )}
    </div>
  );
}
