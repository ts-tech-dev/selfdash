import { useState } from 'preact/hooks';
import { SIZE_PRESETS, sizeKeyFromWH } from '../../src/shared/tileSizes.js';
import { api } from '../api.js';
import { integrations } from '../store.js';

const ASPECT_RATIOS = ['16/9', '4/3', '1/1', '21/9'];
const DEFAULT_IFRAME_CONFIG = {
  sizing: 'aspect',
  aspectRatio: '16/9',
  height: 400,
  sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
};

export function TileModal({ tile, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    kind: tile?.type === 'widget' ? 'widget' : 'link',
    title: tile?.title || '',
    url: tile?.url || '',
    icon: tile?.icon || '',
    description: tile?.description || '',
    size: tile ? sizeKeyFromWH(tile.w, tile.h) : 'M',
    open_mode: tile?.open_mode || 'newtab',
    iframe: { ...DEFAULT_IFRAME_CONFIG, ...(tile?.open_mode === 'iframe' ? tile.config : {}) },
    integration_id: tile?.integration_id || integrations.value[0]?.id || '',
  });
  const [uploading, setUploading] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateIframe(field, value) {
    setForm((f) => ({ ...f, iframe: { ...f.iframe, [field]: value } }));
  }

  async function onIconFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload(file);
      update('icon', url);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    const { w, h } = SIZE_PRESETS[form.size];

    if (form.kind === 'widget') {
      if (!form.integration_id) return;
      onSave({ type: 'widget', title: form.title.trim(), integration_id: Number(form.integration_id), w, h });
      return;
    }

    if (!form.url.trim()) return;
    onSave({
      type: 'link',
      title: form.title.trim(),
      url: form.url.trim(),
      icon: form.icon.trim() || null,
      description: form.description.trim() || null,
      open_mode: form.open_mode,
      w,
      h,
      config: form.open_mode === 'iframe' ? form.iframe : undefined,
    });
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <form class="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{tile ? 'Edit tile' : 'Add tile'}</h2>
        {!tile && (
          <label>
            Tile type
            <select value={form.kind} onChange={(e) => update('kind', e.target.value)}>
              <option value="link">Link</option>
              <option value="widget">Widget (from integration)</option>
            </select>
          </label>
        )}
        <label>
          Title
          <input value={form.title} onInput={(e) => update('title', e.target.value)} />
        </label>
        {form.kind === 'widget' ? (
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
        ) : (
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
            <label>
              Icon URL
              <input value={form.icon} onInput={(e) => update('icon', e.target.value)} />
            </label>
            <label>
              Or upload an icon
              <input type="file" accept="image/*" onChange={onIconFile} disabled={uploading} />
            </label>
            <label>
              Description
              <input value={form.description} onInput={(e) => update('description', e.target.value)} />
            </label>
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
        {form.kind === 'link' && (
          <label>
            Open in
            <select value={form.open_mode} onChange={(e) => update('open_mode', e.target.value)}>
              <option value="newtab">New tab</option>
              <option value="same">Same tab</option>
              <option value="iframe">Embed as iframe</option>
            </select>
          </label>
        )}
        {form.kind === 'link' && form.open_mode === 'iframe' && (
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
