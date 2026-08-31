import { useTileData } from './useTileData.js';

export function CustomApiTile({ tile }) {
  const c = tile.config || {};
  const { data, error, loading } = useTileData(
    `/api/tile/customapi/${tile.id}`,
    c.refreshSec || 60,
    [tile.id]
  );

  if (!c.url) return <div class="tile-panel tile-customapi tile-panel-muted">Set an endpoint URL in the tile settings.</div>;
  if (loading && !data) return <div class="tile-panel tile-customapi tile-panel-muted">Loading…</div>;
  if (error) return <div class="tile-panel tile-customapi tile-panel-muted">Error: {error}</div>;

  if (data?.type === 'list') {
    return (
      <div class="tile-panel tile-customapi">
        <ul class="tile-customapi-list">
          {(data.items || []).map((it, i) => (
            <li key={i}>
              <span class="tile-customapi-title">{it.title}</span>
              {it.subtitle != null && <span class="tile-customapi-sub">{it.subtitle}</span>}
            </li>
          ))}
          {!data.items?.length && <li class="tile-panel-muted">No rows.</li>}
        </ul>
      </div>
    );
  }

  return (
    <div class="tile-panel tile-customapi">
      <div class="tile-customapi-stats">
        {(data?.items || []).map((it, i) => (
          <div class="tile-customapi-stat" key={i}>
            <span class="tile-customapi-value">{it.value}</span>
            <span class="tile-customapi-label">{it.label}</span>
          </div>
        ))}
        {!data?.items?.length && <span class="tile-panel-muted">No mapped fields.</span>}
      </div>
    </div>
  );
}
