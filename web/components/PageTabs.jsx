import { pages, activePageId, selectPage, addPage } from '../store.js';

export function PageTabs() {
  function onAdd() {
    const name = prompt('New page name');
    if (name && name.trim()) addPage(name.trim());
  }

  return (
    <nav class="page-tabs">
      {pages.value.map((page) => (
        <button
          key={page.id}
          class={`page-tab${page.id === activePageId.value ? ' active' : ''}`}
          onClick={() => selectPage(page.id)}
        >
          {page.name}
        </button>
      ))}
      <button class="page-tab-add" title="Add page" onClick={onAdd}>
        +
      </button>
    </nav>
  );
}
