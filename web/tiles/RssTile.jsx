import { useTileData } from './useTileData.js';

function ago(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const s = (Date.now() - d) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export function RssTile({ tile }) {
  const c = tile.config || {};
  const { data, error, loading } = useTileData(
    `/api/tile/feed?url=${encodeURIComponent(c.url || '')}&limit=${c.limit || 8}`,
    900,
    [c.url, c.limit]
  );

  if (!c.url) return <div class="tile-panel tile-feed tile-panel-muted">Set a feed URL in the tile settings.</div>;
  if (loading && !data) return <div class="tile-panel tile-feed tile-panel-muted">Loading feed…</div>;
  if (error) return <div class="tile-panel tile-feed tile-panel-muted">Feed error: {error}</div>;

  const items = data?.items || [];
  return (
    <div class="tile-panel tile-feed">
      {data?.title && <div class="tile-feed-title">{data.title}</div>}
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            {it.image && <img class="tile-feed-thumb" src={it.image} alt="" loading="lazy" />}
            <a href={it.link} target="_blank" rel="noopener noreferrer">
              {it.title || '(untitled)'}
            </a>
            {c.showDate !== false && it.date && <span class="tile-feed-date">{ago(it.date)}</span>}
          </li>
        ))}
        {!items.length && <li class="tile-panel-muted">No items.</li>}
      </ul>
    </div>
  );
}
