const PROVIDERS = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  brave: { name: 'Brave', url: 'https://search.brave.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
};

// !bang -> search-provider URL template. Bang syntax mirrors DuckDuckGo's most common ones.
const BANGS = {
  g: 'https://www.google.com/search?q=%s',
  ddg: 'https://duckduckgo.com/?q=%s',
  w: 'https://en.wikipedia.org/wiki/Special:Search?search=%s',
  yt: 'https://www.youtube.com/results?search_query=%s',
  gh: 'https://github.com/search?q=%s',
  npm: 'https://www.npmjs.com/search?q=%s',
  aur: 'https://aur.archlinux.org/packages?K=%s',
  hub: 'https://hub.docker.com/search?q=%s',
  imdb: 'https://www.imdb.com/find/?q=%s',
  maps: 'https://www.google.com/maps/search/%s',
  so: 'https://stackoverflow.com/search?q=%s',
};

export function SearchTile({ tile }) {
  const c = tile.config || {};
  const base =
    c.provider === 'custom' && c.customUrl
      ? c.customUrl
      : (PROVIDERS[c.provider] || PROVIDERS.duckduckgo).url;

  function onSubmit(e) {
    e.preventDefault();
    const raw = new FormData(e.currentTarget).get('q')?.toString().trim();
    if (!raw) return;

    let template = base;
    let query = raw;
    if (c.bangs !== false) {
      const m = raw.match(/(?:^!(\w+)\s+(.*)$)|(?:^(.*)\s+!(\w+)$)/);
      const bang = m && (m[1] || m[4]);
      if (bang && BANGS[bang]) {
        template = BANGS[bang];
        query = (m[2] || m[3] || '').trim();
      }
    }
    const target = template.includes('%s')
      ? template.replace('%s', encodeURIComponent(query))
      : template + encodeURIComponent(query);
    window.open(target, '_blank', 'noopener');
    e.currentTarget.reset();
  }

  return (
    <div class="tile-panel tile-search">
      <form onSubmit={onSubmit}>
        <input
          name="q"
          type="search"
          autocomplete="off"
          placeholder={c.placeholder || 'Search the web…'}
          aria-label="Search"
        />
        <button type="submit" aria-label="Search">
          ↵
        </button>
      </form>
    </div>
  );
}
