import { useState } from 'preact/hooks';
import { pages, addPage, renamePage, removePage, updatePageOptions, setPageBackground } from '../../store.js';

const GRID_DEFAULTS = { columns: 6, gap: 14, rowHeight: 96, maxWidth: 1100 };
const BG_DEFAULTS = { url: '', blur: 0, dim: 0, opacity: 100 };

function PageRow({ page }) {
  const [name, setName] = useState(page.name);
  const [grid, setGrid] = useState({ ...GRID_DEFAULTS, ...(page.options?.grid || {}) });
  const [bg, setBg] = useState({ ...BG_DEFAULTS, ...(page.options?.background || {}) });
  const [css, setCss] = useState(page.options?.customCss || '');
  const [open, setOpen] = useState(false);

  const nameDirty = name.trim() && name.trim() !== page.name;

  function saveName() {
    if (nameDirty) renamePage(page.id, name.trim());
  }
  function saveOptions() {
    updatePageOptions(page.id, { grid, background: bg, customCss: css });
    if (page.background) setPageBackground(page.id, null); // migrate legacy string bg
  }

  function onDelete() {
    if (pages.value.length <= 1) return alert('Cannot delete the last page.');
    if (confirm(`Delete page "${page.name}"? This deletes all its tiles.`)) removePage(page.id);
  }

  const gridN = (k, v) => setGrid((g) => ({ ...g, [k]: Number(v) }));
  const bgN = (k, v) => setBg((b) => ({ ...b, [k]: Number(v) }));

  return (
    <li class="settings-row settings-row-block">
      <div class="settings-row-fields">
        <input class="page-row-name" value={name} onInput={(e) => setName(e.target.value)} />
        <div class="settings-row-actions">
          {nameDirty && (
            <button type="button" onClick={saveName}>
              Save name
            </button>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide' : 'Layout & background'}
          </button>
          <button type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      {open && (
        <div class="page-row-options">
          <fieldset class="iframe-fields">
            <legend>Grid</legend>
            <div class="settings-form-row">
              <label>
                Columns
                <input type="number" min="1" max="12" value={grid.columns} onInput={(e) => gridN('columns', e.target.value)} />
              </label>
              <label>
                Gap (px)
                <input type="number" min="0" max="48" value={grid.gap} onInput={(e) => gridN('gap', e.target.value)} />
              </label>
              <label>
                Row height (px)
                <input type="number" min="40" max="240" value={grid.rowHeight} onInput={(e) => gridN('rowHeight', e.target.value)} />
              </label>
              <label>
                Max width (px)
                <input type="number" min="600" max="2400" value={grid.maxWidth} onInput={(e) => gridN('maxWidth', e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset class="iframe-fields">
            <legend>Background</legend>
            <label>
              Image URL
              <input value={bg.url} onInput={(e) => setBg((b) => ({ ...b, url: e.target.value }))} placeholder="https://…" />
            </label>
            {bg.url && (
              <div class="settings-form-row">
                <label>
                  Blur ({bg.blur}px)
                  <input type="range" min="0" max="40" value={bg.blur} onInput={(e) => bgN('blur', e.target.value)} />
                </label>
                <label>
                  Dim ({bg.dim}%)
                  <input type="range" min="0" max="100" value={bg.dim} onInput={(e) => bgN('dim', e.target.value)} />
                </label>
                <label>
                  Opacity ({bg.opacity}%)
                  <input type="range" min="0" max="100" value={bg.opacity} onInput={(e) => bgN('opacity', e.target.value)} />
                </label>
              </div>
            )}
          </fieldset>

          <label>
            Page CSS (only this page)
            <textarea rows="4" value={css} onInput={(e) => setCss(e.target.value)} />
          </label>

          <button type="button" class="settings-add-btn" onClick={saveOptions}>
            Save layout & background
          </button>
        </div>
      )}
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
      <p class="settings-hint">Rename pages, tune each page's grid, background image, and per-page CSS.</p>
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
