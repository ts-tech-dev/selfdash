import { useState } from 'preact/hooks';
import { SIZE_PRESETS, sizeKeyFromWH, autoLinkTileHeight } from '../../src/shared/tileSizes.js';
import { api } from '../api.js';
import { integrations, availableIntegrations, tiles } from '../store.js';
import { DynamicConfigForm } from './DynamicConfigForm.jsx';
import { IconPicker } from './IconPicker.jsx';
import { TILE_REGISTRY, registryEntry } from '../tiles/registry.jsx';
import { ContrastHint } from './settings/ContrastHint.jsx';
import { isHexColor } from '../../src/shared/color.js';

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
    size: tile ? sizeKeyFromWH(tile.w, tile.h) : 'M',
    open_mode: tile?.open_mode || 'newtab',
    iframe: { ...DEFAULT_IFRAME_CONFIG, ...(tile?.open_mode === 'iframe' ? tile.config : {}) },
    integration_id: tile?.integration_id || integrations.value[0]?.id || '',
    views: Array.isArray(tile?.config?.views) ? tile.config.views : [],
    moreIntegrationIds: Array.isArray(tile?.config?.moreIntegrationIds) ? tile.config.moreIntegrationIds : [],
    group: tile?.config?.group || '',
    appearance: { accent: '', iconBg: '', textColor: '', hideTitle: false, ...(tile?.config?.appearance || {}) },
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

  // Distinct group names already in use on this page, first-seen order (matches the grid).
  const existingGroups = [];
  for (const t of tiles.value) {
    const g = t.config?.group;
    if (g && !existingGroups.includes(g)) existingGroups.push(g);
  }
  // "New group…" mode: on until the field holds a name that isn't already a group.
  const [newGroup, setNewGroup] = useState(
    Boolean(tile?.config?.group) && !existingGroups.includes(tile.config.group)
  );

  const isPanel = Boolean(registryEntry(type));
  const isLink = type === 'link';
  const isWidget = type === 'widget';

  // A link tile can optionally also show an attached integration's live data below
  // the icon/title — same integration-picking UI as a widget tile, just optional here.
  const [includeIntegration, setIncludeIntegration] = useState(
    Boolean(startType === 'link' && tile?.integration_id)
  );

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
  function pickIntegration(id) {
    // Which views exist (and which other integrations are mergeable) depends on the
    // integration's type, so a fresh pick starts the "Show"/"Also include" choices over.
    setForm((f) => ({ ...f, integration_id: id, views: [], moreIntegrationIds: [] }));
  }
  function toggleView(key) {
    setForm((f) => {
      const views = f.views.includes(key) ? f.views.filter((k) => k !== key) : [...f.views, key];
      // "Also include" only makes sense for exactly one selected view (see WidgetTile.jsx's
      // merge logic) — drop it the moment that stops being true.
      return { ...f, views, moreIntegrationIds: views.length === 1 ? f.moreIntegrationIds : [] };
    });
  }
  function toggleMergeIntegration(id) {
    setForm((f) => ({
      ...f,
      moreIntegrationIds: f.moreIntegrationIds.includes(id)
        ? f.moreIntegrationIds.filter((x) => x !== id)
        : [...f.moreIntegrationIds, id],
    }));
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
    if (isHexColor(form.appearance.accent)) a.accent = form.appearance.accent;
    if (isHexColor(form.appearance.iconBg)) a.iconBg = form.appearance.iconBg;
    if (isHexColor(form.appearance.textColor)) a.textColor = form.appearance.textColor;
    if (form.appearance.hideTitle) a.hideTitle = true;
    if (Object.keys(a).length) cfg.appearance = a;
    return cfg;
  }

  function submit(e) {
    e.preventDefault();
    const { w, h } = SIZE_PRESETS[form.size];
    const title = form.title.trim();

    if (isWidget) {
      if (!form.integration_id) return;
      const widgetCfg = {};
      if (form.views.length) widgetCfg.views = form.views;
      if (form.views.length === 1 && form.moreIntegrationIds.length) {
        widgetCfg.moreIntegrationIds = form.moreIntegrationIds;
      }
      onSave({
        type: 'widget',
        title,
        integration_id: Number(form.integration_id),
        w,
        h,
        config: { ...widgetCfg, ...commonConfig() },
      });
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
    const widgetCfg = {};
    if (includeIntegration && form.integration_id) {
      if (form.views.length) widgetCfg.views = form.views;
      if (form.views.length === 1 && form.moreIntegrationIds.length) {
        widgetCfg.moreIntegrationIds = form.moreIntegrationIds;
      }
    }
    let linkH = h;
    if (includeIntegration && form.integration_id && form.views.length <= 1) {
      const integ = integrations.value.find((i) => i.id === Number(form.integration_id));
      const key = form.views[0] || viewKeys[0];
      const viewType = key ? integ?.data?.byView?.[key]?.type : null;
      linkH = autoLinkTileHeight(linkH, viewType);
    }
    onSave({
      type: 'link',
      title,
      url: form.url.trim(),
      icon: form.icon.trim() || null,
      description: form.description.trim() || null,
      open_mode: form.open_mode,
      integration_id: includeIntegration && form.integration_id ? Number(form.integration_id) : null,
      w,
      h: linkH,
      config:
        form.open_mode === 'iframe'
          ? { ...form.iframe, ...commonConfig() }
          : { ...widgetCfg, ...commonConfig() },
    });
  }

  const panelEntry = registryEntry(type);

  // "Show" options come from the picked integration's type (its declared view keys),
  // not from the integration itself — view selection lives on the tile so two tiles
  // on the same integration can each show something different.
  const selectedIntegration = integrations.value.find((i) => i.id === Number(form.integration_id));
  const viewCatalog = selectedIntegration
    ? availableIntegrations.value.find((t) => t.key === selectedIntegration.key)?.views || {}
    : {};
  const viewKeys = Object.keys(viewCatalog);
  const singleViewKey = form.views.length === 1 ? form.views[0] : null;
  const primaryDef = selectedIntegration
    ? availableIntegrations.value.find((t) => t.key === selectedIntegration.key)
    : null;
  const primaryMergeGroup = primaryDef?.mergeGroup || selectedIntegration?.key;
  // Other integrations that can produce this same view — offered as "also include"
  // only when exactly one view is picked, so the merge target is unambiguous. The
  // candidate must also share the primary's mergeGroup, so a download-client queue
  // (qbittorrent + sabnzbd) doesn't pull in radarr/sonarr just because those also
  // expose a `queue` view.
  const mergeCandidates = singleViewKey
    ? integrations.value.filter((i) => {
        if (i.id === Number(form.integration_id)) return false;
        const def = availableIntegrations.value.find((t) => t.key === i.key);
        if (!def?.views?.[singleViewKey]) return false;
        return (def.mergeGroup || i.key) === primaryMergeGroup;
      })
    : [];

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
            <select value={form.integration_id} onChange={(e) => pickIntegration(e.target.value)}>
              {integrations.value.length === 0 && <option value="">No integrations configured</option>}
              {integrations.value.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {isWidget && viewKeys.length > 0 && (
          <div class="multiselect-field">
            <span class="multiselect-label">Show</span>
            {viewKeys.map((k) => (
              <label key={k} class="checkbox-field">
                <input type="checkbox" checked={form.views.includes(k)} onChange={() => toggleView(k)} />
                {viewCatalog[k]}
              </label>
            ))}
            <p class="field-hint">Nothing checked uses the first view. Check several to stack them in one tile.</p>
          </div>
        )}

        {isWidget && singleViewKey && mergeCandidates.length > 0 && (
          <div class="multiselect-field">
            <span class="multiselect-label">Also include</span>
            {mergeCandidates.map((i) => (
              <label key={i.id} class="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.moreIntegrationIds.includes(i.id)}
                  onChange={() => toggleMergeIntegration(i.id)}
                />
                {i.name}
              </label>
            ))}
            <p class="field-hint">
              Merges {(viewCatalog[singleViewKey] || '').toLowerCase()} from these into the same tile.
            </p>
          </div>
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

            <label class="checkbox-field">
              <input
                type="checkbox"
                checked={includeIntegration}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIncludeIntegration(checked);
                  if (checked) {
                    if (!form.integration_id) pickIntegration(integrations.value[0]?.id || '');
                    // The integration data fills the tile body once this is on — no room
                    // left for an iframe embed of the link itself.
                    if (form.open_mode === 'iframe') update('open_mode', 'newtab');
                  }
                }}
              />
              Include integration data
            </label>

            {includeIntegration && (
              <div class="tile-config-repeat">
                <label>
                  Integration
                  <select value={form.integration_id} onChange={(e) => pickIntegration(e.target.value)}>
                    {integrations.value.length === 0 && <option value="">No integrations configured</option>}
                    {integrations.value.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>

                {viewKeys.length > 0 && (
                  <div class="multiselect-field">
                    <span class="multiselect-label">Show</span>
                    {viewKeys.map((k) => (
                      <label key={k} class="checkbox-field">
                        <input type="checkbox" checked={form.views.includes(k)} onChange={() => toggleView(k)} />
                        {viewCatalog[k]}
                      </label>
                    ))}
                    <p class="field-hint">
                      Nothing checked uses the first view. Check several to stack them in one tile.
                    </p>
                    <p class="field-hint">
                      Stats and now-playing views get extra height automatically so nothing scrolls;
                      queues and lists keep the size you pick below.
                    </p>
                  </div>
                )}

                {singleViewKey && mergeCandidates.length > 0 && (
                  <div class="multiselect-field">
                    <span class="multiselect-label">Also include</span>
                    {mergeCandidates.map((i) => (
                      <label key={i.id} class="checkbox-field">
                        <input
                          type="checkbox"
                          checked={form.moreIntegrationIds.includes(i.id)}
                          onChange={() => toggleMergeIntegration(i.id)}
                        />
                        {i.name}
                      </label>
                    ))}
                    <p class="field-hint">
                      Merges {(viewCatalog[singleViewKey] || '').toLowerCase()} from these into the same tile.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <label>
          Size
          <select value={form.size} onChange={(e) => update('size', e.target.value)}>
            {Object.keys(SIZE_PRESETS).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>

        {isLink && (
          <label>
            Open in
            <select value={form.open_mode} onChange={(e) => update('open_mode', e.target.value)}>
              <option value="newtab">New tab</option>
              <option value="same">Same tab</option>
              {!includeIntegration && <option value="iframe">Embed as iframe</option>}
            </select>
          </label>
        )}

        {isLink && !includeIntegration && form.open_mode === 'iframe' && (
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
            <div class="tile-group-picker">
              <span class="tile-config-repeat-label">Group</span>
              <p class="field-hint">Tiles in the same group share a heading. Rename or remove a group from its heading while editing the page.</p>
              <label class="radio-field">
                <input
                  type="radio"
                  name="tile-group"
                  checked={!newGroup && !form.group}
                  onChange={() => {
                    setNewGroup(false);
                    update('group', '');
                  }}
                />
                None
              </label>
              {existingGroups.map((g) => (
                <label class="radio-field" key={g}>
                  <input
                    type="radio"
                    name="tile-group"
                    checked={!newGroup && form.group === g}
                    onChange={() => {
                      setNewGroup(false);
                      update('group', g);
                    }}
                  />
                  {g}
                </label>
              ))}
              <label class="radio-field">
                <input
                  type="radio"
                  name="tile-group"
                  checked={newGroup}
                  onChange={() => {
                    setNewGroup(true);
                    update('group', '');
                  }}
                />
                New group…
              </label>
              {newGroup && (
                <input
                  class="tile-group-new-input"
                  autofocus
                  placeholder="Group name"
                  value={form.group}
                  onInput={(e) => update('group', e.target.value)}
                />
              )}
            </div>
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
              <label>
                Text color
                <input
                  type="color"
                  value={form.appearance.textColor || '#cccccc'}
                  onInput={(e) => updateAppearance('textColor', e.target.value)}
                />
                {isHexColor(form.appearance.textColor) && <ContrastHint color={form.appearance.textColor} />}
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
              onClick={() =>
                setForm((f) => ({ ...f, appearance: { accent: '', iconBg: '', textColor: '', hideTitle: false } }))
              }
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
