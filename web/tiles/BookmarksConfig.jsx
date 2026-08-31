// Repeatable link-row editor for the Bookmarks tile (DynamicConfigForm only does
// flat fields).
export function BookmarksConfig({ value, onChange }) {
  const links = Array.isArray(value.links) ? value.links : [];

  const setLinks = (next) => onChange('links', next);
  const update = (i, key, v) => setLinks(links.map((l, j) => (j === i ? { ...l, [key]: v } : l)));
  const add = () => setLinks([...links, { title: '', url: '', icon: '' }]);
  const remove = (i) => setLinks(links.filter((_, j) => j !== i));

  return (
    <div class="tile-config-repeat">
      <label>
        Columns
        <input
          type="number"
          min="1"
          max="4"
          value={value.columns || 1}
          onInput={(e) => onChange('columns', Number(e.target.value))}
        />
      </label>
      <span class="tile-config-repeat-label">Links</span>
      {links.map((l, i) => (
        <div class="tile-config-repeat-row" key={i}>
          <input placeholder="Title" value={l.title || ''} onInput={(e) => update(i, 'title', e.target.value)} />
          <input placeholder="https://…" value={l.url || ''} onInput={(e) => update(i, 'url', e.target.value)} />
          <input placeholder="Icon URL (optional)" value={l.icon || ''} onInput={(e) => update(i, 'icon', e.target.value)} />
          <button type="button" onClick={() => remove(i)} aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
      <button type="button" class="tile-config-repeat-add" onClick={add}>
        + Add link
      </button>
    </div>
  );
}
