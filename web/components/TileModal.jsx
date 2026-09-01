import { useState } from 'preact/hooks';
import { SIZE_PRESETS, sizeKeyFromWH } from '../../src/shared/tileSizes.js';
import { api } from '../api.js';
import { integrations } from '../store.js';
import { DynamicConfigForm } from './DynamicConfigForm.jsx';
import { IconPicker } from './IconPicker.jsx';
import { TILE_REGISTRY, registryEntry } from '../tiles/registry.jsx';

const ASPECT_RATIOS = ['16/9', '4/3', '1/1', '21/9'];
const DEFAULT_IFRAME_CONFIG = {
  sizing: 'aspect',
  aspectRatio: '16/9',
  height: 400,
  sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
};

const PANEL_TYPES = Object.keys(TILE_REGISTRY);
const CATEGORIES = [...new Set(PANEL_TYPES.map((t) => TILE_REGISTRY[t].category))];

function initialType(tile) {
  if (!tile) return 'link';
  if (tile.type === 'widget') return 'widget';
  if (registryEntry(tile.type)) return tile.type;
  return 'link';
}

export function TileModal({ tile, onClose, onSave, onDelete }) {
  const startType = initialType(tile);
  const [type, setType] = useState(startType);

  const [form, setForm] = useState(() => ({
    title: tile?.title || '',
    url: tile?.url || '',
    icon: tile?.icon || '',
    description: tile?.description || '',
    size: tile ? sizeKeyFromWH(tile.w, tile.h) || 'custom' : 'M',
    open_mode: tile?.open_mode || 'newtab',
    iframe: { ...DEFAULT_IFRAME_CONFIG, ...(tile?.open_mode === 'iframe' ? tile.config : {}) },
    integration_id: tile?.integration_id || integrations.value[0]?.id || '',
    group: tile?.config?.group || '',
    appearance: { accent: '', iconBg: '', hideTitle: false, ...(tile?.config?.appearance || {}) },
    // panel config, seeded from the registry defaults when adding
    panelConfig:
      registryEntry(startType) && tile
        ? { ...tile.config }
        : registryEntry(startType)
          ? { ...registryEntry(startType).defaults.config }
          : {},
  }));
  const [uploading, setUploading] = useState(false);
  const [showAppearance, setShowAppearance] = useState(false);

  const isPanel = Boolean(registryEntry(type));
  const isLink = type === 'link';
  const isWidget = type === 'widget';

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  function updateIframe(field, value) {
    setForm((f) => ({ ...f, iframe: { ...f.iframe, [field]: value } }));
  }
  function updatePanel(field, value) {
    setForm((f) => ({ ...f, panelConfig: { ...f.panelConfig, [field]: value } }));
  }
  function updateAppearance(field, value) {
    setForm((f) => ({ ...f, appearance: { ...f.appearance, [field]: value } }));
  }

  function onPickType(next) {
    setType(next);
    const entry = registryEntry(next);
    if (entry) setForm((f) => ({ ...f, panelConfig: { ...entry.defaults.config } }));
  }

  function commonConfig() {
    const cfg = {};
    if (form.group.trim()) cfg.group = form.group.trim();
    const a = {};
    if (/^#[0-9a-f]{6}$/i.test(form.appearance.accent)) a.accent = form.appearance.accent;
    if (/^#[0-9a-f]{6}$/i.test(form.appearance.iconBg)) a.iconBg = form.appearance.iconBg;
    if (form.appearance.hideTitle) a.hideTitle = true;
    if (Object.keys(a).length) cfg.appearance = a;
    return cfg;
  }

  function submit(e) {
    e.preventDefault();
    // 'custom' = keep whatever size the tile was drag-resized to; presets set w/h.
    const { w, h } =
      form.size === 'custom' ? { w: tile.w, h: tile.h } : SIZE_PRESETS[form.size];
    const title = form.title.trim();

    if (isWidget) {
      if (!form.integration_id) return;
      onSave({ type: 'widget', title, integration_id: Number(form.integration_id), w, h, config: commonConfig() });
      return;
    }

    if (isPanel) {
      // Drop any stale group/appearance carried in panelConfig; commonConfig() is
      // the single source of truth for those (empty = cleared).
      const { group, appearance, ...panelOnly } = form.panelConfig;
      onSave({ type, title, w, h, config: { ...panelOnly, ...commonConfig() } });
      return;
    }

    if (!form.url.trim()) return;
    onSave({
      type: 'link',
      title,
      url: form.url.trim(),
      icon: form.icon.trim() || null,
      description: form.description.trim() || null,
      open_mode: form.open_mode,
      w,
      h,
      config: form.open_mode === 'iframe' ? { ...form.iframe, ...commonConfig() } : commonConfig(),
    });
  }

  const panelEntry = registryEntry(type);

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <form class="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{tile ? 'Edit tile' : 'Add tile'}</h2>

        {!tile && (
          <label>
            Tile type
            <select value={type} onChange={(e) => onPickType(e.target.value)}>
              <optgroup label="Core">
                <option value="link">Link</option>
                <option value="widget">Widget (from integration)</option>
              </optgroup>
              {CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {PANEL_TYPES.filter((t) => TILE_REGISTRY[t].category === cat).map((t) => (
                    <option key={t} value={t}>
                      {TILE_REGISTRY[t].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <label>
          Title
          <input value={form.title} onInput={(e) => update('title', e.target.value)} />
        </label>

        {isWidget && (
          <label>
            Integration
            <select value={form.integration_id} onChange={(e) => update('integration_id', e.target.value)}>
              {integrations.value.length === 0 && <option value="">No integrations configured</option>}
              {integrations.value.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {isPanel && panelEntry && (
          panelEntry.ConfigForm ? (
            <panelEntry.ConfigForm value={form.panelConfig} onChange={updatePanel} />
          ) : (
            <DynamicConfigForm fields={panelEntry.fields || []} value={form.panelConfig} onChange={updatePanel} />
          )
        )}

        {isLink && (
          <>
            <label>
              URL
              <input
                required
                value={form.url}
                onInput={(e) => update('url', e.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <IconPicker value={form.icon} onChange={(v) => update('icon', v)} />
            <label>
              Description
              <input value={form.description} onInput={(e) => update('description', e.target.value)} />
            </label>
          </>
        )}

        <label>
          Size
          <select value={form.size} onChange={(e) => update('size', e.target.value)}>
            {form.size === 'custom' && (
              <option value="custom">custom ({tile.w}×{tile.h})</option>
            )}
            {Object.keys(SIZE_PRESETS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <span class="settings-hint">or drag a tile's edges on the page to resize</span>
        </label>

        {isLink && (
          <label>
            Open in
            <select value={form.open_mode} onChange={(e) => update('open_mode', e.target.value)}>
              <option value="newtab">New tab</option>
              <option value="same">Same tab</option>
              <option value="iframe">Embed as iframe</option>
            </select>
          </label>
        )}

        {isLink && form.open_mode === 'iframe' && (
          <fieldset class="iframe-fields">
            <label>
              Sizing
              <select value={form.iframe.sizing} onChange={(e) => updateIframe('sizing', e.target.value)}>
                <option value="aspect">Aspect ratio</option>
                <option value="height">Fixed height</option>
              </select>
            </label>
            {form.iframe.sizing === 'aspect' ? (
              <label>
                Aspect ratio
                <select value={form.iframe.aspectRatio} onChange={(e) => updateIframe('aspectRatio', e.target.value)}>
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Height (px)
                <input
                  type="number"
                  min="100"
                  max="2000"
                  value={form.iframe.height}
                  onInput={(e) => updateIframe('height', Number(e.target.value))}
                />
              </label>
            )}
            <label>
              Sandbox (advanced)
              <input value={form.iframe.sandbox} onInput={(e) => updateIframe('sandbox', e.target.value)} />
            </label>
          </fieldset>
        )}

        <button type="button" class="modal-disclosure" onClick={() => setShowAppearance((v) => !v)}>
          {showAppearance ? '▾' : '▸'} Group & appearance
        </button>
        {showAppearance && (
          <fieldset class="iframe-fields">
            <label>
              Group (tiles with the same group are shown under one heading)
              <input value={form.group} onInput={(e) => update('group', e.target.value)} />
            </label>
            <div class="settings-form-row">
              <label>
                Accent
                <input
                  type="color"
                  value={form.appearance.accent || '#5b8def'}
                  onInput={(e) => updateAppearance('accent', e.target.value)}
                />
              </label>
              <label>
                Icon background
                <input
                  type="color"
                  value={form.appearance.iconBg || '#5b8def'}
                  onInput={(e) => updateAppearance('iconBg', e.target.value)}
                />
              </label>
              <label class="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.appearance.hideTitle}
                  onChange={(e) => updateAppearance('hideTitle', e.target.checked)}
                />
                Hide title bar
              </label>
            </div>
            <button
              type="button"
              class="modal-disclosure"
              onClick={() => setForm((f) => ({ ...f, appearance: { accent: '', iconBg: '', hideTitle: false } }))}
            >
              Reset appearance
            </button>
          </fieldset>
        )}

        <div class="modal-actions">
          {tile && onDelete && (
            <button
              type="button"
              class="modal-delete-btn"
              onClick={() => {
                if (confirm('Delete this tile?')) onDelete();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={uploading}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
