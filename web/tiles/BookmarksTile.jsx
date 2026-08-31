import { resolveIcon } from './icons.js';

export function BookmarksTile({ tile }) {
  const c = tile.config || {};
  const links = Array.isArray(c.links) ? c.links : [];
  if (!links.length) {
    return <div class="tile-panel tile-bookmarks tile-bookmarks-empty">No bookmarks yet — edit the tile to add links.</div>;
  }
  return (
    <div
      class="tile-panel tile-bookmarks"
      style={{ '--bookmark-cols': Math.min(4, Math.max(1, c.columns || 1)) }}
    >
      <ul>
        {links.map((l, i) => (
          <li key={i}>
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {l.icon ? (
                <img src={resolveIcon(l.icon)} alt="" loading="lazy" />
              ) : (
                <span class="tile-bookmark-dot" aria-hidden="true" />
              )}
              <span>{l.title || l.url}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
