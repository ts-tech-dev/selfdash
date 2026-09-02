import { resolveIcon } from './icons.js';

function Link({ l }) {
  return (
    <li>
      <a href={l.url} target="_blank" rel="noopener noreferrer">
        {l.icon ? (
          <img src={resolveIcon(l.icon)} alt="" loading="lazy" />
        ) : (
          <span class="tile-bookmark-dot" aria-hidden="true" />
        )}
        <span>{l.title || l.url}</span>
      </a>
    </li>
  );
}

export function BookmarksTile({ tile }) {
  const c = tile.config || {};
  const links = Array.isArray(c.links) ? c.links : [];
  if (!links.length) {
    return <div class="tile-panel tile-bookmarks tile-bookmarks-empty">No bookmarks yet — edit the tile to add links.</div>;
  }
  const cols = Math.min(4, Math.max(1, c.columns || 1));

  // Below 2 columns there's nothing to assign — a single flowing list, same as before.
  if (cols === 1) {
    return (
      <div class="tile-panel tile-bookmarks">
        <ul>
          {links.map((l, i) => (
            <Link key={i} l={l} />
          ))}
        </ul>
      </div>
    );
  }

  // Each link's chosen column (BookmarksConfig's "Col" picker) puts it in that
  // column's own list, rather than auto-flowing left-to-right through a single grid —
  // so e.g. "Media" links can sit together in column 1 regardless of add order.
  const buckets = Array.from({ length: cols }, () => []);
  for (const l of links) buckets[Math.min(cols, Math.max(1, l.column || 1)) - 1].push(l);

  return (
    <div class="tile-panel tile-bookmarks" style={{ '--bookmark-cols': cols }}>
      <div class="tile-bookmarks-cols">
        {buckets.map((bucket, ci) => (
          <ul key={ci}>
            {bucket.map((l, i) => (
              <Link key={i} l={l} />
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
