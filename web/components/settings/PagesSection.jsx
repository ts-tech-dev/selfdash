import { useState } from 'preact/hooks';
import { pages, addPage, renamePage, removePage, updatePageOptions, setPageBackground } from '../../store.js';
import { THEMES } from '../../../src/shared/themes.js';
import { ContrastHint } from './ContrastHint.jsx';

const GRID_DEFAULTS = { columns: 6, gap: 14, rowHeight: 96, maxWidth: 0 };
const BG_DEFAULTS = { url: '', blur: 0, dim: 0, opacity: 100 };

function PageRow({ page }) {
  const [name, setName] = useState(page.name);
  const [grid, setGrid] = useState({ ...GRID_DEFAULTS, ...(page.options?.grid || {}) });
  const [bg, setBg] = useState({ ...BG_DEFAULTS, ...(page.options?.background || {}) });
  const [css, setCss] = useState(page.options?.customCss || '');
  const [appr, setAppr] = useState({ theme: '', accent: '', textColor: '', ...(page.options?.appearance || {}) });
  const [js, setJs] = useState(page.options?.customJs || '');
  const [jsEnabled, setJsEnabled] = useState(Boolean(page.options?.customJsEnabled));
  const [open, setOpen] = useState(false);

  const nameDirty = name.trim() && name.trim() !== page.name;

  function saveName() {
    if (nameDirty) renamePage(page.id, name.trim());
  }
  function saveOptions() {
    const appearance = {};
    if (appr.theme) appearance.theme = appr.theme;
    if (/^#[0-9a-f]{6}$/i.test(appr.accent)) appearance.accent = appr.accent;
    if (/^#[0-9a-f]{6}$/i.test(appr.textColor)) appearance.textColor = appr.textColor;
    updatePageOptions(page.id, {
      grid,
      background: bg,
      customCss: css,
      appearance,
      customJs: js,
      customJsEnabled: jsEnabled,
    });
    if (page.background) setPageBackground(page.id, null); // migrate legacy string bg
  }

  function onDelete() {
    if (pages.value.length <= 1) return alert('Cannot delete the last page.');
    if (confirm(`Delete page "${page.name}"? This deletes all its tiles.`)) removePage(page.id);
  }

  const gridN = (k, v) => setGrid((g) => ({ ...g, [k]: Number(v) }));
  const bgN = (k, v) => setBg((b) => ({ ...b, [k]: Number(v) }));
  const apprSet = (k, v) => setAppr((a) => ({ ...a, [k]: v }));

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
            {open ? 'Hide' : 'Layout & appearance'}
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
                Max width (px, 0 = full)
                <input type="number" min="0" max="2400" value={grid.maxWidth} onInput={(e) => gridN('maxWidth', e.target.value)} />
              </label>
            </div>
          </fieldset>

          <fieldset class="iframe-fields">
            <legend>Appearance (this page only — blank = inherit global)</legend>
            <div class="settings-form-row">
              <label>
                Theme
                <select value={appr.theme} onChange={(e) => apprSet('theme', e.target.value)}>
                  <option value="">— inherit —</option>
                  {THEMES.map((th) => (
                    <option key={th} value={th}>
                      {th}
                    </option>
                  ))}
                </select>
              </label>
              <label class="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(appr.accent)}
                  onChange={(e) => apprSet('accent', e.target.checked ? appr.accent || '#5b8def' : '')}
                />
                Accent
              </label>
              {appr.accent && (
                <label>
                  Accent color
                  <input type="color" value={appr.accent} onInput={(e) => apprSet('accent', e.target.value)} />
                </label>
              )}
              <label class="checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(appr.textColor)}
                  onChange={(e) => apprSet('textColor', e.target.checked ? appr.textColor || '#e6e6e6' : '')}
                />
                Text color
              </label>
              {appr.textColor && (
                <label>
                  Text color
                  <input type="color" value={appr.textColor} onInput={(e) => apprSet('textColor', e.target.value)} />
                  <ContrastHint color={appr.textColor} />
                </label>
              )}
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
            <textarea class="code-textarea" rows="10" spellcheck={false} value={css} onInput={(e) => setCss(e.target.value)} />
          </label>

          <label class="checkbox-field">
            <input type="checkbox" checked={jsEnabled} onChange={(e) => setJsEnabled(e.target.checked)} />
            Run this page's custom JavaScript
          </label>
          <p class="settings-hint">
            Also needs “Enable custom JavaScript” in Appearance settings — that master switch always applies.
          </p>
          {jsEnabled && (
            <label>
              Page JavaScript (only this page)
              <textarea
                class="code-textarea"
                rows="10"
                spellcheck={false}
                value={js}
                onInput={(e) => setJs(e.target.value)}
                placeholder="// runs on this page only"
              />
            </label>
          )}

          <button type="button" class="settings-add-btn" onClick={saveOptions}>
            Save layout & appearance
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
      <p class="settings-hint">
        Rename pages; tune each page's grid, per-page theme / accent / text colour, background image, and per-page CSS/JS.
      </p>
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
