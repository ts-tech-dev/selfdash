import { useState } from 'preact/hooks';
import { pages, addPage, renamePage, setPageBackground, removePage } from '../../store.js';

function PageRow({ page }) {
  const [name, setName] = useState(page.name);
  const [background, setBackground] = useState(page.background || '');
  const dirty = name !== page.name || background !== (page.background || '');

  function save() {
    if (name.trim() && name.trim() !== page.name) renamePage(page.id, name.trim());
    if (background.trim() !== (page.background || '')) setPageBackground(page.id, background.trim() || null);
  }

  function onDelete() {
    if (pages.value.length <= 1) {
      alert('Cannot delete the last page.');
      return;
    }
    if (confirm(`Delete page "${page.name}"? This deletes all its tiles.`)) removePage(page.id);
  }

  return (
    <li class="settings-row">
      <div class="settings-row-fields">
        <input class="page-row-name" value={name} onInput={(e) => setName(e.target.value)} />
        <input
          class="page-row-background"
          value={background}
          onInput={(e) => setBackground(e.target.value)}
          placeholder="Background image URL"
        />
      </div>
      <div class="settings-row-actions">
        {dirty && (
          <button type="button" onClick={save}>
            Save
          </button>
        )}
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

export function PagesSection() {
  function onAdd() {
    const name = prompt('New page name');
    if (name && name.trim()) addPage(name.trim());
  }

  return (
    <section class="settings-section">
      <h2>Pages</h2>
      <p class="settings-hint">Rename a page, set its background, or remove it. Changes to name/background need Save.</p>
      <ul class="settings-list">
        {pages.value.map((page) => (
          <PageRow key={page.id} page={page} />
        ))}
      </ul>
      <button type="button" class="settings-add-btn" onClick={onAdd}>
        + Add page
      </button>
    </section>
  );
}
